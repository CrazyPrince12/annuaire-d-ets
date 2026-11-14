/** Fiche ville : chiffres, quartiers, secteurs présents, entreprises publiées. */

import { get } from "../core/api.js";
import { t, formatNumber } from "../core/i18n.js";
import { icon } from "../core/icons.js";
import {
  $,
  esc,
  companyCard,
  skeletonCards,
  emptyState,
  errorMessage,
  revealOnScroll,
} from "../core/ui.js";
import { refreshButtons } from "../core/favorites.js";

export async function init() {
  const slug = decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "");
  const companiesHost = $("#city-companies");
  if (companiesHost) companiesHost.innerHTML = skeletonCards(3);

  try {
    const [meta, list] = await Promise.all([
      get("/meta", { cacheMs: 5 * 60_000 }),
      get("/companies", { params: { ville: slug, limite: 24 }, cacheMs: 30_000 }),
    ]);
    const city = (meta.cities || []).find((item) => item.slug === slug);

    if (city) {
      document.title = `${city.name} — entreprises et emplois | CONGLOMERAT`;
      const subtitle = $("#city-subtitle");
      if (subtitle) {
        subtitle.textContent = `${t("cities.companies", { n: formatNumber(city.companies) })} · ${esc(
          city.region || ""
        )}`;
      }
      const h1 = $("#city-title");
      if (h1) h1.textContent = city.name;

      const stats = $("#city-stats");
      if (stats) {
        stats.innerHTML = `
          <div class="stat-card"><span class="stat-value">${formatNumber(city.companies)}</span>
            <span class="stat-label">${t("cities.stats.companies")}</span></div>
          <div class="stat-card"><span class="stat-value">${formatNumber(
            (city.neighborhoods || []).length
          )}</span><span class="stat-label">${t("cities.quarters")}</span></div>
          <div class="stat-card"><span class="stat-value">${formatNumber(list.total || 0)}</span>
            <span class="stat-label">${t("common.results")}</span></div>`;
      }

      const quarters = $("#city-quarters");
      if (quarters) {
        quarters.innerHTML = (city.neighborhoods || [])
          .slice(0, 16)
          .map(
            (hood) =>
              `<a class="chip" href="/explorer?ville=${esc(slug)}&q=${encodeURIComponent(hood.name)}">
                ${icon("mapPin", { size: 13 })} ${esc(hood.name)}</a>`
          )
          .join("");
      }
    }

    if (companiesHost) {
      const items = list.items || [];
      companiesHost.innerHTML = items.length
        ? items.map((company) => companyCard(company)).join("")
        : emptyState({
            iconName: "building2",
            title: t("common.empty"),
            text: t("cities.empty"),
            action: `<a class="btn btn-secondary sm" href="/explorer?ville=${esc(slug)}">${t(
              "common.filters"
            )}</a>`,
          });
      refreshButtons(companiesHost);
      revealOnScroll(companiesHost);
    }

    const mapLink = $("#city-map-link");
    if (mapLink) mapLink.href = `/carte?ville=${encodeURIComponent(slug)}`;
    const exploreLink = $("#city-explore-link");
    if (exploreLink) exploreLink.href = `/explorer?ville=${encodeURIComponent(slug)}`;
  } catch (error) {
    if (companiesHost) {
      companiesHost.innerHTML = emptyState({ iconName: "alertTriangle", title: t("common.error"), text: errorMessage(error) });
    }
  }
}

export default { init };
