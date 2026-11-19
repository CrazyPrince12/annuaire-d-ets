/**
 * Fiche entreprise — identité, contact, horaires, avis, offres, similaires,
 * mini-carte, revendication et signalement.
 *
 * Un seul appel (`/api/companies/:slug`) fournit tout le contenu ; la page
 * reste utile en cas d'erreur réseau grâce au message d'état + bouton Réessayer.
 */

import { get, post } from "../core/api.js";
import { t, formatNumber, formatDate } from "../core/i18n.js";
import { icon } from "../core/icons.js";
import { toast, confirmDialog } from "../core/toast.js";
import {
  $,
  $$,
  esc,
  starsHtml,
  ratingHtml,
  logoMark,
  openBadge,
  todayHoursText,
  displayPhone,
  phoneHref,
  whatsappHref,
  websiteHref,
  websiteLabel,
  directionsUrl,
  mapUrl,
  hoursForToday,
  DAY_ORDER,
  dayLabel,
  companyCard,
  offerCard,
  emptyState,
  errorState,
  errorMessage,
  share,
  revealOnScroll,
  setLoading,
} from "../core/ui.js";
import { trackView } from "../core/events.js";
import { toggleFavorite, isFavorite, inCompare, toggleCompare, refreshButtons } from "../core/favorites.js";

let company = null;
let payload = null;
let currentUser = null;

/* ------------------------------------------------------------------ entête */

function renderHeader(data) {
  const c = data.company;
  const host = $("#company-head");
  if (!host) return;

  const badges = [];
  if (c.verified === 2)
    badges.push(`<span class="badge badge-partner">${icon("badgeCheck", { size: 13 })} ${t("common.verified")}</span>`);
  else if (c.verified === 1)
    badges.push(`<span class="badge badge-verified">${icon("shieldCheck", { size: 13 })} ${t("common.verified")}</span>`);
  if (c.isHiring) badges.push(`<span class="badge badge-hiring">${icon("briefcase", { size: 13 })} ${t("common.new")} · ${c.offersCount}</span>`);
  if (c.provenance === "exemple") badges.push(`<span class="example-flag">${t("company.exampleBadge")}</span>`);

  const subline = [
    c.sector ? `<a class="link" href="/secteurs/${esc(c.sector.slug)}">${esc(c.sector.name)}</a>` : "",
    c.city ? `<span>${icon("mapPin", { size: 15 })}<a class="link" href="/villes/${esc(c.city.slug)}">${esc(c.city.name)}</a>${c.neighborhood ? ` · ${esc(c.neighborhood.name)}` : ""}</span>` : "",
    c.rating ? `<span>${ratingHtml(c)}</span>` : `<span>${icon("star", { size: 15 })}${t("company.noRating")}</span>`,
    openBadge(c.hours),
  ]
    .filter(Boolean)
    .join("");

  host.innerHTML = `
    <div class="company-cover" style="--cover-tint:${esc(c.sector?.color || "#22C07A")}66">
      <div class="cover-actions">
        <button type="button" class="icon-btn" data-favorite="${esc(c.slug)}" aria-pressed="false"
                aria-label="${t("company.favoriteAdd")}">${icon("heart", { size: 20 })}</button>
        <button type="button" class="icon-btn" data-share data-share-title="${esc(c.name)}"
                aria-label="${t("company.shareCompany")}">${icon("share2", { size: 19 })}</button>
        <button type="button" class="icon-btn" data-open-report aria-label="${t("company.report")}">
          ${icon("flag", { size: 19 })}
        </button>
      </div>
    </div>
    <div class="company-identity">
      ${logoMark(c.name, { size: "lg" })}
      <div class="company-headline">
        <h1>${esc(c.name)}</h1>
        <div class="company-subline">${subline}</div>
        <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">${badges.join("")}</div>
      </div>
    </div>
    ${
      c.provenance === "exemple"
        ? `<p class="banner warning" style="margin-top:18px">${icon("info", { size: 16 })}<span>${t(
            "company.exampleNote"
          )}</span></p>`
        : ""
    }
  `;
  refreshButtons(host);
}

/* --------------------------------------------------------------- onglets */

function renderTabs() {
  const host = $("#company-tabs");
  if (!host) return;
  const tabs = [
    ["about", t("company.about")],
    ["reviews", `${t("company.reviews")}${payload.summary?.total ? ` (${payload.summary.total})` : ""}`],
    ["offers", `${t("company.offers")}${payload.offers?.length ? ` (${payload.offers.length})` : ""}`],
    ["info", t("company.facts")],
  ];
  host.innerHTML = `
    <div class="tabs" role="tablist">
      ${tabs
        .map(
          ([id, label], index) =>
            `<a class="tab" role="tab" aria-selected="${index === 0}" href="#${id}" data-tab="${id}">${esc(label)}</a>`
        )
        .join("")}
    </div>`;

  host.querySelectorAll("[data-tab]").forEach((link) =>
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const target = document.getElementById(link.dataset.tab);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      host.querySelectorAll("[data-tab]").forEach((node) =>
        node.setAttribute("aria-selected", String(node === link))
      );
    })
  );
}

/* ------------------------------------------------------------------- corps */

function renderAbout(c) {
  const host = $("#company-about");
  if (!host) return;
  const text = c.long || c.short || "";
  host.innerHTML = `
    <h2>${t("company.about")}</h2>
    <div class="prose">
      ${
        text
          ? text
              .split(/\n{2,}/)
              .map((paragraph) => `<p>${esc(paragraph)}</p>`)
              .join("")
          : `<p class="faint">${t("company.noDescription")}</p>`
      }
    </div>
    ${
      c.benefits?.length
        ? `<h3 style="font-size:var(--text-md);margin-top:24px">${t("company.services")}</h3>
           <div class="chips wrap">${c.benefits
             .map((benefit) => `<span class="chip">${icon("check", { size: 14 })} ${esc(benefit)}</span>`)
             .join("")}</div>`
        : ""
    }
    ${
      c.hiringRoles?.length
        ? `<h3 style="font-size:var(--text-md);margin-top:24px">${t("offers.title")}</h3>
           <div class="chips wrap">${c.hiringRoles
             .map((role) => `<span class="chip">${icon("briefcase", { size: 14 })} ${esc(role)}</span>`)
             .join("")}</div>`
        : ""
    }
  `;
}

function factsRows(c) {
  const rows = [
    [t("company.legalName"), c.legalName],
    [t("common.sector"), c.sector?.name],
    [t("common.city"), c.city?.name],
    [t("common.quarter"), c.neighborhood?.name || c.district],
    [t("common.address"), c.address],
    [t("company.size"), c.sizeBand ? `${c.sizeBand}${c.employeesEstimate ? ` · ~${c.employeesEstimate}` : ""}` : ""],
    [t("company.founded"), c.foundedYear ? String(c.foundedYear) : ""],
    [t("company.languages"), (c.languages || []).map((code) => code.toUpperCase()).join(", ")],
    [t("company.verifiedOn"), c.verifiedAt ? formatDate(c.verifiedAt) : ""],
    [t("company.updated"), c.lastCheckedAt ? formatDate(c.lastCheckedAt) : ""],
  ].filter(([, value]) => value);

  return rows
    .map(
      ([label, value]) => `
      <div>
        <dt>${esc(label)}</dt>
        <dd>${esc(value)}</dd>
      </div>`
    )
    .join("");
}

function renderFacts(c) {
  const host = $("#company-facts");
  if (!host) return;
  host.innerHTML = `
    <h2>${t("company.facts")}</h2>
    <dl class="deflist">${factsRows(c)}</dl>
  `;
}

function renderHours(c) {
  const host = $("#company-hours");
  if (!host) return;
  if (!c.hours) {
    host.innerHTML = `<p class="faint small">${t("company.noServices")}</p>`;
    return;
  }
  const today = hoursForToday(c.hours)?.key;
  host.innerHTML = `
    <div class="hours-table">
      ${DAY_ORDER.map(
        (day) => `
        <div class="hours-row ${day === today ? "today" : ""}">
          <span>${esc(dayLabel(day))}</span>
          <span>${c.hours[day] ? esc(c.hours[day].replace("-", " – ")) : t("company.day.closed")}</span>
        </div>`
      ).join("")}
    </div>`;
}

function renderContact(c) {
  const host = $("#company-contact");
  if (!host) return;
  const tel = phoneHref(c.phone);
  const wa = whatsappHref(c.phone, `${c.name} — via CONGLOMERAT`);
  const site = websiteHref(c.contacts?.website);
  const email = c.contacts?.email;
  const directions = directionsUrl({ lat: c.lat, lng: c.lng, address: c.address, label: c.name });

  host.innerHTML = `
    <h2 style="font-size:var(--text-md)">${t("company.contact")}</h2>
    <dl>
      ${
        tel
          ? `<div><dt>${t("common.phone")}</dt><dd><a class="link" href="${tel}" data-track="phone">${esc(
              displayPhone(c.phone)
            )}</a></dd></div>`
          : ""
      }
      ${
        c.address
          ? `<div><dt>${t("common.address")}</dt><dd>${esc(c.address)}${c.landmark ? `<br /><span class="faint small">${esc(c.landmark)}</span>` : ""}</dd></div>`
          : ""
      }
      ${
        site
          ? `<div><dt>${t("common.website")}</dt><dd><a class="link" href="${esc(site)}" target="_blank" rel="noopener noreferrer nofollow" data-track="site">${esc(
              websiteLabel(c.contacts.website)
            )}</a></dd></div>`
          : ""
      }
      ${
        email
          ? `<div><dt>${t("common.email")}</dt><dd><a class="link" href="mailto:${esc(email)}">${esc(email)}</a></dd></div>`
          : ""
      }
    </dl>
    <div class="stack" style="gap:8px;margin-top:16px">
      ${tel ? `<a class="btn btn-primary block" href="${tel}" data-track="phone">${icon("phone", { size: 17 })} ${t("common.call")}</a>` : ""}
      ${wa ? `<a class="btn btn-secondary block" href="${wa}" target="_blank" rel="noopener noreferrer" data-track="whatsapp">${icon("whatsapp", { size: 17 })} ${t("common.whatsapp")}</a>` : ""}
      <a class="btn btn-outline block" href="${directions}" target="_blank" rel="noopener noreferrer" data-track="direction">${icon("navigation", { size: 17 })} ${t("common.directions")}</a>
    </div>
    <p class="notice-small" style="margin-top:12px">${t("company.claimHint")}
      <button type="button" class="link" data-open-claim>${t("company.claim")}</button>
    </p>
  `;
}

function reviewCard(review) {
  const ratings = review.ratings || {};
  const criteria = Object.keys(ratings)
    .filter((key) => ratings[key])
    .slice(0, 4);
  return `
    <article class="review-card" data-review="${esc(review.id)}">
      <div class="review-head">
        <div class="who">
          <span class="avatar">${esc((review.authorLabel || t("review.anonymous")).slice(0, 2).toUpperCase())}</span>
          <span>${esc(review.authorLabel || t("review.anonymous"))}</span>
          ${review.verifiedExperience ? `<span class="badge badge-verified">${icon("check", { size: 11 })} ${t("review.badge.verified")}</span>` : ""}
          <span class="faint">· ${formatDate(review.publishedAt || review.createdAt, "short")}</span>
        </div>
        <div>${starsHtml(review.rating, { size: 15 })}</div>
      </div>
      ${review.title ? `<h3 style="font-size:var(--text-md)">${esc(review.title)}</h3>` : ""}
      <div class="review-body">
        ${review.pros ? `<div class="review-block"><h4>${t("review.plus")}</h4><p>${esc(review.pros)}</p></div>` : ""}
        ${review.cons ? `<div class="review-block"><h4>${t("review.minus")}</h4><p>${esc(review.cons)}</p></div>` : ""}
      </div>
      ${
        criteria.length
          ? `<div class="row" style="gap:6px;flex-wrap:wrap">${criteria
              .map(
                (key) =>
                  `<span class="badge badge-new">${esc(t(`review.criteria.${key}`))} ${Number(ratings[key]).toFixed(1)}</span>`
              )
              .join("")}</div>`
          : ""
      }
      ${review.advice ? `<p class="small muted"><strong>${t("review.advice")} :</strong> ${esc(review.advice)}</p>` : ""}
      ${
        review.reply
          ? `<div class="review-reply"><div class="reply-head">${icon("building2", { size: 13 })} ${t(
              "review.badge.reply"
            )} · ${formatDate(review.reply.at, "short")}</div>${esc(review.reply.body)}</div>`
          : ""
      }
      <div class="review-actions">
        <button type="button" class="btn btn-ghost sm" data-helpful="${esc(review.id)}">
          ${icon("thumbsUp", { size: 15 })} ${t("review.helpful")}
          <span data-helpful-count>${formatNumber(review.helpfulCount || 0)}</span>
        </button>
        <button type="button" class="btn btn-ghost sm" data-open-report data-review-id="${esc(review.id)}">
          ${icon("flag", { size: 14 })} ${t("review.report")}
        </button>
      </div>
    </article>`;
}

function renderReviews(data) {
  const host = $("#company-reviews");
  if (!host) return;
  const summary = data.summary || { total: 0, distribution: {}, criteria: {} };
  const total = summary.total || 0;

  if (!total) {
    host.innerHTML = `
      <h2>${t("company.reviews")}</h2>
      ${emptyState({
        iconName: "star",
        title: t("company.noRating"),
        text: t("company.firstReview"),
        action: `<button type="button" class="btn btn-primary sm" data-open-review>${icon("pencil", {
          size: 15,
        })} ${t("company.addReview")}</button>`,
      })}`;
    return;
  }

  const dist = summary.distribution || {};
  const histogram = [5, 4, 3, 2, 1]
    .map((stars) => {
      const count = dist[stars] || 0;
      const percent = total ? Math.round((count / total) * 100) : 0;
      return `
        <button type="button" class="histogram-row" data-filter-rating="${stars}">
          <span>${stars} ${icon("star", { size: 11 })}</span>
          <span class="histogram-bar"><span style="width:${percent}%"></span></span>
          <span>${percent}%</span>
        </button>`;
    })
    .join("");

  const criteriaRows = Object.entries(summary.criteria || {})
    .filter(([, value]) => value)
    .map(([key, value]) => {
      const low = Number(value) < 3;
      return `
        <div class="criterion ${low ? "low" : ""}">
          <div class="criterion-head"><span>${esc(t(`review.criteria.${key}`))}</span><strong>${Number(value).toFixed(
            1
          )}</strong></div>
          <div class="bar"><span style="width:${(Number(value) / 5) * 100}%"></span></div>
        </div>`;
    })
    .join("");

  host.innerHTML = `
    <h2>${t("company.reviews")}</h2>
    <div class="review-summary card">
      <div class="rating-huge">
        <div class="value">${(summary.average || 0).toFixed(1)}</div>
        <div class="outof">/ 5</div>
        <div style="margin-top:6px">${starsHtml(summary.average || 0, { size: 16 })}</div>
        <p class="faint small" style="margin-top:6px">${t("company.basedOn", { n: formatNumber(total) })}</p>
      </div>
      <div>
        <div class="histogram">${histogram}</div>
      </div>
    </div>

    ${
      criteriaRows
        ? `<details class="filter-group" style="margin-top:24px">
             <summary>${t("company.ratingCriteria")} ${icon("chevronDown", { size: 16 })}</summary>
             <p class="notice-small" style="margin:8px 0 12px">${t("company.ratingCriteriaSub", { n: total })}</p>
             <div class="criteria-grid">${criteriaRows}</div>
           </details>`
        : ""
    }

    <div class="row-between" style="margin:24px 0 12px">
      <h3 style="font-size:var(--text-lg)">${t("review.title")}</h3>
      <button type="button" class="btn btn-primary sm" data-open-review>${icon("pencil", { size: 15 })} ${t(
        "company.addReview"
      )}</button>
    </div>
    <div class="company-list" id="review-list">
      ${(data.reviews?.items || []).map(reviewCard).join("")}
    </div>
    ${
      data.reviews?.total > (data.reviews?.items?.length || 0)
        ? `<p class="notice-small" style="margin-top:12px">${t("company.basedOn", {
            n: formatNumber(data.reviews.total),
          })}</p>`
        : ""
    }
  `;
}

function renderOffers(data) {
  const host = $("#company-offers");
  if (!host) return;
  host.innerHTML = `
    <div class="row-between" style="margin-bottom:12px">
      <h2>${t("company.offers")}</h2>
      <a class="btn btn-ghost sm" href="/offres?entreprise=${encodeURIComponent(company.slug)}">${t(
        "common.seeAll"
      )} ${icon("arrowRight", { size: 15 })}</a>
    </div>
    ${
      data.offers?.length
        ? `<div class="stack">${data.offers.map((offer) => offerCard(offer)).join("")}</div>`
        : `<p class="faint small">${t("company.noOffers")}</p>`
    }`;
}

function renderSimilar(companies) {
  const host = $("#company-similar");
  if (!host) return;
  if (!companies?.length) {
    host.closest("section")?.setAttribute("hidden", "");
    return;
  }
  host.innerHTML = `
    <div class="section-head">
      <div>
        <h2>${t("company.similar")}</h2>
        <p>${t("sectors.related")}</p>
      </div>
    </div>
    <div class="carousel">${companies
      .map((item) => `<div class="carousel-item">${companyCard(item)}</div>`)
      .join("")}</div>`;
  refreshButtons(host);
  revealOnScroll(host);
}

function renderActionBar(c) {
  const host = $("#company-action-bar");
  if (!host) return;
  const tel = phoneHref(c.phone);
  const wa = whatsappHref(c.phone, `${c.name} — via CONGLOMERAT`);
  host.innerHTML = `
    ${tel ? `<a class="btn btn-primary" href="${tel}" data-track="phone">${icon("phone", { size: 17 })} ${t("common.call")}</a>` : ""}
    ${wa ? `<a class="btn btn-secondary icon-only" href="${wa}" target="_blank" rel="noopener noreferrer" data-track="whatsapp" aria-label="${t("common.whatsapp")}">${icon("whatsapp", { size: 18 })}</a>` : ""}
    <a class="btn btn-outline icon-only" href="${directionsUrl({
      lat: c.lat,
      lng: c.lng,
      address: c.address,
      label: c.name,
    })}" target="_blank" rel="noopener noreferrer" data-track="direction" aria-label="${t("common.directions")}">${icon("navigation", {
      size: 18,
    })}</a>
    <button type="button" class="btn btn-ghost icon-only" data-open-review aria-label="${t("company.addReview")}">
      ${icon("pencil", { size: 18 })}
    </button>
  `;
}

/* ------------------------------------------------------------------ dialogues */

function closeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === "function" && dialog.open) dialog.close();
  else dialog.removeAttribute("open");
}

function openDialog(id) {
  const dialog = document.getElementById(id);
  if (!dialog) return null;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  return dialog;
}

function starsInput(name) {
  return `
    <div class="stars-input" role="group" aria-label="${t("review.overall")}" data-stars="${name}">
      ${[1, 2, 3, 4, 5]
        .map(
          (value) =>
            `<button type="button" data-value="${value}" class="on" aria-label="${t("review.stars", {
              n: value,
            })}" aria-pressed="true">${icon("star", { size: 26 })}</button>`
        )
        .join("")}
      <input type="hidden" name="${name}" value="5" />
    </div>`;
}

function buildReviewForm() {
  const criteria = [
    ["work_env", t("review.criteria.work_env")],
    ["management", t("review.criteria.management")],
    ["conditions", t("review.criteria.conditions")],
    ["pay", t("review.criteria.pay")],
    ["growth", t("review.criteria.growth")],
  ];
  const relationships = [
    "customer_partner",
    "current_employee",
    "former_employee",
    "candidate",
    "current_intern",
    "former_intern",
  ];
  return `
    <form id="review-form" class="stack" novalidate>
      <p class="notice-small">${t("review.form.submitHint")}</p>

      <div class="field">
        <label>${t("review.overall")} *</label>
        ${starsInput("overall")}
      </div>

      <details class="filter-group">
        <summary>${t("company.ratingCriteria")} ${icon("chevronDown", { size: 16 })}</summary>
        <div class="criteria-grid" style="margin-top:12px">
          ${criteria
            .map(
              ([key, label]) => `
            <div class="field">
              <label for="rating-${key}">${esc(label)}</label>
              <select class="select" id="rating-${key}" name="rating_${key}">
                <option value="">${t("common.optional")}</option>
                ${[5, 4, 3, 2, 1]
                  .map((value) => `<option value="${value}">${value} / 5</option>`)
                  .join("")}
              </select>
            </div>`
            )
            .join("")}
        </div>
      </details>

      <div class="field">
        <label for="review-relationship">${t("review.form.relationship")} *</label>
        <select class="select" id="review-relationship" name="relationship" required>
          ${relationships
            .map(
              (value) =>
                `<option value="${value}">${esc(t(`review.relationship.${value}`))}</option>`
            )
            .join("")}
        </select>
      </div>

      <div class="field">
        <label for="review-title">${t("review.titleField")} *</label>
        <input class="input" id="review-title" name="title" type="text" minlength="5" maxlength="80" required
               placeholder="${esc(t("review.titlePlaceholder"))}" />
      </div>

      <div class="field">
        <label for="review-pros">${t("review.plus")} *</label>
        <textarea class="textarea" id="review-pros" name="pros" minlength="40" maxlength="1500" required
                  rows="4" placeholder="${esc(t("review.form.minPros"))}"></textarea>
        <span class="hint" data-count-for="review-pros"></span>
      </div>

      <div class="field">
        <label for="review-cons">${t("review.minus")} *</label>
        <textarea class="textarea" id="review-cons" name="cons" minlength="40" maxlength="1500" required
                  rows="4" placeholder="${esc(t("review.form.minCons"))}"></textarea>
        <span class="hint" data-count-for="review-cons"></span>
      </div>

      <div class="field">
        <label for="review-advice">${t("review.advice")}</label>
        <textarea class="textarea" id="review-advice" name="advice" maxlength="1500" rows="2"></textarea>
      </div>

      <label class="checkbox">
        <input type="checkbox" name="consent" required />
        <span>${t("review.consent")}</span>
      </label>

      <div class="row" style="gap:8px;justify-content:flex-end">
        <button type="button" class="btn btn-ghost" data-close-dialog>${t("common.cancel")}</button>
        <button type="submit" class="btn btn-primary">${t("review.submit")}</button>
      </div>
    </form>`;
}

function wireStars(scope) {
  scope.querySelectorAll("[data-stars]").forEach((group) => {
    const input = group.querySelector("input[type=hidden]");
    group.querySelectorAll("button").forEach((button) =>
      button.addEventListener("click", () => {
        const value = Number(button.dataset.value);
        input.value = String(value);
        group.querySelectorAll("button").forEach((node) =>
          node.classList.toggle("on", Number(node.dataset.value) <= value)
        );
      })
    );
  });
}

function openReviewForm() {
  if (!currentUser) {
    toast.info(t("review.loginRequired"));
    location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
    return;
  }
  const dialog = $("#review-dialog");
  if (!dialog) return;
  const body = dialog.querySelector("[data-dialog-body]");
  body.innerHTML = buildReviewForm();
  wireStars(body);
  openDialog("review-dialog");
  body.querySelectorAll("textarea[maxlength]").forEach((area) => {
    const hint = body.querySelector(`[data-count-for="${area.id}"]`);
    const update = () => {
      if (hint) hint.textContent = t("review.charCount", { n: area.value.length, max: area.maxLength });
    };
    update();
    area.addEventListener("input", update);
  });
  body.querySelector("#review-form").addEventListener("submit", submitReview);
}

async function submitReview(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const title = String(data.get("title") || "").trim();
  const pros = String(data.get("pros") || "").trim();
  const cons = String(data.get("cons") || "").trim();

  if (title.length < 5 || pros.length < 40 || cons.length < 40 || !data.get("consent")) {
    toast.error(t("toast.formError"));
    return;
  }

  const overallValue = Number(data.get("overall") || 0);
  if (!overallValue) {
    toast.error(t("review.required"));
    return;
  }

  // Le serveur ne retient que ses propres critères : on les remplit, et on
  // retombe sur la note globale quand le détail n'est pas renseigné.
  const ratings = {};
  ["work_env", "management", "conditions", "pay", "growth"].forEach((key) => {
    const value = Number(data.get(`rating_${key}`) || 0);
    if (value > 0) ratings[key] = value;
  });
  if (!Object.keys(ratings).length) ratings.work_env = overallValue;

  const button = form.querySelector('button[type="submit"]');
  setLoading(button, true);
  try {
    await post("/reviews", {
      companySlug: company.slug,
      relationship: data.get("relationship"),
      ratings,
      title,
      pros,
      cons,
      advice: String(data.get("advice") || "").trim() || undefined,
    });
    closeDialog($("#review-dialog"));
    toast.success(t("review.submitted"), {
      action: {
        label: t("account.nav.reviews"),
        onClick: () => {
          location.href = "/compte#avis";
        },
      },
    });
  } catch (error) {
    toast.error(error.message || t("common.errorGeneric"));
  } finally {
    setLoading(button, false);
  }
}

function openReport(reviewId) {
  const dialog = $("#report-dialog");
  if (!dialog) return;
  const body = dialog.querySelector("[data-dialog-body]");
  const reasons = [
    ["adresse_incorrecte", t("common.address")],
    ["numero_errone", t("common.phone")],
    ["entreprise_inexistante", t("company.notFound")],
    ["entreprise_fermee", t("common.closed")],
    ["informations_trompeuses", t("common.error")],
    ["contenu_inapproprie", t("review.reportReasons.injurious")],
    ["doublon", t("common.example")],
    ["autre", t("review.reportReasons.other")],
  ];
  body.innerHTML = `
    <form id="report-form" class="stack" novalidate>
      <p class="notice-small">${t("company.reportHint")}</p>
      <div class="field">
        <label for="report-reason">${t("review.reportReason")}</label>
        <select class="select" id="report-reason" name="reason" required>
          ${reasons.map(([value, label]) => `<option value="${value}">${esc(label)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="report-details">${t("common.optional")}</label>
        <textarea class="textarea" id="report-details" name="details" rows="3" maxlength="1000"></textarea>
      </div>
      <div class="row" style="gap:8px;justify-content:flex-end">
        <button type="button" class="btn btn-ghost" data-close-dialog>${t("common.cancel")}</button>
        <button type="submit" class="btn btn-primary">${t("common.submit")}</button>
      </div>
    </form>`;
  openDialog("report-dialog");

  body.querySelector("#report-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    setLoading(button, true);
    try {
      await post("/reports", {
        targetType: reviewId ? "review" : "company",
        id: reviewId || undefined,
        slug: reviewId ? undefined : company.slug,
        reason: form.reason.value,
        details: form.details.value.trim() || undefined,
      });
      closeDialog(dialog);
      toast.success(t("review.reported"));
    } catch (error) {
      toast.error(error.message || t("common.errorGeneric"));
    } finally {
      setLoading(button, false);
    }
  });
}

function openClaim() {
  const dialog = $("#claim-dialog");
  if (!dialog) return;
  const body = dialog.querySelector("[data-dialog-body]");
  body.innerHTML = `
    <form id="claim-form" class="stack" novalidate>
      <p class="notice-small">${t("business.claim.text")}</p>
      <div class="field">
        <label for="claim-name">${t("contribute.submitterName")} *</label>
        <input class="input" id="claim-name" name="fullName" required minlength="3" maxlength="90"
               value="${esc(currentUser ? `${currentUser.firstName} ${currentUser.lastName}`.trim() : "")}" />
      </div>
      <div class="field">
        <label for="claim-role">${t("review.role")} *</label>
        <input class="input" id="claim-role" name="roleTitle" required minlength="2" maxlength="90" />
      </div>
      <div class="field">
        <label for="claim-email">${t("auth.email")} *</label>
        <input class="input" id="claim-email" name="workEmail" type="email" required
               value="${esc(currentUser?.email || "")}" />
      </div>
      <div class="field">
        <label for="claim-phone">${t("common.phone")}</label>
        <input class="input" id="claim-phone" name="phone" type="tel" inputmode="tel" />
      </div>
      <div class="field">
        <label for="claim-proof">${t("contribute.notes")}</label>
        <textarea class="textarea" id="claim-proof" name="proofNote" rows="3" maxlength="800"></textarea>
      </div>
      <div class="row" style="gap:8px;justify-content:flex-end">
        <button type="button" class="btn btn-ghost" data-close-dialog>${t("common.cancel")}</button>
        <button type="submit" class="btn btn-primary">${t("business.claim.submit")}</button>
      </div>
    </form>`;
  openDialog("claim-dialog");

  body.querySelector("#claim-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const data = new FormData(form);
    setLoading(button, true);
    try {
      await post("/claims", {
        companySlug: company.slug,
        fullName: String(data.get("fullName") || "").trim(),
        roleTitle: String(data.get("roleTitle") || "").trim(),
        workEmail: String(data.get("workEmail") || "").trim(),
        phone: String(data.get("phone") || "").trim() || undefined,
        proofNote: String(data.get("proofNote") || "").trim() || undefined,
      });
      closeDialog(dialog);
      toast.success(t("business.claim.sent"));
    } catch (error) {
      toast.error(error.message || t("common.errorGeneric"));
    } finally {
      setLoading(button, false);
    }
  });
}

/* ------------------------------------------------------------------ amorçage */

function wireActions() {
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-open-review]")) {
      event.preventDefault();
      openReviewForm();
      return;
    }
    if (event.target.closest("[data-open-report]")) {
      event.preventDefault();
      const id = event.target.closest("[data-review-id]")?.dataset.reviewId;
      openReport(id);
      return;
    }
    if (event.target.closest("[data-open-claim]")) {
      event.preventDefault();
      openClaim();
      return;
    }
    if (event.target.closest("[data-close-dialog]")) {
      event.preventDefault();
      closeDialog(event.target.closest("dialog"));
      return;
    }

    const helpBtn = event.target.closest("[data-helpful]");
    if (helpBtn) {
      event.preventDefault();
      voteHelpful(helpBtn);
      return;
    }

    const compareBtn = event.target.closest("[data-compare-toggle]");
    if (compareBtn) {
      event.preventDefault();
      toggleCompare(company);
      compareBtn.setAttribute("aria-pressed", String(inCompare(company.slug)));
    }
  });

  $$("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });
  });
}

async function voteHelpful(button) {
  if (!currentUser) {
    toast.info(t("review.loginRequired"));
    return;
  }
  const reviewId = button.dataset.helpful;
  setLoading(button, true);
  try {
    const data = await post("/votes", { reviewId });
    const count = button.querySelector("[data-helpful-count]");
    if (count) count.textContent = formatNumber(data.helpfulCount);
    button.setAttribute("aria-pressed", String(Boolean(data.voted)));
    toast.success(data.message);
  } catch (error) {
    toast.error(error.message || t("common.errorGeneric"));
  } finally {
    setLoading(button, false);
  }
}

function setMeta(data) {
  const c = data.company;
  const title = `${c.name}${c.city ? ` — ${c.city.name}` : ""} | CONGLOMERAT`;
  document.title = title;
  const description = (c.short || c.long || "").slice(0, 155);
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute("content", description);
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute("href", `${location.origin}${location.pathname}`);

  const ld = document.createElement("script");
  ld.type = "application/ld+json";
  ld.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: c.name,
    description: c.long || c.short,
    url: `${location.origin}${location.pathname}`,
    telephone: c.phone || undefined,
    address: c.address
      ? {
          "@type": "PostalAddress",
          streetAddress: c.address,
          addressLocality: c.city?.name,
          addressCountry: "CM",
        }
      : undefined,
    geo:
      Number.isFinite(c.lat) && Number.isFinite(c.lng)
        ? { "@type": "GeoCoordinates", latitude: c.lat, longitude: c.lng }
        : undefined,
    aggregateRating:
      c.rating && data.summary?.total
        ? { "@type": "AggregateRating", ratingValue: c.rating, reviewCount: data.summary.total }
        : undefined,
  });
  document.head.appendChild(ld);
}

function renderLocation(c) {
  const host = $("#company-map");
  if (!host) return;
  const coordinates = Number.isFinite(c.lat) && Number.isFinite(c.lng) &&
    Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180;
  const address = [c.address, c.city?.name, "Cameroun"].filter(Boolean).join(", ");
  if (!coordinates && !c.address) {
    host.closest("#company-map-wrap").hidden = true;
    return;
  }
  const external = c.provenance !== "exemple";
  host.innerHTML = `
    <p class="muted small">${esc(c.address || c.city?.name || c.name)}</p>
    ${external ? `<button type="button" class="btn btn-secondary sm" data-load-map>
      ${icon("mapPin", { size: 16 })} ${t("company.previewMap")}</button>
      <p class="small muted">${t("company.mapPrivacy")}</p>` : ""}
    <a class="link small" href="${esc(mapUrl({ lat: c.lat, lng: c.lng, label: c.name }))}">
      ${t("company.openInMaps")}</a>`;
  host.querySelector("[data-load-map]")?.addEventListener("click", (event) => {
    const frame = document.createElement("iframe");
    const params = new URLSearchParams({ q: coordinates ? `${c.lat},${c.lng}` : address, z: "16", output: "embed" });
    frame.src = `https://www.google.com/maps?${params}`;
    frame.className = "company-mini-map";
    frame.title = `${t("company.mapTitle")} : ${c.name}`;
    frame.loading = "lazy";
    frame.referrerPolicy = "no-referrer";
    frame.tabIndex = 0;
    event.currentTarget.replaceWith(frame);
    frame.focus({ preventScroll: true });
  }, { once: true });
}

export async function init({ user, userReady } = {}) {
  currentUser = user || null;
  userReady?.then((resolved) => { currentUser = resolved; });
  const slug = decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "");
  const host = $("#company-root");

  try {
    payload = await get(`/companies/${encodeURIComponent(slug)}`, { cacheMs: 30_000 });
  } catch (error) {
    if (host) {
      const gone = error.status === 410;
      if (!gone && error.status !== 404) {
        const failure = host.querySelector("[data-company-failure]") || document.createElement("div");
        failure.dataset.companyFailure = "";
        failure.className = "container section";
        failure.innerHTML = errorState({ text: errorMessage(error), retryAttr: "data-company-retry" });
        host.prepend(failure);
        failure.querySelector("button")?.addEventListener("click", () => {
          failure.remove();
          init({ user, userReady });
        });
        return;
      }
      host.innerHTML = `
        <div class="container section">
          <div class="empty-state">
            ${icon(gone ? "circleAlert" : "search", { size: 36 })}
            <h1>${gone ? t("company.gone") : t("company.notFound")}</h1>
            <p>${esc(errorMessage(error))}</p>
            <div class="row" style="justify-content:center;gap:8px">
              <a class="btn btn-primary" href="/explorer">${t("nav.explore")}</a>
              <a class="btn btn-ghost" href="/">${t("nav.home")}</a>
            </div>
          </div>
        </div>`;
    }
    return;
  }

  company = payload.company;
  document.body.dataset.company = company.slug;
  setMeta(payload);

  renderHeader(payload);
  renderTabs();
  renderAbout(company);
  renderFacts(company);
  renderHours(company);
  renderContact(company);
  renderReviews(payload);
  renderOffers(payload);
  renderSimilar(payload.similar);
  renderActionBar(company);
  wireActions();

  const compareBtn = $("#compare-button");
  if (compareBtn) {
    compareBtn.setAttribute("aria-pressed", String(inCompare(company.slug)));
    compareBtn.addEventListener("click", (event) => {
      event.preventDefault();
      toggleCompare(company);
      compareBtn.setAttribute("aria-pressed", String(inCompare(company.slug)));
    });
  }

  renderLocation(company);

  const fav = document.querySelector(`[data-favorite="${company.slug}"]`);
  if (fav) fav.setAttribute("aria-pressed", String(isFavorite(company.slug)));

  trackView(company.slug);

  revealOnScroll();
  document.title = `${company.name} — CONGLOMERAT`;
}

export default { init };
