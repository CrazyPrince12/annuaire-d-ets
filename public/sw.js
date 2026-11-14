/**
 * Service worker CONGLOMERAT.
 *
 * Stratégies :
 *   - coquille applicative (HTML + CSS + JS + police + icônes) : cache d'abord,
 *     mise à jour en arrière-plan (`stale-while-revalidate`) ;
 *   - appels `/api/*` : réseau uniquement — jamais de données périmées ;
 *   - navigation hors ligne : dernière page connue, sinon page « hors ligne ».
 *
 * Le numéro de version change à chaque déploiement du fichier : les anciens
 * caches sont supprimés à l'activation.
 */

const VERSION = "v1-2026-11";
const SHELL_CACHE = `conglomerat-shell-${VERSION}`;
const PAGE_CACHE = `conglomerat-pages-${VERSION}`;
const OFFLINE_URL = "/hors-ligne";

const SHELL_ASSETS = [
  "/",
  OFFLINE_URL,
  "/assets/css/tokens.css",
  "/assets/css/base.css",
  "/assets/css/components.css",
  "/assets/css/pages.css",
  "/assets/js/core/app.js",
  "/assets/js/core/api.js",
  "/assets/js/core/config.js",
  "/assets/js/core/i18n.js",
  "/assets/js/core/icons.js",
  "/assets/js/core/ui.js",
  "/assets/js/core/nav.js",
  "/assets/js/core/search.js",
  "/assets/js/core/storage.js",
  "/assets/js/core/theme.js",
  "/assets/js/core/toast.js",
  "/assets/js/core/favorites.js",
  "/assets/js/core/map.js",
  "/assets/js/core/constants.js",
  "/assets/img/logo-mark.svg",
  "/assets/img/favicon-32.png",
  "/assets/img/icon-192.png",
  "/assets/img/icon-512.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // `addAll` échoue en bloc : on ajoute chaque ressource séparément pour
      // qu'un fichier manquant ne casse pas l'installation.
      await Promise.all(
        SHELL_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => null)
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !key.endsWith(VERSION))
          .map((key) => caches.delete(key))
      );
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(() => null);
      }
      await self.clients.claim();
    })()
  );
});

function isShellAsset(url) {
  return (
    url.pathname.startsWith("/assets/") || url.pathname === "/manifest.webmanifest"
  );
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || network || Response.error();
}

async function handleNavigation(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response("Hors ligne", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Les données ne sont jamais servies depuis le cache.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (isShellAsset(url)) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});
