/**
 * Couche « God dev » — améliorations progressives, sans dépendance.
 *
 *  • charge god.css (verre, boutons, transitions de page) ;
 *  • barre de progression de lecture (animée en CSS pur) ;
 *  • titre de page animé mot par mot (ignoré si mouvement réduit) ;
 *  • lazy loading + décodage asynchrone des images et iframes ;
 *  • préchargement des pages internes au survol / au toucher.
 *
 * Tout est entouré de garde-fous : une erreur ici ne doit jamais casser une page.
 */

const root = document.documentElement;
const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const saveData = Boolean(navigator.connection?.saveData) || root.dataset.saver === "true";

function loadStyles() {
  if (document.getElementById("god-styles")) return;
  const link = document.createElement("link");
  link.id = "god-styles";
  link.rel = "stylesheet";
  link.href = "/assets/css/god.css";
  document.head.append(link);
}

function addProgressBar() {
  if (reduceMotion || saveData || document.querySelector(".god-progress")) return;
  const bar = document.createElement("div");
  bar.className = "god-progress";
  bar.setAttribute("aria-hidden", "true");
  document.body.append(bar);
}

function splitHeading() {
  if (reduceMotion) return;
  const heading = document.querySelector("main h1");
  if (!heading || heading.dataset.godSplit || heading.children.length) return;
  const text = heading.textContent.trim();
  if (!text || text.length > 140) return;
  const style = getComputedStyle(heading);
  // Un texte en dégradé (background-clip: text) serait cassé par le découpage.
  if (style.webkitBackgroundClip === "text" || style.backgroundClip === "text") return;

  heading.dataset.godSplit = "1";
  heading.textContent = "";
  text.split(/\s+/).forEach((word, index) => {
    const outer = document.createElement("span");
    outer.className = "god-word";
    const inner = document.createElement("span");
    inner.style.setProperty("--i", String(index));
    inner.textContent = word;
    outer.append(inner);
    heading.append(outer, " ");
  });
}

function optimizeMedia(scope = document) {
  const firstImage = document.querySelector("main img");
  scope.querySelectorAll?.("img:not([loading]), iframe:not([loading])").forEach((element) => {
    const aboveTheFold = element === firstImage || element.closest(".site-header") || element.hasAttribute("fetchpriority");
    if (aboveTheFold) return;
    element.loading = "lazy";
    if (element.tagName === "IMG" && !element.hasAttribute("decoding")) element.decoding = "async";
  });
}

function watchMedia() {
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      optimizeMedia();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function prefetchOnIntent() {
  if (saveData || !document.createElement("link").relList?.supports?.("prefetch")) return;
  const seen = new Set();
  const warm = (event) => {
    const link = event.target.closest?.("a[href]");
    if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
    if (url.pathname === location.pathname && url.search === location.search) return;
    if (seen.has(url.href)) return;
    seen.add(url.href);
    const hint = document.createElement("link");
    hint.rel = "prefetch";
    hint.href = url.href;
    document.head.append(hint);
  };
  document.addEventListener("pointerover", warm, { passive: true });
  document.addEventListener("touchstart", warm, { passive: true });
}

export function initGod() {
  try {
    loadStyles();
    addProgressBar();
    splitHeading();
    optimizeMedia();
    watchMedia();
    prefetchOnIntent();
  } catch (error) {
    console.warn("[god] amélioration ignorée :", error);
  }
}

export default initGod;
