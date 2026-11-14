/**
 * Explorateur — recherche + filtres + tri + pagination.
 *
 * L'état vit dans l'URL (partageable, indexable, bouton Retour fonctionnel) :
 *   /explorer?q=plombier&ville=yaounde&secteur=btp&note=4&verif=verified&tri=notes&page=2
 */

import { get, post } from "../core/api.js";
import { t, formatNumber } from "../core/i18n.js";
import { icon } from "../core/icons.js";
import { toast } from "../core/toast.js";
import * as storage from "../core/storage.js";
import {
  $,
  $$,
  esc,
  companyCard,
  skeletonCards,
  emptyState,
  errorState,
  errorMessage,
  debounce,
  revealOnScroll,
  setLoading,
  announce,
} from "../core/ui.js";

const SORTS = [
  ["pertinence", "explore.sort.relevance"],
  ["notes", "explore.sort.rating"],
  ["populaires", "explore.sort.popular"],
  ["recentes", "explore.sort.recent"],
  ["recrutent", "explore.sort.hiring"],
];

const state = {
  q: "",
  ville: "",
  secteur: "",
  quartier: "",
  note: "",
  verif: "",
  tri: "pertinence",
  page: 1,
  vue: "grille",
};

let meta = null;
let total = 0;
let pages = 1;
let loading = false;

/* ------------------------------------------------------------------- état */

function readState() {
  const params = new URLSearchParams(location.search);
  state.q = params.get("q") || "";
  state.ville = params.get("ville") || params.get("city") || "";
  state.secteur = params.get("secteur") || params.get("sector") || "";
  state.quartier = params.get("quartier") || "";
  state.note = params.get("note") || "";
  state.verif = params.get("verif") || "";
  state.tri = params.get("tri") || "pertinence";
  state.page = Math.max(1, Number(params.get("page")) || 1);
  state.vue = params.get("vue") === "liste" ? "liste" : storage.read(storage.KEYS.view, "grille");
}

function writeState({ push = true } = {}) {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.ville) params.set("ville", state.ville);
  if (state.secteur) params.set("secteur", state.secteur);
  if (state.quartier) params.set("quartier", state.quartier);
  if (state.note) params.set("note", state.note);
  if (state.verif) params.set("verif", state.verif);
  if (state.tri && state.tri !== "pertinence") params.set("tri", state.tri);
  if (state.page > 1) params.set("page", String(state.page));
  const url = `/explorer${params.toString() ? `?${params}` : ""}`;
  if (push) history.pushState({}, "", url);
  else history.replaceState({}, "", url);
  storage.write(storage.KEYS.view, state.vue);
}

/* ------------------------------------------------------------------ rendu */

function cityOptions() {
  return (meta?.cities || [])
    .filter((city) => city.companies > 0)
    .map(
      (city) =>
        `<label class="checkbox"><input type="radio" name="ville" value="${esc(city.slug)}" ${
          state.ville === city.slug ? "checked" : ""
        } /><span>${esc(city.name)}</span><span class="filter-count">${formatNumber(city.companies)}</span></label>`
    )
    .join("");
}

function sectorOptions() {
  return (meta?.sectors || [])
    .filter((sector) => sector.companies > 0)
    .map(
      (sector) => `
      <label class="checkbox">
        <input type="checkbox" name="secteur" value="${esc(sector.slug)}" ${
          state.secteur === sector.slug ? "checked" : ""
        } />
        <span>${esc(sector.name)}</span>
        <span class="filter-count">${formatNumber(sector.companies)}</span>
      </label>`
    )
    .join("");
}

function filtersMarkup() {
  return `
    <div class="filter-group">
      <details open>
        <summary>${t("explore.filters.city")} ${icon("chevronDown", { size: 16 })}</summary>
        <div class="filter-body">
          <label class="radio"><input type="radio" name="ville" value="" ${
            state.ville ? "" : "checked"
          } /><span>${t("common.all")}</span></label>
          ${cityOptions()}
        </div>
      </details>
    </div>

    <div class="filter-group">
      <details open>
        <summary>${t("explore.filters.sector")} ${icon("chevronDown", { size: 16 })}</summary>
        <div class="filter-body">${sectorOptions() || `<p class="notice-small">${t("common.empty")}</p>`}</div>
      </details>
    </div>

    <div class="filter-group">
      <details open>
        <summary>${t("explore.filters.rating")} ${icon("chevronDown", { size: 16 })}</summary>
        <div class="filter-body">
          ${[
            ["", "explore.filters.rating.any"],
            ["4", "explore.filters.rating.4"],
            ["3", "explore.filters.rating.3"],
            ["2", "explore.filters.rating.2"],
          ]
            .map(
              ([value, key]) => `
            <label class="radio"><input type="radio" name="note" value="${value}" ${
                state.note === value ? "checked" : ""
              } /><span>${t(key)}</span></label>`
            )
            .join("")}
        </div>
      </details>
    </div>

    <div class="filter-group">
      <details open>
        <summary>${t("common.filters")} ${icon("chevronDown", { size: 16 })}</summary>
        <div class="filter-body">
          <label class="checkbox">
            <input type="checkbox" name="verif" value="verified" ${state.verif === "verified" ? "checked" : ""} />
            <span>${t("explore.filters.verified")}</span>
          </label>
        </div>
      </details>
    </div>
  `;
}

function activeFilters() {
  const chips = [];
  if (state.q) chips.push(["q", `${t("search.title")} : ${state.q}`]);
  if (state.ville) {
    const city = (meta?.cities || []).find((item) => item.slug === state.ville);
    chips.push(["ville", city?.name || state.ville]);
  }
  if (state.quartier) chips.push(["quartier", state.quartier]);
  if (state.secteur) {
    const sector = (meta?.sectors || []).find((item) => item.slug === state.secteur);
    chips.push(["secteur", sector?.name || state.secteur]);
  }
  if (state.note) chips.push(["note", t(`explore.filters.rating.${state.note}`)]);
  if (state.verif) chips.push(["verif", t("explore.filters.verified")]);

  const host = $("#active-filters");
  if (!host) return;
  if (!chips.length) {
    host.hidden = true;
    host.innerHTML = "";
    return;
  }
  host.hidden = false;
  host.innerHTML =
    `<span class="faint small">${t("explore.activeFilters")}</span>` +
    chips
      .map(
        ([key, label]) => `
      <button type="button" class="chip is-active" data-remove-filter="${key}"
              aria-label="${t("explore.removeFilter", { name: label })}">
        ${esc(label)} <span class="chip-x">${icon("x", { size: 12 })}</span>
      </button>`
      )
      .join("") +
    `<button type="button" class="chip" data-reset-filters>${t("common.reset")}</button>`;
}

function countLabel(n) {
  const host = $("#results-count");
  if (!host) return;
  host.innerHTML = n === 1 ? t("explore.count.one") : t("explore.count", { n: formatNumber(n) });
}

function renderResults(data, { append = false } = {}) {
  const host = $("#results");
  if (!host) return;
  host.className = `company-list ${state.vue === "liste" ? "view-list" : "company-grid"}`;

  if (!data.items?.length) {
    host.innerHTML = emptyState({
      iconName: "search",
      title: t("explore.noResults"),
      text: t("explore.noResultsHint"),
      action: `<button type="button" class="btn btn-secondary sm" data-reset-filters>${t(
        "common.resetFilters"
      )}</button>`,
    });
    return;
  }

  const html = data.items.map((company) => companyCard(company)).join("");
  if (append) host.insertAdjacentHTML("beforeend", html);
  else host.innerHTML = html;
  revealOnScroll(host);
}

function renderNotices(data) {
  const host = $("#results-notice");
  if (!host) return;
  const notices = [];
  if (data.correctedQuery) {
    notices.push(
      `<div class="banner info">${icon("sparkles", { size: 16 })}
        <span>${t("search.typo", { term: esc(data.correctedQuery) })}</span>
        <a class="link" href="/explorer?q=${encodeURIComponent(data.correctedQuery)}">${t("common.apply")}</a>
      </div>`
    );
  }
  if (data.interpretation?.length) {
    notices.push(
      `<div class="banner info">${icon("sparkles", { size: 16 })}
        <span>${t("search.interpreting")}</span>
        ${data.interpretation
          .map((chip) => `<span class="badge badge-new">${esc(chip.label || chip.value)}</span>`)
          .join(" ")}
      </div>`
    );
  }
  host.innerHTML = notices.join("");
  host.hidden = notices.length === 0;
}

function renderPagination() {
  const wrap = $("#load-more-wrap");
  if (!wrap) return;
  const more = state.page < pages;
  wrap.hidden = !more;
  const btn = $("#load-more");
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `${t("explore.loadMore")} ${icon("chevronDown", { size: 16 })}`;
  }
}

/* ------------------------------------------------------------------ appels */

const params = () => ({
  q: state.q || undefined,
  ville: state.ville || undefined,
  secteur: state.secteur || undefined,
  quartier: state.quartier || undefined,
  note: state.note || undefined,
  verif: state.verif || undefined,
  tri: state.tri,
  page: state.page,
  limite: 24,
});

async function load({ append = false } = {}) {
  if (loading) return;
  loading = true;
  const host = $("#results");
  if (!append && host) host.innerHTML = skeletonCards(6);
  $("#results-notice").hidden = true;

  try {
    const data = await get("/companies", { params: params(), cacheMs: 20_000 });
    total = data.total || 0;
    pages = data.pages || 1;
    renderResults(data, { append });
    countLabel(total);
    renderNotices(data);
    renderPagination();
    activeFilters();
    if (append) announce(t("explore.count", { n: formatNumber(total) }));
  } catch (error) {
    if (host) {
      host.innerHTML = errorState({ text: errorMessage(error), retryAttr: "data-retry-results" });
      host.querySelector("[data-retry-results]")?.addEventListener("click", () => load({ append }));
    }
    toast.error(errorMessage(error));
  } finally {
    loading = false;
  }
}

/* -------------------------------------------------------------- interactions */

function syncControls() {
  $$('input[name="ville"]').forEach((input) => (input.checked = input.value === state.ville));
  $$('input[name="secteur"]').forEach((input) => (input.checked = input.value === state.secteur));
  $$('input[name="note"]').forEach((input) => (input.checked = input.value === state.note));
  $$('input[name="verif"]').forEach((input) => (input.checked = state.verif === "verified"));
  const sort = $("#sort-select");
  if (sort) sort.value = state.tri;
  const search = $("#explorer-search");
  if (search && search.value !== state.q) search.value = state.q;
  $$("[data-view]").forEach((btn) => btn.setAttribute("aria-pressed", String(btn.dataset.view === state.vue)));
  const list = $("#results");
  if (list) list.className = `company-list ${state.vue === "liste" ? "view-list" : "company-grid"}`;
}

function applyAndLoad({ append = false } = {}) {
  writeState({ push: !append });
  syncControls();
  load({ append });
}

function wire() {
  // Recherche texte (anti-rebond, sans recharger la page).
  const search = $("#explorer-search");
  if (search) {
    search.value = state.q;
    search.addEventListener(
      "input",
      debounce(() => {
        state.q = search.value.trim();
        state.page = 1;
        applyAndLoad();
      }, 380)
    );
  }

  // Filtres
  $("#filters-panel")?.addEventListener("change", onFilterChange);
  $("#filters-sheet")?.addEventListener("change", onFilterChange);

  function onFilterChange(event) {
    const input = event.target;
    if (input.name === "ville") {
      state.ville = input.value;
      state.quartier = "";
    } else if (input.name === "secteur") {
      state.secteur = input.checked ? input.value : "";
    } else if (input.name === "note") {
      state.note = input.value;
    } else if (input.name === "verif") {
      state.verif = input.checked ? "verified" : "";
    } else return;
    state.page = 1;
    applyAndLoad();
  }

  // Tri
  $("#sort-select")?.addEventListener("change", (event) => {
    state.tri = event.target.value;
    state.page = 1;
    applyAndLoad();
  });

  // Vue grille / liste
  $$("[data-view]").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.vue = btn.dataset.view === "liste" ? "liste" : "grille";
      syncControls();
      writeState({ push: false });
    })
  );

  // Chips de filtre actif
  document.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-filter]");
    if (remove) {
      event.preventDefault();
      const key = remove.dataset.removeFilter;
      if (key === "verif") state.verif = "";
      else if (key === "note") state.note = "";
      else state[key] = "";
      state.page = 1;
      applyAndLoad();
      return;
    }
    if (event.target.closest("[data-reset-filters]")) {
      event.preventDefault();
      ["q", "ville", "secteur", "quartier", "note", "verif"].forEach((key) => (state[key] = ""));
      state.page = 1;
      state.tri = "pertinence";
      applyAndLoad();
    }
  });

  // Pagination
  $("#load-more")?.addEventListener("click", (event) => {
    setLoading(event.currentTarget, true);
    state.page += 1;
    load({ append: true }).finally(() => setLoading(event.currentTarget, false));
  });

  // Feuille de filtres mobile
  const sheet = $("#filters-sheet");
  $("#open-filters")?.addEventListener("click", () => {
    if (sheet && typeof sheet.showModal === "function") sheet.showModal();
    else sheet?.setAttribute("open", "");
  });
  $("#close-filters")?.addEventListener("click", () => {
    if (sheet?.open) sheet.close();
    else sheet?.removeAttribute("open");
  });
  sheet?.addEventListener("click", (event) => {
    if (event.target === sheet) sheet.close();
  });

  window.addEventListener("popstate", () => {
    readState();
    syncControls();
    load();
  });
}

export async function init() {
  readState();

  // Le carnet de villes déclenché depuis l'accueil peut arriver en `?ville=`.
  try {
    meta = await get("/meta", { cacheMs: 5 * 60_000 });
  } catch (error) {
    toast.error(errorMessage(error));
    meta = { cities: [], sectors: [] };
  }

  const panel = $("#filters-panel");
  if (panel) panel.innerHTML = filtersMarkup();
  const sheetBody = $("#filters-sheet-body");
  if (sheetBody) sheetBody.innerHTML = filtersMarkup();

  const subtitle = $("#explore-subtitle");
  if (subtitle && meta?.stats) {
    subtitle.textContent = t("explore.subtitle", { n: formatNumber(meta.stats.companies) });
  }

  wire();
  syncControls();
  await load();
  writeState({ push: false });
}

export default { init };
