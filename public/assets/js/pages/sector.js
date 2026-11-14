/** Fiche secteur : description, entreprises, villes où elles se trouvent. */

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
import { iconFor } from "./sectors.js";

export async function init() {
  const slug = decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "");
  const host = $("#sector-companies");
  if (host) host.innerHTML = skeletonCards(3);

  try {
    const [meta, list] = await Promise.all([
      get("/meta", { cacheMs: 5 * 60_000 }),
      get("/companies", { params: { secteur: slug, limite: 24 }, cacheMs: 30_000 }),
    ]);
    const sector = (meta.sectors || []).find((item) => item.slug === slug);

    if (sector) {
      document.title = `${sector.name} — entreprises du secteur | CONGLOMERAT`;
      const title = $("#sector-title");
      if (title) title.textContent = sector.name;
      const subtitle = $("#sector-subtitle");
      if (subtitle) subtitle.textContent = sector.description || t("sectors.subtitle");
      const glyph = $("#sector-icon");
      if (glyph) glyph.innerHTML = icon(iconFor(sector), { size: 28 });
      const count = $("#sector-count");
      if (count) count.textContent = t("sectors.companies", { n: formatNumber(sector.companies) });
    }

    if (host) {
      const items = list.items || [];
      host.innerHTML = items.length
        ? items.map((company) => companyCard(company)).join("")
        : emptyState({
            iconName: "building2",
            title: t("sectors.empty"),
            action: `<a class="btn btn-secondary sm" href="/explorer">${t("nav.explore")}</a>`,
          });
      refreshButtons(host);
      revealOnScroll(host);
    }

    const related = $("#sector-related");
    if (related) {
      const others = (meta.sectors || []).filter((item) => item.slug !== slug && item.companies > 0).slice(0, 6);
      related.innerHTML = others
        .map(
          (item) => `
          <a class="chip" href="/secteurs/${esc(item.slug)}">
            ${icon(iconFor(item), { size: 13 })} ${esc(item.name)}
            <span class="chip-count">${formatNumber(item.companies)}</span>
          </a>`
        )
        .join("");
    }
  } catch (error) {
    if (host) {
      host.innerHTML = emptyState({ iconName: "alertTriangle", title: t("common.error"), text: errorMessage(error) });
    }
  }
}

export default { init };
