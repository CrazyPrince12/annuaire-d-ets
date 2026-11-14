/**
 * Favoris et comparateur — stockés en local (aucun compte requis), puis
 * synchronisés avec `/api/me-favorites` si la personne est connectée.
 *
 * Les éléments portent `data-favorite="slug"` ou `data-compare="slug"` :
 * un seul écouteur délégué suffit, ce qui fonctionne aussi pour les cartes
 * injectées après coup par les appels API.
 */

import { UI } from "./config.js";
import { t } from "./i18n.js";
import { icon } from "./icons.js";
import { toast } from "./toast.js";
import * as storage from "./storage.js";
import { $, $$, esc, announce } from "./ui.js";

/* ------------------------------------------------------------------ lecture */

export function favorites() {
  const list = storage.read(storage.KEYS.favorites, []);
  return Array.isArray(list) ? list.filter((item) => item && item.slug) : [];
}

export function isFavorite(slug) {
  return favorites().some((item) => item.slug === slug);
}

export function compareList() {
  const list = storage.read(storage.KEYS.compare, []);
  return Array.isArray(list) ? list.filter((item) => item && item.slug) : [];
}

export function inCompare(slug) {
  return compareList().some((item) => item.slug === slug);
}

/* -------------------------------------------------------------- écritures */

function persistFavorites(items) {
  storage.write(storage.KEYS.favorites, items);
  syncBadges();
  window.dispatchEvent(new CustomEvent("cg:favorites", { detail: { items } }));
  // Copie côté compte si connecté (silencieux : les favoris locaux restent la vérité).
  import("./api.js")
    .then(({ post, get, session }) =>
      session()
        .then((data) => {
          if (!data?.user) return null;
          return get("/me-favorites").then((remote) => {
            const known = new Set((remote.companies || []).map((c) => c.slug));
            const missing = items.filter((item) => item.type !== "job" && !known.has(item.slug));
            return Promise.all(
              missing.slice(0, 20).map((item) =>
                post("/me-favorites", { type: "company", slug: item.slug }).catch(() => null)
              )
            );
          });
        })
        .catch(() => null)
    )
    .catch(() => null);
}

export function toggleFavorite(company) {
  if (!company || !company.slug) return false;
  const items = favorites();
  const index = items.findIndex((item) => item.slug === company.slug);
  if (index >= 0) {
    items.splice(index, 1);
    toast.info(t("toast.favoriteRemoved"));
  } else {
    items.unshift({
      slug: company.slug,
      name: company.name || company.slug,
      city: company.city?.name || "",
      sector: company.sector?.name || "",
      addedAt: new Date().toISOString(),
    });
    toast.success(t("toast.favoriteAdded"));
  }
  persistFavorites(items);
  return index < 0;
}

export function removeFavorite(slug) {
  persistFavorites(favorites().filter((item) => item.slug !== slug));
}

export function clearFavorites() {
  persistFavorites([]);
}

export function toggleCompare(company) {
  if (!company || !company.slug) return null;
  const items = compareList();
  const index = items.findIndex((item) => item.slug === company.slug);
  if (index >= 0) {
    items.splice(index, 1);
    storage.write(storage.KEYS.compare, items);
    renderCompareBar();
    window.dispatchEvent(new CustomEvent("cg:compare", { detail: { items } }));
    return "removed";
  }
  if (items.length >= UI.maxCompare) {
    toast.warning(t("compare.full", { max: UI.maxCompare }));
    return "full";
  }
  items.push({
    slug: company.slug,
    name: company.name || company.slug,
    city: company.city?.name || "",
    sector: company.sector?.name || "",
  });
  storage.write(storage.KEYS.compare, items);
  renderCompareBar();
  toast.success(t("compare.added"));
  window.dispatchEvent(new CustomEvent("cg:compare", { detail: { items } }));
  return "added";
}

export function clearCompare() {
  storage.write(storage.KEYS.compare, []);
  renderCompareBar();
  window.dispatchEvent(new CustomEvent("cg:compare", { detail: { items: [] } }));
}

export function removeFromCompare(slug) {
  storage.write(
    storage.KEYS.compare,
    compareList().filter((item) => item.slug !== slug)
  );
  renderCompareBar();
  window.dispatchEvent(new CustomEvent("cg:compare", { detail: { items: compareList() } }));
}

/* ------------------------------------------------------------ affichage */

function syncBadges() {
  const count = favorites().length;
  $$("[data-favorites-count]").forEach((node) => {
    node.textContent = String(count);
    node.hidden = count === 0;
  });
  const compareCount = compareList().length;
  $$("[data-compare-count]").forEach((node) => {
    node.textContent = String(compareCount);
    node.hidden = compareCount === 0;
  });
}

function ensureCompareBar() {
  let bar = $("#compare-bar");
  if (bar) return bar;
  bar = document.createElement("div");
  bar.id = "compare-bar";
  bar.className = "compare-bar";
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", t("compare.title"));
  bar.hidden = true;
  document.body.appendChild(bar);
  return bar;
}

export function renderCompareBar() {
  const items = compareList();
  const bar = ensureCompareBar();
  if (!items.length) {
    bar.hidden = true;
    bar.innerHTML = "";
    syncBadges();
    return;
  }
  bar.hidden = false;
  bar.innerHTML = `
    <div class="items">
      ${items
        .map(
          (item) => `
        <span class="compare-pill">
          <span>${esc(item.name)}</span>
          <button type="button" data-compare-remove="${esc(item.slug)}"
                  aria-label="${t("compare.remove")} — ${esc(item.name)}">${icon("x", { size: 13 })}</button>
        </span>`
        )
        .join("")}
    </div>
    <div class="compare-actions">
      <button type="button" class="btn btn-ghost sm" data-compare-clear>${t("compare.clear")}</button>
      <a class="btn btn-primary sm" href="/comparer">${icon("scale", { size: 15 })} ${t("compare.title")}</a>
    </div>
  `;
  syncBadges();
}

/* ------------------------------------------------------------- amorçage */

function markButton(button, pressed) {
  button.setAttribute("aria-pressed", String(pressed));
  const isFav = button.hasAttribute("data-favorite");
  const label = isFav
    ? t(pressed ? "company.favoriteRemove" : "company.favoriteAdd")
    : t(pressed ? "compare.remove" : "company.compareAdd");
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
}

export function refreshButtons(root = document) {
  $$("[data-favorite]", root).forEach((btn) => markButton(btn, isFavorite(btn.dataset.favorite)));
  $$("[data-compare]", root).forEach((btn) => markButton(btn, inCompare(btn.dataset.compare)));
}

export function initFavorites() {
  refreshButtons();
  renderCompareBar();

  document.addEventListener("click", (event) => {
    const favBtn = event.target.closest("[data-favorite]");
    if (favBtn) {
      event.preventDefault();
      const slug = favBtn.dataset.favorite;
      const card = favBtn.closest("[data-company]");
      const company = {
        slug,
        name: card?.querySelector("h3 a")?.textContent?.trim() || favBtn.dataset.name || slug,
        city: { name: favBtn.dataset.city || "" },
        sector: { name: favBtn.dataset.sector || "" },
      };
      const added = toggleFavorite(company);
      markButton(favBtn, added);
      announce(added ? t("company.favorited") : t("company.unfavorited"));
      return;
    }

    const compareBtn = event.target.closest("[data-compare]");
    if (compareBtn) {
      event.preventDefault();
      const slug = compareBtn.dataset.compare;
      const card = compareBtn.closest("[data-company]");
      const company = {
        slug,
        name: card?.querySelector("h3 a")?.textContent?.trim() || compareBtn.dataset.name || slug,
        city: { name: compareBtn.dataset.city || "" },
        sector: { name: compareBtn.dataset.sector || "" },
      };
      const result = toggleCompare(company);
      if (result) markButton(compareBtn, result === "added");
      return;
    }

    const removeBtn = event.target.closest("[data-compare-remove]");
    if (removeBtn) {
      event.preventDefault();
      removeFromCompare(removeBtn.dataset.compareRemove);
      return;
    }

    if (event.target.closest("[data-compare-clear]")) {
      event.preventDefault();
      clearCompare();
    }
  });

  window.addEventListener("cg:lang", () => {
    refreshButtons();
    renderCompareBar();
  });
}

export default {
  initFavorites,
  favorites,
  isFavorite,
  toggleFavorite,
  compareList,
  inCompare,
  toggleCompare,
  renderCompareBar,
  refreshButtons,
};
