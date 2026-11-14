/** Hub « Avis » : classements par secteur, avis récents, palmarès stage/ambiance. */

import { get } from "../core/api.js";
import { t, formatDate, formatNumber } from "../core/i18n.js";
import { icon } from "../core/icons.js";
import { $, esc, starsHtml, emptyState, errorMessage, revealOnScroll } from "../core/ui.js";
import { toast } from "../core/toast.js";

function rankingList(companies) {
  return companies
    .map(
      (company, index) => `
      <a class="ranking-row" href="/entreprises/${esc(company.slug)}">
        <span class="rank">${index + 1}</span>
        <span class="ranking-name">${esc(company.name)}
          <span class="faint small">· ${esc(company.city || "")}</span>
        </span>
        <span class="rating">${icon("star", { size: 14 })} ${Number(company.rating).toFixed(1)}</span>
      </a>`
    )
    .join("");
}

function reviewCard(review) {
  return `
    <article class="review-card">
      <div class="review-head">
        <div class="who">
          <a class="link" href="/entreprises/${esc(review.company_slug)}">${esc(review.company_name)}</a>
          <span class="faint">· ${esc(review.city_name || "")}</span>
        </div>
        <div>${starsHtml(review.rating, { size: 14 })}</div>
      </div>
      ${review.title ? `<h3 style="font-size:var(--text-md)">${esc(review.title)}</h3>` : ""}
      <p class="small muted">${esc((review.pros || "").slice(0, 220))}${(review.pros || "").length > 220 ? "…" : ""}</p>
      <p class="notice-small">${esc(review.relationshipLabel || "")} · ${formatDate(review.published_at, "short")}</p>
    </article>`;
}

export async function init() {
  const host = $("#reviews-root");
  if (!host) return;
  try {
    const data = await get("/reputation", { cacheMs: 60_000 });

    const bySector = $("#reviews-by-sector");
    if (bySector) {
      bySector.innerHTML = (data.bySector || []).length
        ? data.bySector
            .map(
              (group) => `
            <div class="card">
              <div class="row-between" style="margin-bottom:10px">
                <h3 style="font-size:var(--text-md)">${esc(group.sector.name)}</h3>
                <a class="link small" href="/secteurs/${esc(group.sector.slug)}">${t("sectors.explore")}</a>
              </div>
              <div class="ranking">${rankingList(group.companies)}</div>
            </div>`
            )
            .join("")
        : emptyState({ iconName: "star", title: t("common.empty"), text: t("home.topRated.empty") });
    }

    const recent = $("#reviews-recent");
    if (recent) {
      recent.innerHTML = (data.recent || []).length
        ? data.recent.map(reviewCard).join("")
        : emptyState({ iconName: "star", title: t("home.reviews.empty") });
    }

    const internshipHost = $("#reviews-internships");
    if (internshipHost && data.internships?.length) {
      internshipHost.innerHTML = data.internships
        .map(
          (row) => `
        <a class="ranking-row" href="/entreprises/${esc(row.slug)}">
          <span class="ranking-name">${esc(row.name)}</span>
          <span class="rating">${icon("star", { size: 14 })} ${Number(row.score).toFixed(1)}
            <span class="faint small">(${formatNumber(row.reviews)})</span></span>
        </a>`
        )
        .join("");
    } else {
      internshipHost?.closest("section")?.setAttribute("hidden", "");
    }

    const atmosphereHost = $("#reviews-atmosphere");
    if (atmosphereHost && data.atmosphere?.length) {
      atmosphereHost.innerHTML = data.atmosphere
        .map(
          (row) => `
        <a class="ranking-row" href="/entreprises/${esc(row.slug)}">
          <span class="ranking-name">${esc(row.name)}</span>
          <span class="rating">${icon("star", { size: 14 })} ${Number(row.score).toFixed(1)}
            <span class="faint small">(${formatNumber(row.reviews)})</span></span>
        </a>`
        )
        .join("");
    } else {
      atmosphereHost?.closest("section")?.setAttribute("hidden", "");
    }

    revealOnScroll(host);
  } catch (error) {
    host.innerHTML = emptyState({ iconName: "alertTriangle", title: t("common.error"), text: errorMessage(error) });
    toast.error(errorMessage(error));
  }
}

export default { init };
