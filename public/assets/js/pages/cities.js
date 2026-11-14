/** Hub « Villes » : une carte par ville de lancement, avec ses chiffres réels. */

import { get } from "../core/api.js";
import { t, formatNumber } from "../core/i18n.js";
import { icon } from "../core/icons.js";
import { $, esc, emptyState, errorMessage, revealOnScroll } from "../core/ui.js";
import { toast } from "../core/toast.js";

const TINTS = ["rgba(34,192,122,.30)", "rgba(255,200,61,.26)", "rgba(82,169,255,.26)"];

export async function init() {
  const host = $("#cities-grid");
  if (!host) return;
  try {
    const meta = await get("/meta", { cacheMs: 5 * 60_000 });
    const cities = (meta.cities || []).filter((city) => city.companies > 0);
    if (!cities.length) {
      host.innerHTML = emptyState({ iconName: "mapPin", title: t("cities.empty") });
      return;
    }
    host.innerHTML = cities
      .map(
        (city, index) => `
        <a class="city-tile" href="/villes/${esc(city.slug)}" data-reveal
           style="--tint:${TINTS[index % TINTS.length]}">
          <span class="city-icon" aria-hidden="true">${icon("mapPin", { size: 40 })}</span>
          <h2 style="font-size:1.5rem">${esc(city.name)}</h2>
          <p class="city-meta">
            <span><strong>${formatNumber(city.companies)}</strong> ${t("cities.stats.companies")}</span>
            <span>${esc(city.region || "")}</span>
          </p>
          <span class="arrow" aria-hidden="true">${icon("arrowRight", { size: 22 })}</span>
        </a>`
      )
      .join("");

    const quarters = $("#cities-quarters");
    if (quarters) {
      quarters.innerHTML = cities
        .map(
          (city) => `
          <div class="card">
            <h3 style="font-size:var(--text-md)">${esc(city.name)}</h3>
            <div class="chips wrap" style="margin-top:10px">
              ${(city.neighborhoods || [])
                .slice(0, 8)
                .map(
                  (hood) =>
                    `<a class="chip" href="/explorer?ville=${esc(city.slug)}&q=${encodeURIComponent(
                      hood.name
                    )}">${esc(hood.name)}</a>`
                )
                .join("")}
            </div>
          </div>`
        )
        .join("");
    }
    revealOnScroll(host);
  } catch (error) {
    host.innerHTML = emptyState({ iconName: "mapPin", title: t("common.error"), text: errorMessage(error) });
    toast.error(errorMessage(error));
  }
}

export default { init };
