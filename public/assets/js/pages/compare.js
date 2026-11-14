/** Comparateur — jusqu'à 4 fiches côte à côte (localStorage → fiches publiques). */

import { get } from "../core/api.js";
import { UI } from "../core/config.js";
import { t, formatCurrency } from "../core/i18n.js";
import { icon } from "../core/icons.js";
import { toast } from "../core/toast.js";
import {
  $,
  esc,
  starsHtml,
  displayPhone,
  phoneHref,
  websiteHref,
  websiteLabel,
  logoMark,
  todayHoursText,
  emptyState,
  errorMessage,
} from "../core/ui.js";
import { compareList, removeFromCompare, clearCompare } from "../core/favorites.js";

const ROWS = [
  ["city", "compare.city", (c) => c.city?.name],
  ["sector", "compare.sector", (c) => c.sector?.name],
  ["rating", "compare.rating", (c) => (c.rating ? `${Number(c.rating).toFixed(1)} / 5` : t("company.noRating"))],
  ["reviews", "compare.reviews", (c) => String(c.reviewsPublished ?? 0)],
  ["verified", "compare.verified", (c) => (c.verified ? t("common.verified") : t("common.unverified"))],
  ["price", "compare.price", (c) => c.sizeBand || "—"],
  ["hours", "compare.hours", (c) => todayHoursText(c.hours)],
  ["phone", "compare.phone", (c) => (c.phone ? displayPhone(c.phone) : "—")],
  ["website", "compare.website", (c) => (c.contacts?.website ? websiteLabel(c.contacts.website) : "—")],
  ["services", "compare.services", (c) => (c.benefits || []).slice(0, 3).join(" · ") || "—"],
];

function row(label, values, highlight = false) {
  return `
    <tr>
      <th scope="row" class="sticky-col">${esc(t(label))}</th>
      ${values.map((value) => `<td class="${highlight ? "is-best" : ""}">${value}</td>`).join("")}
    </tr>`;
}

function render(companies) {
  const host = $("#compare-root");
  if (!host) return;

  if (!companies.length) {
    host.innerHTML = emptyState({
      iconName: "scale",
      title: t("compare.empty"),
      text: t("compare.emptyHint"),
      action: `<a class="btn btn-primary sm" href="/explorer">${t("compare.add")}</a>`,
    });
    return;
  }

  const bestRating = Math.max(...companies.map((company) => company.rating || 0));

  host.innerHTML = `
    <div class="row-between" style="margin-bottom:12px">
      <p class="results-count">${t("compare.subtitle", { max: UI.maxCompare })}</p>
      <button type="button" class="btn btn-ghost sm" data-clear-compare>${icon("trash2", { size: 15 })} ${t(
        "compare.clear"
      )}</button>
    </div>
    <div class="table-wrap">
      <table class="compare-table">
        <thead>
          <tr>
            <th class="sticky-col">${t("compare.criteria")}</th>
            ${companies
              .map(
                (company) => `
              <th>
                <div class="stack" style="gap:6px;align-items:flex-start;min-width:180px">
                  <div class="row" style="gap:8px;align-items:center">
                    ${logoMark(company.name, { size: "sm" })}
                    <a class="link" href="/entreprises/${esc(company.slug)}">${esc(company.name)}</a>
                  </div>
                  ${company.rating ? starsHtml(company.rating, { size: 13 }) : ""}
                  <button type="button" class="btn btn-ghost sm" data-compare-remove="${esc(company.slug)}">
                    ${icon("x", { size: 13 })} ${t("compare.remove")}
                  </button>
                </div>
              </th>`
              )
              .join("")}
          </tr>
        </thead>
        <tbody>
          ${ROWS.map(([, label, getter]) =>
            row(
              label,
              companies.map((company) => esc(getter(company) ?? "—")),
              label === "compare.rating"
            )
          ).join("")}
          <tr>
            <th scope="row" class="sticky-col">${t("common.call")}</th>
            ${companies
              .map((company) =>
                company.phone
                  ? `<td><a class="btn btn-secondary sm" href="${phoneHref(company.phone)}">${icon("phone", {
                      size: 14,
                    })} ${t("common.call")}</a></td>`
                  : "<td>—</td>"
              )
              .join("")}
          </tr>
        </tbody>
      </table>
    </div>
    <p class="notice-small" style="margin-top:12px">${t("compare.best")} : ${
    bestRating ? `${bestRating.toFixed(1)} / 5` : "—"
  }</p>`;
}

export async function init() {
  const host = $("#compare-root");
  if (!host) return;
  const items = compareList().slice(0, UI.maxCompare);
  if (!items.length) {
    render([]);
    return;
  }
  host.innerHTML = new Array(items.length)
    .fill('<div class="skeleton" style="height:220px"></div>')
    .join("");

  try {
    const companies = (
      await Promise.all(
        items.map((item) =>
          get(`/companies/${encodeURIComponent(item.slug)}`, { cacheMs: 60_000 })
            .then((data) => data.company)
            .catch(() => null)
        )
      )
    ).filter(Boolean);
    render(companies);
  } catch (error) {
    host.innerHTML = emptyState({ iconName: "alertTriangle", title: t("common.error"), text: errorMessage(error) });
    toast.error(errorMessage(error));
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-clear-compare]")) {
      event.preventDefault();
      clearCompare();
      render([]);
    }
    const remove = event.target.closest("[data-compare-remove]");
    if (remove) {
      event.preventDefault();
      removeFromCompare(remove.dataset.compareRemove);
      init();
    }
  });
}

export default { init };
