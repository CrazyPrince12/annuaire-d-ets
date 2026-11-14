/**
 * Offres d'emploi et de stage.
 * La page /stages arrive ici avec `?type=stage` (voir vercel.json).
 */

import { get, post, session } from "../core/api.js";
import { t, formatNumber } from "../core/i18n.js";
import { icon } from "../core/icons.js";
import { toast } from "../core/toast.js";
import {
  $,
  $$,
  esc,
  offerCard,
  emptyState,
  errorState,
  errorMessage,
  debounce,
  setLoading,
  revealOnScroll,
} from "../core/ui.js";

const CONTRACTS = [
  "cdi",
  "cdd",
  "stage_academique",
  "stage_professionnel",
  "stage_pre_emploi",
  "freelance",
  "interim",
];

const state = { q: "", type: "", contrat: "", ville: "", secteur: "", tri: "recentes", page: 1 };

function readState() {
  const params = new URLSearchParams(location.search);
  state.q = params.get("q") || "";
  state.type = params.get("type") === "stage" ? "stage" : "";
  state.contrat = params.get("contrat") || "";
  state.ville = params.get("ville") || "";
  state.secteur = params.get("secteur") || "";
  state.tri = params.get("tri") || "recentes";
  state.page = Math.max(1, Number(params.get("page")) || 1);
}

function writeState() {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.type) params.set("type", state.type);
  if (state.contrat) params.set("contrat", state.contrat);
  if (state.ville) params.set("ville", state.ville);
  if (state.secteur) params.set("secteur", state.secteur);
  if (state.tri !== "recentes") params.set("tri", state.tri);
  if (state.page > 1) params.set("page", String(state.page));
  const base = state.type === "stage" ? "/stages" : "/offres";
  history.replaceState({}, "", `${base}${params.toString() ? `?${params}` : ""}`);
}

async function load({ append = false } = {}) {
  const host = $("#offers-list");
  if (!host) return;
  if (!append) host.innerHTML = `<div class="skeleton" style="height:96px"></div><div class="skeleton" style="height:96px"></div>`;

  try {
    const data = await get("/offers", {
      params: {
        q: state.q || undefined,
        type: state.type || undefined,
        contrat: state.contrat || undefined,
        ville: state.ville || undefined,
        secteur: state.secteur || undefined,
        tri: state.tri,
        page: state.page,
        limite: 24,
      },
      cacheMs: 20_000,
    });

    const items = data.items || [];
    if (!items.length) {
      host.innerHTML = emptyState({
        iconName: "briefcase",
        title: t("offers.empty"),
        text: t("offers.emptyHint"),
        action: `<button type="button" class="btn btn-secondary sm" data-offer-alert>${t("offers.alert")}</button>`,
      });
    } else {
      const html = items.map((offer) => offerCard(offer)).join("");
      if (append) host.insertAdjacentHTML("beforeend", html);
      else host.innerHTML = html;
    }

    const count = $("#offers-count");
    if (count) {
      count.innerHTML = t("offers.subtitle", { n: formatNumber(data.total || 0) });
    }
    const wrap = $("#offers-more-wrap");
    if (wrap) wrap.hidden = state.page >= (data.pages || 1);
    const more = $("#offers-more");
    if (more) more.disabled = false;
    revealOnScroll(host);
    writeState();
  } catch (error) {
    host.innerHTML = errorState({ text: errorMessage(error), retryAttr: "data-retry-offers" });
    host.querySelector("[data-retry-offers]")?.addEventListener("click", () => load({ append }));
    toast.error(errorMessage(error));
  }
}

async function fillFilters() {
  try {
    const meta = await get("/meta", { cacheMs: 5 * 60_000 });
    const city = $("#filter-city");
    const sector = $("#filter-sector");
    if (city) {
      city.innerHTML =
        `<option value="">${t("offers.filter.city")}</option>` +
        meta.cities
          .filter((item) => item.companies > 0)
          .map((item) => `<option value="${esc(item.slug)}">${esc(item.name)}</option>`)
          .join("");
      city.value = state.ville;
    }
    if (sector) {
      sector.innerHTML =
        `<option value="">${t("offers.filter.sector")}</option>` +
        meta.sectors
          .filter((item) => item.companies > 0)
          .map((item) => `<option value="${esc(item.slug)}">${esc(item.name)}</option>`)
          .join("");
      sector.value = state.secteur;
    }
  } catch {
    /* filtres facultatifs */
  }
}

function renderContractOptions() {
  const select = $("#filter-contract");
  if (!select) return;
  select.innerHTML =
    `<option value="">${t("offers.filter.contract")}</option>` +
    CONTRACTS.map(
      (value) => `<option value="${value}">${esc(t(`offers.contract.${value}`))}</option>`
    ).join("");
  select.value = state.contrat;
}

async function createAlert() {
  const user = await session().catch(() => null);
  if (!user?.user) {
    toast.info(t("review.loginRequired"));
    location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
    return;
  }
  try {
    await post("/me-alerts", {
      q: state.q || "",
      cities: state.ville ? [state.ville] : [],
      sectors: state.secteur ? [state.secteur] : [],
      contracts: state.contrat ? [state.contrat] : [],
      frequency: "weekly",
    });
    toast.success(t("offers.alertCreated"));
  } catch (error) {
    toast.error(error.message || t("common.errorGeneric"));
  }
}

export async function init() {
  readState();
  renderContractOptions();
  await fillFilters();

  const search = $("#offers-search");
  if (search) {
    search.value = state.q;
    search.addEventListener(
      "input",
      debounce(() => {
        state.q = search.value.trim();
        state.page = 1;
        load();
      }, 350)
    );
  }

  $$("[data-type]").forEach((tab) =>
    tab.addEventListener("click", (event) => {
      event.preventDefault();
      state.type = tab.dataset.type;
      state.page = 1;
      $$("[data-type]").forEach((node) =>
        node.setAttribute("aria-selected", String(node === tab))
      );
      load();
      writeState();
    })
  );

  ["filter-contract", "filter-city", "filter-sector"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", (event) => {
      const key = { "filter-contract": "contrat", "filter-city": "ville", "filter-sector": "secteur" }[id];
      state[key] = event.target.value;
      state.page = 1;
      load();
    });
  });

  $("#offers-sort")?.addEventListener("change", (event) => {
    state.tri = event.target.value;
    state.page = 1;
    load();
  });

  $("#offers-more")?.addEventListener("click", (event) => {
    setLoading(event.currentTarget, true);
    state.page += 1;
    load({ append: true });
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-offer-alert]")) {
      event.preventDefault();
      createAlert();
    }
  });

  await load();
}

export default { init };
