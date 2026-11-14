/**
 * Page Carte — liste synchronisée avec MapLibre.
 *
 * • chargement par zone visible (`bbox`), anti-rebond sur les déplacements ;
 * • recherche plein texte dans la zone, filtre ville/secteur ;
 * • clic sur un marqueur → fiche mise en avant dans la liste ; clic sur une
 *   ligne → recentrage ;
 * • sans WebGL : la liste seule s'affiche, avec un bandeau explicite.
 */

import { get } from "../core/api.js";
import { UI } from "../core/config.js";
import { t, formatNumber } from "../core/i18n.js";
import { icon } from "../core/icons.js";
import { toast } from "../core/toast.js";
import {
  $,
  $$,
  esc,
  debounce,
  logoMark,
  ratingHtml,
  openBadge,
  emptyState,
  errorState,
  errorMessage,
  displayPhone,
  phoneHref,
  directionsUrl,
} from "../core/ui.js";
import { createMap, renderMarkers, fitCompanies, supportsWebGL } from "../core/map.js";

let map = null;
let markers = null;
let items = [];
let activeSlug = null;

function listItem(company) {
  return `
  <article class="map-item ${company.slug === activeSlug ? "active" : ""}" data-map-item="${esc(company.slug)}"
           tabindex="0" role="button" aria-label="${esc(company.name)}">
    ${logoMark(company.name, { size: "sm" })}
    <div style="flex:1;min-width:0">
      <h3>${esc(company.name)}</h3>
      <p class="company-card-meta" style="margin-top:2px">
        ${company.sector ? `<span>${esc(company.sector.name)}</span>` : ""}
        ${company.city ? `<span>· ${esc(company.city.name)}</span>` : ""}
      </p>
      <div class="row" style="gap:6px;margin-top:4px">${ratingHtml(company)} ${openBadge(company.hours)}</div>
    </div>
    <a class="icon-btn sm" href="/entreprises/${esc(company.slug)}" aria-label="${t("map.openList")}">
      ${icon("arrowUpRight", { size: 17 })}
    </a>
  </article>`;
}

function renderList() {
  const host = $("#map-list-body");
  if (!host) return;
  if (!items.length) {
    host.innerHTML = emptyState({
      iconName: "mapPin",
      title: t("map.empty"),
      text: t("map.emptyHint"),
    });
    return;
  }
  host.innerHTML = items.map(listItem).join("");
}

function updateCount() {
  const host = $("#map-count");
  if (!host) return;
  host.textContent =
    items.length === 1 ? t("map.results.one") : t("map.results", { n: formatNumber(items.length) });
}

function drawMarkers() {
  if (!map) return;
  markers?.clear();
  markers = renderMarkers(map, items, {
    activeSlug,
    onSelect: (company) => selectCompany(company.slug, { fly: true }),
  });
}

function selectCompany(slug, { fly = false } = {}) {
  activeSlug = slug;
  const company = items.find((item) => item.slug === slug);
  $$("[data-map-item]").forEach((node) =>
    node.classList.toggle("active", node.dataset.mapItem === slug)
  );
  if (slug) {
    const node = document.querySelector(`[data-map-item="${CSS.escape(slug)}"]`);
    node?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  if (company && map && fly) {
    map.easeTo({ center: [company.lng, company.lat], zoom: Math.max(map.getZoom(), 14), duration: 600 });
  }
  drawMarkers();
}

function currentBbox() {
  if (!map) return null;
  const bounds = map.getBounds();
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]
    .map((value) => Number(value.toFixed(5)))
    .join(",");
}

let requestId = 0;

async function loadArea({ fit = false } = {}) {
  const id = ++requestId;
  const host = $("#map-list-body");
  if (host && !items.length) host.innerHTML = `<div class="skeleton" style="height:72px"></div><div class="skeleton" style="height:72px;margin-top:8px"></div>`;

  const params = {
    bbox: currentBbox() || undefined,
    q: $("#map-q")?.value.trim() || undefined,
    ville: $("#map-city")?.value || undefined,
    secteur: $("#map-sector")?.value || undefined,
    limite: 300,
  };

  try {
    const data = await get("/map", { params, cacheMs: 20_000 });
    if (id !== requestId) return;
    items = data.items || [];
    renderList();
    updateCount();
    drawMarkers();
    if (fit && items.length) fitCompanies(map, items, { maxZoom: 13 });
  } catch (error) {
    if (host) {
      host.innerHTML = errorState({ text: errorMessage(error), retryAttr: "data-map-retry" });
      host.querySelector("[data-map-retry]")?.addEventListener("click", () => loadArea());
    }
    toast.error(errorMessage(error));
  }
}

const loadAreaDebounced = debounce(() => loadArea(), 350);

function renderFallback(message) {
  const host = $("#map-shell");
  if (!host) return;
  host.classList.add("map-page--fallback");
  const mapNode = $("#map");
  if (mapNode) mapNode.hidden = true;
  const topbar = $(".map-topbar");
  if (topbar) topbar.style.position = "static";
  const banner = $("#map-fallback-notice");
  if (banner) {
    banner.hidden = false;
    banner.innerHTML = `${icon("info", { size: 16 })}<span>${esc(message)}</span>`;
  }
  $("#map-list")?.classList.add("is-static");
  loadArea();
}

function wireGeolocate() {
  $("#map-locate")?.addEventListener("click", () => {
    if (!navigator.geolocation) {
      toast.warning(t("map.locateError"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        map?.easeTo({
          center: [position.coords.longitude, position.coords.latitude],
          zoom: 14,
          duration: 800,
        });
        loadAreaDebounced();
      },
      () => toast.warning(t("map.locateError")),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  });
}

function wireListInteractions() {
  const host = $("#map-list-body");
  host?.addEventListener("click", (event) => {
    if (event.target.closest("a")) return;
    const item = event.target.closest("[data-map-item]");
    if (item) selectCompany(item.dataset.mapItem, { fly: true });
  });
  host?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const item = event.target.closest("[data-map-item]");
    if (item) {
      event.preventDefault();
      selectCompany(item.dataset.mapItem, { fly: true });
    }
  });

  const head = $(".map-list-head");
  const list = $("#map-list");
  head?.addEventListener("click", () => {
    const expanded = list.dataset.expanded === "true";
    list.dataset.expanded = String(!expanded);
    head.setAttribute("aria-expanded", String(!expanded));
  });
}

async function fillFilters() {
  try {
    const meta = await get("/meta", { cacheMs: 5 * 60_000 });
    const citySelect = $("#map-city");
    const sectorSelect = $("#map-sector");
    if (citySelect) {
      citySelect.innerHTML =
        `<option value="">${t("common.city")}</option>` +
        meta.cities
          .filter((city) => city.companies > 0)
          .map((city) => `<option value="${esc(city.slug)}">${esc(city.name)}</option>`)
          .join("");
    }
    if (sectorSelect) {
      sectorSelect.innerHTML =
        `<option value="">${t("common.sector")}</option>` +
        meta.sectors
          .filter((sector) => sector.companies > 0)
          .map((sector) => `<option value="${esc(sector.slug)}">${esc(sector.name)}</option>`)
          .join("");
    }
  } catch {
    /* les filtres restent vides : la carte fonctionne quand même */
  }
}

export async function init() {
  wireListInteractions();
  wireGeolocate();
  await fillFilters();

  $("#map-q")?.addEventListener("input", loadAreaDebounced);
  $("#map-city")?.addEventListener("change", () => loadAreaDebounced());
  $("#map-sector")?.addEventListener("change", () => loadAreaDebounced());

  if (!supportsWebGL()) {
    renderFallback(t("map.webglError"));
    return;
  }

  const mapNode = $("#map");
  const center = { lat: UI.mapHome.lat, lng: UI.mapHome.lng };
  mapNode.innerHTML = `<div class="map-loading">${icon("loader", { size: 20 })} ${t("map.loading")}</div>`;

  map = await createMap(mapNode, { center, zoom: UI.mapHome.zoom });
  if (!map) {
    renderFallback(t("map.webglError"));
    return;
  }
  mapNode.querySelector(".map-loading")?.remove();

  map.on("moveend", loadAreaDebounced);
  loadArea();
}

export default { init };
