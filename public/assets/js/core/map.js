/**
 * Carte interactive — MapLibre GL + OpenFreeMap.
 *
 * • aucune clé d'API, aucune dépendance à Google
 * • MapLibre est servi depuis /assets/vendor (pas de CDN tiers, CSP simple)
 * • si WebGL ou le script échoue, on renvoie `null` : la page affiche alors la
 *   liste seule (dégradation prévue, jamais d'écran vide)
 */

import { UI } from "./config.js";
import { t, formatNumber } from "./i18n.js";
import { icon } from "./icons.js";

let libPromise = null;
let maplibre = null;

function loadStylesheet(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

/** Charge MapLibre une seule fois. */
export function loadMapLibre() {
  if (!libPromise) {
    loadStylesheet("/assets/vendor/maplibre-gl.css");
    libPromise = import("../../vendor/maplibre-gl.mjs").then((lib) => (maplibre = lib)).catch(() => {
      libPromise = null;
      return null;
    });
  }
  return libPromise;
}

export function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2")
    );
  } catch {
    return false;
  }
}

/**
 * Crée une carte.
 * @param {HTMLElement} container
 * @param {{center?:{lat:number,lng:number}, zoom?:number, styleUrl?:string,
 *          interactive?:boolean, attribution?:string}} [options]
 * @returns {Promise<maplibregl.Map|null>}
 */
export async function createMap(container, options = {}) {
  if (!container) return null;
  if (!supportsWebGL()) return null;
  const lib = await loadMapLibre();
  if (!lib) return null;

  const { center = UI.mapHome, zoom = UI.mapHome.zoom, styleUrl = UI.mapStyle } = options;

  let map;
  try {
    map = new lib.Map({
      container, style: styleUrl, center: [center.lng, center.lat], zoom,
      maxZoom: UI.mapMaxZoom, minZoom: 4.5, attributionControl: false,
      dragRotate: false, pitchWithRotate: false, touchPitch: false,
    });
  } catch { return null; }

  map.addControl(new lib.NavigationControl({ showCompass: false }), "bottom-right");
  map.addControl(
    new lib.AttributionControl({
      compact: true,
      customAttribution: `© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>`,
    }),
    "bottom-left"
  );

  const ready = await new Promise((resolve) => {
    if (map.loaded()) return resolve(true);
    const onLoad = () => { clearTimeout(timer); resolve(true); };
    const timer = setTimeout(() => { map.off("load", onLoad); resolve(false); }, 6000);
    map.once("load", onLoad);
  });
  if (!ready) {
    map.remove();
    return null;
  }
  applyThemeToMap(map);
  const onTheme = () => applyThemeToMap(map);
  window.addEventListener("cg:theme", onTheme);
  map.once("remove", () => window.removeEventListener("cg:theme", onTheme));

  return map;
}

/**
 * OpenFreeMap « liberty » est un style clair : on atténue les fonds en thème
 * sombre pour rester lisible sans deuxième feuille de style.
 */
function applyThemeToMap(map) {
  const dark = document.documentElement.dataset.theme !== "light";
  try {
    const layers = map.getStyle()?.layers || [];
    for (const layer of layers) {
      if (layer.type === "background") {
        map.setPaintProperty(layer.id, "background-color", dark ? "#0c1210" : "#f3f6f4");
      } else if (layer.type === "fill" && /water|park|wood|grass|landcover|landuse/i.test(layer.id)) {
        if (/water/i.test(layer.id)) map.setPaintProperty(layer.id, "fill-color", dark ? "#0a1a20" : "#cfe3ee");
        else map.setPaintProperty(layer.id, "fill-color", dark ? "#101c17" : "#e2eee7");
      } else if (layer.type === "line" && /boundary|admin/i.test(layer.id)) {
        map.setPaintProperty(layer.id, "line-color", dark ? "#2a3a33" : "#c9d6cf");
      } else if (layer.type === "symbol" && /label|text|place/i.test(layer.id)) {
        map.setPaintProperty(layer.id, "text-color", dark ? "#9fb0a8" : "#3d4b45");
        try {
          map.setPaintProperty(layer.id, "text-halo-color", dark ? "#0c1210" : "#ffffff");
        } catch {
          /* propriété absente sur certaines couches */
        }
      }
    }
  } catch {
    /* style en cours de chargement : on réessaiera au prochain événement */
  }
}

/** Marqueur DOM coloré par secteur. */
export function markerElement(company) {
  const node = document.createElement("button");
  node.type = "button";
  node.className = `marker-pin${company.verified ? " verified" : ""}`;
  node.style.background = company.sector?.color || "#22C07A";
  node.setAttribute("aria-label", `${company.name} — ${company.sector?.name || ""}`);
  node.innerHTML = icon(company.isHiring ? "briefcase" : "building2", { size: 17 });
  return node;
}

/**
 * Remplace les marqueurs affichés.
 * @param {maplibregl.Map} map
 * @param {Array} companies
 * @param {{onSelect?:(company:any)=>void, activeSlug?:string}} [handlers]
 */
export function renderMarkers(map, companies, { onSelect, activeSlug } = {}) {
  if (!map || !maplibre) return { clear: () => {} };
  const lib = maplibre;
  const markers = [];
  const points = [];

  (companies || []).forEach((company) => {
    if (!Number.isFinite(company.lat) || !Number.isFinite(company.lng)) return;
    const el = markerElement(company);
    if (company.slug === activeSlug) el.classList.add("active");
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      onSelect?.(company);
    });
    const marker = new lib.Marker({ element: el, anchor: "center" })
      .setLngLat([company.lng, company.lat])
      .addTo(map);
    markers.push(marker);
    points.push([company.lng, company.lat]);
  });

  return {
    clear() {
      markers.forEach((marker) => marker.remove());
    },
    bounds() {
      if (!points.length) return null;
      const bounds = new lib.LngLatBounds();
      points.forEach((point) => bounds.extend(point));
      return bounds;
    },
  };
}

/** Cadre la carte sur un ensemble d'entreprises. */
export function fitCompanies(map, companies, { maxZoom = 14, padding = 60 } = {}) {
  if (!map || !companies?.length) return;
  const points = companies
    .filter((company) => Number.isFinite(company.lat) && Number.isFinite(company.lng))
    .map((company) => [company.lng, company.lat]);
  if (!points.length) return;
  if (points.length === 1) {
    map.easeTo({ center: points[0], zoom: 15, duration: 700 });
    return;
  }
  const lib = maplibre;
  const bounds = new lib.LngLatBounds();
  points.forEach((point) => bounds.extend(point));
  map.fitBounds(bounds, { padding, maxZoom, duration: 700 });
}

export function areaLabel(count) {
  return count === 1 ? t("map.results.one") : t("map.results", { n: formatNumber(count) });
}

export default { createMap, renderMarkers, fitCompanies, loadMapLibre, supportsWebGL };
