/** Hub « Secteurs » : grille complète avec effectifs réels. */

import { get } from "../core/api.js";
import { t, formatNumber } from "../core/i18n.js";
import { icon } from "../core/icons.js";
import { $, esc, emptyState, errorMessage, revealOnScroll } from "../core/ui.js";

const ICONS = {
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

export function iconFor(sector) {
  if (sector.icon && /^[a-zA-Z]+$/.test(sector.icon)) return sector.icon;
  const key = String(sector.slug || "").toLowerCase();
  const found = Object.keys(ICONS).find((name) => key.includes(name));
  return found ? ICONS[found] : "building2";
}

export async function init() {
  const host = $("#sectors-grid");
  if (!host) return;
  try {
    const meta = await get("/meta", { cacheMs: 5 * 60_000 });
    const sectors = (meta.sectors || []).filter((sector) => sector.companies > 0);
    if (!sectors.length) {
      host.innerHTML = emptyState({ iconName: "tag", title: t("common.empty") });
      return;
    }
    host.innerHTML = sectors
      .map(
        (sector) => `
        <a class="sector-tile" href="/secteurs/${esc(sector.slug)}" data-reveal
           style="--tile-color:${esc(sector.color || "#22C07A")}">
          ${icon(iconFor(sector), { size: 22 })}
          <span class="name">${esc(sector.name)}</span>
          <span class="count">${t("sectors.companies", { n: formatNumber(sector.companies) })}</span>
        </a>`
      )
      .join("");
    revealOnScroll(host);
  } catch (error) {
    host.innerHTML = emptyState({ iconName: "alertTriangle", title: t("common.error"), text: errorMessage(error) });
  }
}

export default { init };
