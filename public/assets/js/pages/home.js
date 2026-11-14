/**
 * Accueil — assemble les sections à partir de `/api/home`.
 * Toute section dont la liste est vide (ou inférieure à 3 éléments pour les
 * carrousels) est retirée du DOM plutôt que laissée vide.
 */

import { get } from "../core/api.js";
import { t, formatNumber } from "../core/i18n.js";
import { icon } from "../core/icons.js";
import { $, $$, esc, companyCard, offerCard, countUp, revealOnScroll, errorState, errorMessage } from "../core/ui.js";
import { toast } from "../core/toast.js";

const SECTOR_ICONS = {
  informatique: "cpu",
  finance: "calculator",
  banque: "landmark",
  commerce: "store",
  industrie: "factory",
  btp: "hardHat",
  sante: "heartPulse",
  transport: "truck",
  agrobusiness: "sprout",
  education: "graduationCap",
  restauration: "utensils",
  hotellerie: "hotel",
  conseil: "briefcase",
  artisanat: "wrench",
  communication: "megaphone",
  energie: "zap",
  agriculture: "leaf",
  juridique: "scale",
};

function sectorIcon(sector) {
  if (sector.icon && /^[a-zA-Z]+$/.test(sector.icon)) return sector.icon;
  const key = String(sector.slug || "").toLowerCase();
  const found = Object.keys(SECTOR_ICONS).find((name) => key.includes(name));
  return found ? SECTOR_ICONS[found] : "building2";
}

function renderStats(counts) {
  const map = [
    ["stat-companies", counts.companies],
    ["stat-reviews", counts.reviews],
    ["stat-cities", 3],
  ];
  map.forEach(([id, value]) => {
    const node = document.getElementById(id);
    if (node) countUp(node, value);
  });
}

function renderCities(cities) {
  const host = $("#home-cities");
  if (!host) return;
  const visible = (cities || []).filter((city) => city.companies > 0);
  if (!visible.length) {
    host.closest("section")?.setAttribute("hidden", "");
    return;
  }
  host.innerHTML = visible
    .slice(0, 3)
    .map(
      (city, index) => `
      <a class="city-tile" href="/villes/${esc(city.slug)}" data-reveal
         style="--tint:${["rgba(34,192,122,.30)", "rgba(255,200,61,.26)", "rgba(82,169,255,.26)"][index % 3]}">
        <span class="city-icon" aria-hidden="true">${icon("mapPin", { size: 40 })}</span>
        <h3>${esc(city.name)}</h3>
        <p class="city-meta">
          <span><strong>${formatNumber(city.companies)}</strong> ${t("cities.stats.companies")}</span>
          <span><strong>${formatNumber(city.offers)}</strong> ${t("cities.stats.offers")}</span>
        </p>
        <span class="arrow" aria-hidden="true">${icon("arrowRight", { size: 22 })}</span>
        <span class="visually-hidden">${esc(t("cities.explore", { city: city.name }))}</span>
      </a>`
    )
    .join("");
  revealOnScroll(host);
}

function renderSectors(sectors) {
  const host = $("#home-sectors");
  if (!host) return;
  const visible = (sectors || []).filter((sector) => sector.companies > 0);
  if (!visible.length) {
    host.closest("section")?.setAttribute("hidden", "");
    return;
  }
  // 3 tuiles larges + 6 tuiles simples = 12 colonnes virtuelles sur grand écran.
  host.innerHTML = visible
    .slice(0, 9)
    .map(
      (sector, index) => `
      <a class="sector-tile ${index < 3 ? "wide" : ""}" href="/secteurs/${esc(sector.slug)}"
         style="--tile-color:${esc(sector.color || "#22C07A")}" data-reveal
         title="${esc(sector.name)}">
        ${icon(sectorIcon(sector), { size: 22 })}
        <span class="name">${esc(sector.name)}</span>
        <span class="count">${t("sectors.companies", { n: formatNumber(sector.companies) })}</span>
      </a>`
    )
    .join("");
  revealOnScroll(host);
}

function renderCarousel(id, list, emptyId) {
  const host = document.getElementById(id);
  if (!host) return;
  if (!list || list.length < 3) {
    host.closest("section")?.setAttribute("hidden", "");
    return;
  }
  host.innerHTML = list
    .slice(0, 8)
    .map((company) => `<div class="carousel-item">${companyCard(company)}</div>`)
    .join("");
}

function renderOffers(offers) {
  const host = $("#home-offers");
  if (!host) return;
  if (!offers || !offers.length) {
    host.closest("section")?.setAttribute("hidden", "");
    return;
  }
  host.innerHTML = offers.slice(0, 6).map((offer) => offerCard(offer)).join("");
}

function fillHeroCitySelect(cities) {
  const select = $("#hero-city");
  if (!select) return;
  select.innerHTML =
    `<option value="">${t("common.city")}</option>` +
    (cities || [])
      .filter((city) => city.companies > 0)
      .map((city) => `<option value="${esc(city.slug)}">${esc(city.name)}</option>`)
      .join("");
}

function wireHeroSearch() {
  const form = $("#hero-search-form");
  if (!form) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const q = form.querySelector('input[name="q"]')?.value.trim() || "";
    const city = form.querySelector('select[name="ville"]')?.value || "";
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (city) params.set("ville", city);
    location.href = `/explorer${params.toString() ? `?${params}` : ""}`;
  });

  $$("[data-quick]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const value = chip.dataset.quick;
      const input = $("#hero-search-form input[name='q']");
      if (input) input.value = value;
      $("#hero-search-form")?.requestSubmit();
    });
  });
}

function renderDemoNote(settings) {
  const note = $("#home-demo-note");
  if (!note) return;
  if (!settings?.demoBanner) {
    note.remove();
    return;
  }
  note.innerHTML = `${icon("info", { size: 14 })} <span>${t("home.demoNote")}</span>`;
}

export async function init() {
  wireHeroSearch();

  try {
    const data = await get("/home", { cacheMs: 60_000 });
    renderStats(data.counts || {});
    renderCities(data.cities);
    renderSectors(data.sectors);
    fillHeroCitySelect(data.cities);
    renderCarousel("home-verified", data.verified);
    renderCarousel("home-top", data.topRated);
    renderCarousel("home-new", data.newest);
    renderOffers(data.internships);
    const meta = await get("/meta", { cacheMs: 5 * 60_000 }).catch(() => null);
    renderDemoNote(meta?.settings);
    revealOnScroll();
  } catch (error) {
    toast.error(errorMessage(error));
    const host = $("#home-error");
    if (host) {
      host.hidden = false;
      host.innerHTML = errorState({ text: errorMessage(error), retryAttr: "data-home-retry" });
      host.querySelector("[data-home-retry]")?.addEventListener("click", () => {
        host.hidden = true;
        host.innerHTML = "";
        init();
      });
    }
  }
}

export default { init };
