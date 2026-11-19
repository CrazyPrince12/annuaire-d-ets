/**
 * Point d'entrée unique chargé par toutes les pages.
 *
 * 1. applique le thème avant tout rendu visible ;
 * 2. traduit la page, construit en-tête et pied de page ;
 * 3. branche recherche, favoris, comparateur, partage, réseau ;
 * 4. charge le module de la page (`<body data-page="…">`).
 *
 * Les modules de page sont importés dynamiquement : une page ne télécharge que
 * son code et les composants qu'elle utilise réellement.
 */

import { FEATURES, UI } from "./config.js";
import { initTheme } from "./theme.js";
import { applyTranslations, t } from "./i18n.js";
import { initNav } from "./nav.js";
import { initSearch } from "./search.js";
import { initFavorites } from "./favorites.js";
import { toast } from "./toast.js";
import { $, revealOnScroll, announce, hydrateIcons, errorMessage } from "./ui.js";

/* 1 — thème (évite tout clignotement clair/sombre) */
initTheme();

/* 2 — langue + chrome partagé */
applyTranslations();
hydrateIcons();

const PAGES = {
  home: () => import("../pages/home.js"),
  explorer: () => import("../pages/explorer.js"),
  company: () => import("../pages/company.js"),
  map: () => import("../pages/map.js"),
  offers: () => import("../pages/offers.js"),
  offer: () => import("../pages/offer.js"),
  cities: () => import("../pages/cities.js"),
  city: () => import("../pages/city.js"),
  sectors: () => import("../pages/sectors.js"),
  sector: () => import("../pages/sector.js"),
  reviews: () => import("../pages/reviews.js"),
  compare: () => import("../pages/compare.js"),
  contribute: () => import("../pages/contribute.js"),
  contact: () => import("../pages/contact.js"),
  login: () => import("../pages/login.js"),
  account: () => import("../pages/account.js"),
  business: () => import("../pages/business.js"),
  premium: () => import("../pages/premium.js"),
  admin: () => import("../pages/admin.js"),
};

async function boot() {
  initSearch();
  initFavorites();
  const userReady = initNav();

  // Révélations au défilement (dégradé si l'API manque).
  revealOnScroll();
  const observer = new MutationObserver(() => {
    revealOnScroll();
    hydrateIcons();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Bouton « haut de page ».
  const top = $("[data-back-to-top]");
  if (top) {
    top.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
      $("main")?.focus?.({ preventScroll: true });
    });
  }

  // Liens externes : on garantit `noopener` et l'annonce du nouvel onglet.
  document.querySelectorAll('a[target="_blank"]').forEach((link) => {
    link.rel = "noopener noreferrer";
    if (!link.getAttribute("aria-label") && link.textContent.trim()) {
      link.setAttribute("aria-label", `${link.textContent.trim()} (${t("a11y.external")})`);
    }
  });

  // Service worker (PWA) — uniquement en production et si l'API existe.
  if (FEATURES.serviceWorker && "serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => null);
    });
  }

  const page = document.body.dataset.page;
  const loader = page && PAGES[page];
  if (loader) {
    try {
      const module = await loader();
      const user = ["account", "admin", "business", "offer", "premium"].includes(page) ? await userReady : null;
      await module.init?.({ user, userReady });
    } catch (error) {
      console.error(`[app] page « ${page} » :`, error);
      const host = $("[data-page-error]");
      if (host) {
        host.hidden = false;
        host.innerHTML = `<div class="error-state" role="alert"><h3>${t("common.error")}</h3><p>${errorMessage(
          error
        )}</p><button type="button" class="btn btn-secondary sm" onclick="location.reload()">${t(
          "common.retry"
        )}</button></div>`;
      }
      toast.error(errorMessage(error));
    }
  }
}

// Erreurs non interceptées : on informe sans casser la navigation.
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  if (reason && (reason.name === "AbortError" || reason.offline === true)) return;
  console.warn("[app] promesse non gérée :", reason);
});

window.addEventListener("error", (event) => {
  if (event.target && event.target.tagName === "IMG") {
    event.target.classList.add("img-error");
  }
});

// Annonce discrète pour les lecteurs d'écran quand la page change de section.
window.addEventListener("cg:announce", (event) => announce(event.detail?.message || ""));

boot();

export { UI };
