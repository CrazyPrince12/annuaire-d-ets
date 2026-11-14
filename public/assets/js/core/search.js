/**
 * Palette de recherche (superposition plein écran).
 *
 * Ouverture par le bouton d'en-tête, la touche « / » ou ⌘/Ctrl + K.
 * Frappe → `/api/suggest` (anti-rebond) ; Entrée → page Explorateur.
 * Le clavier se pilote entièrement : ↑ ↓ Entrée Échap.
 */

import { UI } from "./config.js";
import { t, formatNumber } from "./i18n.js";
import { icon } from "./icons.js";
import { get } from "./api.js";
import * as storage from "./storage.js";
import { $, $$, esc, debounce, starsHtml } from "./ui.js";

let overlay = null;
let input = null;
let results = null;
let items = [];
let activeIndex = -1;
let lastFocused = null;

function uniqRecent() {
  const list = storage.read(storage.KEYS.recent, []);
  return Array.isArray(list) ? list.filter((v) => typeof v === "string").slice(0, UI.maxRecentSearches) : [];
}

function pushRecent(term) {
  const value = String(term || "").trim();
  if (!value) return;
  const list = uniqRecent().filter((item) => item.toLowerCase() !== value.toLowerCase());
  list.unshift(value);
  storage.write(storage.KEYS.recent, list.slice(0, UI.maxRecentSearches));
}

function overlayMarkup() {
  return `
  <div class="search-overlay" role="dialog" aria-modal="true" aria-label="${esc(t("search.title"))}">
    <div class="container" style="display:flex;flex-direction:column;flex:1;min-height:0">
      <div class="search-overlay-head">
        <span class="input-icon" style="flex:1">
          ${icon("search", { size: 18 })}
          <input class="input" type="search" name="q" autocomplete="off" enterkeyhint="search"
                 aria-label="${esc(t("search.title"))}" aria-controls="search-results"
                 placeholder="${esc(t("search.placeholder"))}" />
        </span>
        <button type="button" class="icon-btn" data-close-search aria-label="${esc(t("common.close"))}">
          ${icon("x", { size: 22 })}
        </button>
      </div>
      <div class="results" id="search-results" role="listbox" aria-label="${esc(t("search.suggestions"))}"></div>
    </div>
  </div>`;
}

function recentMarkup() {
  const recent = uniqRecent();
  return `
    <div class="suggest-group">
      <h4>${t("search.recent")}
        ${recent.length ? `<button type="button" class="link small" data-clear-recent>${t("search.clearRecent")}</button>` : ""}
      </h4>
      ${
        recent.length
          ? recent
              .map(
                (term) =>
                  `<button type="button" class="suggest-item" role="option" data-term="${esc(term)}">
                    ${icon("clock", { size: 16 })}<span>${esc(term)}</span></button>`
              )
              .join("")
          : `<p class="notice-small">${t("search.hint")}</p>`
      }
    </div>
    <div class="suggest-group">
      <h4>${t("nav.explore")}</h4>
      <a class="suggest-item" href="/explorer?verified=1">${icon("badgeCheck", { size: 16 })}<span>${t(
        "home.featured.title"
      )}</span></a>
      <a class="suggest-item" href="/offres">${icon("briefcase", { size: 16 })}<span>${t("home.offers.title")}</span></a>
      <a class="suggest-item" href="/carte">${icon("map", { size: 16 })}<span>${t("nav.map")}</span></a>
    </div>`;
}

function paint(html) {
  results.innerHTML = html;
  items = $$("[data-index], .suggest-item", results);
  items.forEach((node, index) => node.setAttribute("data-index", String(index)));
  activeIndex = -1;
}

function emptyMarkup(term) {
  return `
    <div class="suggest-group">
      <h4>${t("search.noSuggestion")}</h4>
      <p class="notice-small">${t("common.emptyHint")}</p>
      <a class="suggest-item" href="/explorer?q=${encodeURIComponent(term)}">
        ${icon("search", { size: 16 })}<span>${esc(t("search.allIn", { q: term }))}</span></a>
    </div>`;
}

function suggestionMarkup(data) {
  const parts = [];
  if (data.corrected) {
    parts.push(`
      <div class="suggest-group">
        <h4>${t("search.typoHint")}</h4>
        <button type="button" class="suggest-item" data-term="${esc(data.corrected.name)}">
          ${icon("sparkles", { size: 16 })}<span>${esc(data.corrected.name)}</span>
          <span class="meta">${esc(data.corrected.kind || "")}</span>
        </button>
      </div>`);
  }

  if (data.companies?.length) {
    parts.push(`
      <div class="suggest-group">
        <h4>${t("search.companies")}</h4>
        ${data.companies
          .map(
            (company) => `
          <a class="suggest-item" href="/entreprises/${encodeURIComponent(company.slug)}">
            ${icon("building2", { size: 16 })}
            <span>${esc(company.name)}</span>
            <span class="meta">${esc([company.sector_name, company.city_name].filter(Boolean).join(" · "))}</span>
            ${
              company.rating_count >= 3
                ? `<span class="meta">${icon("star", { size: 12 })} ${Number(company.rating_avg).toFixed(1)}</span>`
                : ""
            }
          </a>`
          )
          .join("")}
      </div>`);
  }

  if (data.sectors?.length) {
    parts.push(`
      <div class="suggest-group">
        <h4>${t("search.categories")}</h4>
        ${data.sectors
          .map(
            (sector) => `
          <a class="suggest-item" href="/explorer?sector=${encodeURIComponent(sector.slug)}">
            ${icon("tag", { size: 16 })}<span>${esc(sector.name)}</span>
          </a>`
          )
          .join("")}
      </div>`);
  }

  if (data.neighborhoods?.length) {
    parts.push(`
      <div class="suggest-group">
        <h4>${t("cities.quarters")}</h4>
        ${data.neighborhoods
          .map(
            (hood) => `
          <a class="suggest-item" href="/explorer?city=${encodeURIComponent(hood.city_slug)}&q=${encodeURIComponent(
            hood.name
          )}">
            ${icon("mapPin", { size: 16 })}<span>${esc(hood.name)}</span>
            <span class="meta">${esc(hood.city_name)}</span>
          </a>`
          )
          .join("")}
      </div>`);
  }

  if (data.offers?.length) {
    parts.push(`
      <div class="suggest-group">
        <h4>${t("nav.offers")}</h4>
        ${data.offers
          .map(
            (offer) => `
          <a class="suggest-item" href="/offres/${encodeURIComponent(offer.slug)}">
            ${icon("briefcase", { size: 16 })}<span>${esc(offer.title)}</span>
            <span class="meta">${esc(offer.company_name)}</span>
          </a>`
          )
          .join("")}
      </div>`);
  }

  if (!parts.length) return emptyMarkup(data.q || "");
  parts.push(`
    <a class="suggest-item" href="/explorer?q=${encodeURIComponent(data.q || "")}">
      ${icon("search", { size: 16 })}<span>${esc(t("search.allIn", { q: data.q || "" }))}</span></a>`);
  return parts.join("");
}

const runSearch = debounce(async (term) => {
  if (!term || term.length < UI.searchMinChars) {
    paint(recentMarkup());
    return;
  }
  results.dataset.loading = "true";
  try {
    const data = await get("/suggest", { params: { q: term }, cacheMs: 60_000 });
    if (input.value.trim() !== term) return;
    paint(suggestionMarkup(data));
  } catch {
    paint(emptyMarkup(term));
  } finally {
    results.dataset.loading = "false";
  }
}, UI.suggestDebounce);

function submit(term) {
  const value = String(term || input.value || "").trim();
  if (!value) return;
  pushRecent(value);
  location.href = `/explorer?q=${encodeURIComponent(value)}`;
}

function move(delta) {
  if (!items.length) return;
  activeIndex = (activeIndex + delta + items.length) % items.length;
  items.forEach((node, index) => {
    const active = index === activeIndex;
    node.setAttribute("aria-selected", String(active));
    if (active) node.scrollIntoView({ block: "nearest" });
  });
}

export function openSearch(prefill = "") {
  if (!overlay) {
    document.body.insertAdjacentHTML("beforeend", overlayMarkup());
    overlay = $(".search-overlay");
    input = overlay.querySelector("input");
    results = overlay.querySelector(".results");
    lastFocused = document.activeElement;

    input.addEventListener("input", () => runSearch(input.value.trim()));
    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        move(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (activeIndex >= 0 && items[activeIndex]) {
          items[activeIndex].click();
        } else submit();
      }
    });

    results.addEventListener("click", (event) => {
      const termButton = event.target.closest("[data-term]");
      if (termButton) {
        event.preventDefault();
        input.value = termButton.dataset.term;
        submit(termButton.dataset.term);
        return;
      }
      if (event.target.closest("[data-clear-recent]")) {
        event.preventDefault();
        storage.write(storage.KEYS.recent, []);
        paint(recentMarkup());
      }
    });

    overlay.querySelector("[data-close-search]").addEventListener("click", closeSearch);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeSearch();
    });

    paint(recentMarkup());
  }

  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  if (prefill) input.value = prefill;
  requestAnimationFrame(() => input.focus({ preventScroll: true }));
  if (prefill) runSearch(prefill);
}

export function closeSearch() {
  if (!overlay) return;
  overlay.hidden = true;
  document.body.style.overflow = "";
  lastFocused?.focus?.({ preventScroll: true });
}

export function initSearch() {
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-open-search]")) {
      event.preventDefault();
      openSearch();
    }
  });

  document.addEventListener("keydown", (event) => {
    const typing =
      event.target.matches?.("input, textarea, select, [contenteditable='true']") || event.target.isContentEditable;
    if (event.key === "/" && !typing) {
      event.preventDefault();
      openSearch();
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openSearch();
    } else if (event.key === "Escape" && overlay && !overlay.hidden) {
      closeSearch();
    }
  });

  // Raccourci visuel : bouton de recherche de l'en-tête si présent.
  window.addEventListener("cg:lang", () => {
    if (overlay) {
      overlay.querySelector("input").placeholder = t("search.placeholder");
      paint(recentMarkup());
    }
  });
}

export default { initSearch, openSearch, closeSearch };
