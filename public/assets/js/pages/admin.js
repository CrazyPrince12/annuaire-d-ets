/**
 * Panneau d'administration — modération, données, réglages.
 *
 * Les droits sont décidés côté serveur (`/api/admin/data` et `/api/admin/actions`
 * vérifient le rôle et la permission à chaque appel) ; l'interface masque
 * simplement ce qui n'est pas autorisé pour éviter les allers-retours inutiles.
 */

import { get, post, can } from "../core/api.js";
import { t, formatNumber, formatCurrency, formatDate, formatDateTime } from "../core/i18n.js";
import { icon } from "../core/icons.js";
import { toast, confirmDialog } from "../core/toast.js";
import { $, $$, esc, emptyState, errorState, errorMessage, setLoading, debounce } from "../core/ui.js";

const SECTIONS = [
  { id: "overview", key: "admin.section.overview", icon: "gauge" },
  { id: "queue", key: "admin.section.queue", icon: "inbox" },
  { id: "reviews", key: "admin.section.reviews", icon: "star" },
  { id: "contributions", key: "admin.section.contributions", icon: "fileText" },
  { id: "reports", key: "admin.section.reports", icon: "flag" },
  { id: "claims", key: "admin.section.claims", icon: "badgeCheck" },
  { id: "companies", key: "admin.section.companies", icon: "building2" },
  { id: "offers", key: "admin.section.offers", icon: "briefcase" },
  { id: "users", key: "admin.section.users", icon: "users", perm: "users.read" },
  { id: "payments", key: "admin.section.payments", icon: "wallet", perm: "payments.read" },
  { id: "messages", key: "admin.section.messages", icon: "messageCircle", perm: "messages.read" },
  { id: "audit", key: "admin.section.audit", icon: "shield", perm: "audit.read" },
  { id: "settings", key: "admin.section.settings", icon: "settings", perm: "settings.write" },
];

let user = null;
let section = "overview";
let cache = {};
let searchTerm = "";

function visibleSections() {
  return SECTIONS.filter((item) => !item.perm || can(user, item.perm));
}

function currentHash() {
  const hash = location.hash.replace("#", "");
  return visibleSections().some((item) => item.id === hash) ? hash : "overview";
}

function renderNav() {
  const host = $("#admin-nav");
  const mobile = $("#admin-mobile-nav");
  const items = visibleSections();
  const nav = items
    .map(
      (item) => `
      <a class="nav-item" href="#${item.id}" ${item.id === section ? 'aria-current="page"' : ""}>
        ${icon(item.icon, { size: 17 })} <span>${t(item.key)}</span>
      </a>`
    )
    .join("");

  if (host) host.innerHTML = `<div class="group-label">${t("admin.title")}</div>${nav}`;
  if (mobile) {
    mobile.innerHTML = items
      .slice(0, 5)
      .map(
        (item) => `
        <a href="#${item.id}" ${item.id === section ? 'aria-current="page"' : ""}>
          ${icon(item.icon, { size: 20 })}<span>${t(item.key.split(".").pop())}</span>
        </a>`
      )
      .join("");
  }
}

/* ------------------------------------------------------------------ vues */

function kpi(label, value, delta = "") {
  return `<div class="kpi"><div class="value">${value}</div><div class="label">${esc(label)}</div>
    ${delta ? `<div class="delta">${delta}</div>` : ""}</div>`;
}

function renderOverview(data) {
  const k = data.kpis || {};
  cache.demoCount = k.companies_demo || 0;
  const activity = data.activity || [];
  const max = Math.max(1, ...activity.map((day) => Math.max(day.reviews, day.companies)));

  return `
    <div class="kpi-grid">
      ${kpi(t("admin.kpi.companies"), formatNumber(k.companies_published))}
      ${kpi(t("admin.kpi.verified"), formatNumber(k.companies_verified))}
      ${kpi(t("admin.kpi.reviews"), formatNumber(k.reviews_published))}
      ${kpi(t("admin.kpi.revenue"), formatCurrency(k.revenue_xaf))}
      ${kpi(t("admin.kpi.reviewsPending"), formatNumber(k.reviews_pending))}
      ${kpi(t("admin.kpi.offers"), formatNumber(k.offers_published))}
      ${kpi(t("admin.kpi.users"), formatNumber(k.users_total))}
      ${kpi(t("admin.kpi.pending"), formatNumber(
        (k.reviews_pending || 0) + (k.contributions_pending || 0) + (k.reports_open || 0) + (k.claims_pending || 0)
      ))}
    </div>

    <div class="review-detail">
      <div class="panel">
        <div class="panel-head"><h2 style="font-size:var(--text-md)">${t("admin.section.overview")}</h2>
          <span class="faint small">14 ${t("common.today").toLowerCase()}</span></div>
        <div class="panel-body">
          <div class="bar-chart">
            ${activity
              .map(
                (day) =>
                  `<div class="bar" style="height:${Math.round(
                    (Math.max(day.reviews, day.companies) / max) * 100
                  )}%" title="${esc(day.day)} · ${day.reviews} avis"></div>`
              )
              .join("")}
          </div>
          <div class="bar-labels">${activity.map((day) => `<span>${esc(day.day)}</span>`).join("")}</div>
        </div>
      </div>

      <div class="stack" style="gap:16px">
        <div class="panel">
          <div class="panel-head"><h2 style="font-size:var(--text-md)">${t("admin.table.company")}</h2></div>
          <div class="panel-body stack" style="gap:8px">
            ${(data.topCompanies || [])
              .map(
                (company) => `
              <div class="row-between">
                <a class="link small" href="/entreprises/${esc(company.slug)}">${esc(company.name)}</a>
                <span class="faint small">${t("company.views", { n: formatNumber(company.view_count) })}</span>
              </div>`
              )
              .join("")}
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2 style="font-size:var(--text-md)">${t("admin.section.audit")}</h2></div>
          <div class="panel-body stack" style="gap:8px">
            ${(data.recentAudit || [])
              .map(
                (entry) => `
              <div class="small">
                <strong>${esc(entry.action)}</strong>
                <span class="faint"> · ${esc(entry.actor_email || "")} · ${formatDateTime(entry.created_at)}</span>
              </div>`
              )
              .join("")}
          </div>
        </div>
      </div>
    </div>`;
}

function kindLabel(kind) {
  return (
    {
      review: t("admin.section.reviews"),
      contribution: t("admin.section.contributions"),
      report: t("admin.section.reports"),
      claim: t("admin.section.claims"),
      offer: t("admin.section.offers"),
    }[kind] || kind
  );
}

function renderQueue(data) {
  const items = data.items || [];
  if (!items.length) return emptyState({ iconName: "checkCheck", title: t("admin.queue.empty") });
  return `
    <p class="faint small" style="margin-bottom:12px">${t("admin.queue.count", { n: items.length })}</p>
    <div class="panel">
      ${items
        .map(
          (item) => `
        <button type="button" class="queue-item" data-queue-kind="${esc(item.kind)}">
          <span class="queue-dot ${item.kind === "report" ? "red" : item.kind === "review" ? "green" : "yellow"}"></span>
          <span style="flex:1;min-width:0">
            <span class="badge badge-new">${esc(kindLabel(item.kind))}</span>
            <strong style="display:block;margin-top:4px">${esc(item.label || "")}</strong>
            <span class="faint small">${esc(item.company_name || "")} · ${formatDate(item.created_at, "short")}</span>
          </span>
          ${icon("chevronRight", { size: 16 })}
        </button>`
        )
        .join("")}
    </div>`;
}

function statusTabs(resource, statuses, active, counts) {
  return `<div class="admin-tabs">${statuses
    .map((status) => {
      const count = (counts || []).find((row) => row.status === status)?.total;
      return `<button type="button" class="chip ${status === active ? "is-active" : ""}"
        data-status-filter="${status}" data-resource="${resource}">
        ${esc(status === "open" ? t("admin.filter.pending") : status)}${count !== undefined ? ` (${count})` : ""}
      </button>`;
    })
    .join("")}</div>`;
}

function renderReviews(data) {
  const items = data.items || [];
  return `
    ${statusTabs("reviews", ["pending", "published", "rejected", "hidden"], data.status, data.counts)}
    ${
      items.length
        ? items
            .map(
              (review) => `
        <article class="card" style="margin-bottom:12px" data-review-row="${esc(review.id)}">
          <div class="row-between" style="gap:12px;flex-wrap:wrap">
            <div>
              <strong>${esc(review.company_name)}</strong>
              <span class="badge badge-new" style="margin-left:8px">${esc(review.rating_overall)}/5</span>
              <p class="faint small">${esc(review.author_email || "")} · ${formatDate(review.created_at, "short")}
                ${(review.moderation_flags || []).length ? ` · ${(review.moderation_flags || []).length} ${t("admin.filter.pending").toLowerCase()}` : ""}</p>
            </div>
            <div class="row" style="gap:6px">
              <a class="btn btn-ghost sm" href="/entreprises/${esc(review.company_slug)}" target="_blank" rel="noopener">
                ${icon("externalLink", { size: 14 })}
              </a>
              <button type="button" class="btn btn-primary sm" data-moderation="review" data-action="approve" data-id="${esc(
                review.id
              )}">${t("admin.action.approve")}</button>
              <button type="button" class="btn btn-danger sm" data-moderation="review" data-action="reject" data-id="${esc(
                review.id
              )}">${t("admin.action.reject")}</button>
            </div>
          </div>
          ${review.title ? `<h3 style="font-size:var(--text-md);margin-top:10px">${esc(review.title)}</h3>` : ""}
          <div class="review-body" style="margin-top:8px">
            ${review.pros ? `<div class="review-block"><h4>${t("review.plus")}</h4><p>${esc(review.pros)}</p></div>` : ""}
            ${review.cons ? `<div class="review-block"><h4>${t("review.minus")}</h4><p>${esc(review.cons)}</p></div>` : ""}
          </div>
          ${review.decision_reason ? `<p class="notice-small">${t("admin.table.reason")} : ${esc(review.decision_reason)}</p>` : ""}
        </article>`
            )
            .join("")
        : emptyState({ iconName: "star", title: t("admin.empty") })
    }`;
}

function payloadSummary(payload) {
  if (!payload) return "";
  const entries = Object.entries(payload)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 6)
    .map(([key, value]) => `<li><strong>${esc(key)}</strong> : ${esc(String(value).slice(0, 120))}</li>`)
    .join("");
  return entries ? `<ul class="prose" style="margin-top:8px">${entries}</ul>` : "";
}

function renderContributions(data) {
  const items = data.items || [];
  if (!items.length) return emptyState({ iconName: "fileText", title: t("admin.empty") });
  return items
    .map(
      (item) => `
    <article class="card" style="margin-bottom:12px">
      <div class="row-between" style="gap:12px;flex-wrap:wrap">
        <div>
          <strong>${esc(item.payload?.name || item.company_name || "—")}</strong>
          <span class="badge badge-new" style="margin-left:8px">${esc(item.kind)}</span>
          <p class="faint small">${formatDate(item.created_at, "short")} · ${esc(item.payload?.sector || "")} ${esc(
            item.payload?.city || ""
          )}</p>
        </div>
        <div class="row" style="gap:6px">
          <button type="button" class="btn btn-primary sm" data-moderation="contribution" data-action="approve" data-id="${esc(
            item.id
          )}">${t("admin.action.approve")}</button>
          <button type="button" class="btn btn-danger sm" data-moderation="contribution" data-action="reject" data-id="${esc(
            item.id
          )}">${t("admin.action.reject")}</button>
        </div>
      </div>
      ${payloadSummary(item.payload)}
    </article>`
    )
    .join("");
}

function renderReports(data) {
  const items = data.items || [];
  if (!items.length) return emptyState({ iconName: "flag", title: t("admin.empty") });
  return items
    .map(
      (item) => `
    <article class="card" style="margin-bottom:12px">
      <div class="row-between" style="gap:12px;flex-wrap:wrap">
        <div>
          <strong>${esc(item.reason)}</strong>
          <p class="faint small">${esc(item.company_name || "")} · ${formatDate(item.created_at, "short")} · ${esc(
            item.status
          )}</p>
          ${item.details ? `<p class="small muted">${esc(item.details)}</p>` : ""}
        </div>
        ${
          item.status === "open"
            ? `<div class="row" style="gap:6px">
                <button type="button" class="btn btn-primary sm" data-moderation="report" data-action="resolve" data-id="${esc(
                  item.id
                )}">${t("admin.action.resolve")}</button>
                <button type="button" class="btn btn-ghost sm" data-moderation="report" data-action="reject" data-id="${esc(
                  item.id
                )}">${t("admin.action.dismiss")}</button>
              </div>`
            : ""
        }
      </div>
    </article>`
    )
    .join("");
}

function renderClaims(data) {
  const items = data.items || [];
  if (!items.length) return emptyState({ iconName: "badgeCheck", title: t("admin.empty") });
  return items
    .map(
      (item) => `
    <article class="card" style="margin-bottom:12px">
      <div class="row-between" style="gap:12px;flex-wrap:wrap">
        <div>
          <strong>${esc(item.full_name)}</strong> · <span class="faint">${esc(item.role_title)}</span>
          <p class="small muted">${esc(item.company_name)} · ${esc(item.work_email)}</p>
          ${item.proof_note ? `<p class="notice-small">${esc(item.proof_note)}</p>` : ""}
        </div>
        ${
          item.status === "pending"
            ? `<div class="row" style="gap:6px">
                <button type="button" class="btn btn-primary sm" data-moderation="claim" data-action="approve" data-id="${esc(
                  item.id
                )}">${t("admin.action.approve")}</button>
                <button type="button" class="btn btn-ghost sm" data-moderation="claim" data-action="reject" data-id="${esc(
                  item.id
                )}">${t("admin.action.reject")}</button>
              </div>`
            : `<span class="badge badge-new">${esc(item.status)}</span>`
        }
      </div>
    </article>`
    )
    .join("");
}

function renderCompanies(data) {
  const items = data.items || [];
  return `
    ${
      can(user, "settings.write")
        ? `<div class="row" style="gap:8px;justify-content:flex-end;margin-bottom:12px">
             <button type="button" class="btn btn-danger sm" data-purge-demo>${icon("trash2", { size: 15 })} ${t(
               "admin.action.purgeDemo"
             )}</button>
           </div>`
        : ""
    }
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("admin.table.company")}</th>
            <th>${t("admin.table.status")}</th>
            <th>${t("common.rating")}</th>
            <th>${t("admin.table.date")}</th>
            <th>${t("admin.table.actions")}</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (company) => `
            <tr>
              <td>
                <a class="link" href="/entreprises/${esc(company.slug)}" target="_blank" rel="noopener">${esc(
                  company.name
                )}</a>
                <div class="faint small">${esc(company.city_name || "")} · ${esc(company.sector_name || "")}
                  ${company.provenance === "exemple" ? " · exemple" : ""}</div>
              </td>
              <td><span class="badge ${company.publication_status === "published" ? "badge-verified" : "badge-hiring"}">${esc(
                company.publication_status
              )}</span>
                ${company.verification_level ? `<span class="badge badge-partner">V${company.verification_level}</span>` : ""}
              </td>
              <td class="mono-num">${company.rating_count ? Number(company.rating_avg).toFixed(1) : "—"}</td>
              <td class="small faint">${formatDate(company.updated_at, "short")}</td>
              <td>
                <div class="row" style="gap:4px;flex-wrap:wrap">
                  <button type="button" class="btn btn-ghost sm" data-moderation="company"
                    data-action="${company.publication_status === "published" ? "unpublish" : "publish"}"
                    data-id="${esc(company.id)}">
                    ${company.publication_status === "published" ? t("admin.action.unpublish") : t("admin.action.publish")}
                  </button>
                  <button type="button" class="btn btn-ghost sm" data-moderation="company" data-action="verify"
                    data-id="${esc(company.id)}" data-level="${company.verification_level ? 0 : 1}">
                    ${company.verification_level ? t("admin.action.unverify") : t("admin.action.verify")}
                  </button>
                </div>
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function renderOffers(data) {
  const items = data.items || [];
  return `
    ${statusTabs("offers", ["pending", "published", "closed", "rejected"], data.status, data.counts)}
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>${t("admin.table.item")}</th><th>${t("admin.table.company")}</th>
          <th>${t("offers.contract")}</th><th>${t("admin.table.status")}</th><th>${t("admin.table.actions")}</th>
        </tr></thead>
        <tbody>
          ${
            items.length
              ? items
                  .map(
                    (offer) => `
              <tr>
                <td><a class="link" href="/offres/${esc(offer.slug)}" target="_blank" rel="noopener">${esc(
                      offer.title
                    )}</a></td>
                <td class="small">${esc(offer.company_name)}</td>
                <td class="small">${esc(t(`offers.contract.${offer.contract_type}`))}</td>
                <td><span class="badge badge-new">${esc(offer.status)}</span></td>
                <td>
                  <div class="row" style="gap:4px">
                    ${
                      offer.status !== "published"
                        ? `<button class="btn btn-primary sm" data-moderation="offer" data-action="publish" data-id="${esc(
                            offer.id
                          )}">${t("admin.action.publish")}</button>`
                        : `<button class="btn btn-ghost sm" data-moderation="offer" data-action="close" data-id="${esc(
                            offer.id
                          )}">${t("admin.action.unpublish")}</button>`
                    }
                    <button class="btn btn-danger sm" data-moderation="offer" data-action="reject" data-id="${esc(
                      offer.id
                    )}">${t("admin.action.reject")}</button>
                  </div>
                </td>
              </tr>`
                  )
                  .join("")
              : `<tr><td colspan="5">${t("admin.empty")}</td></tr>`
          }
        </tbody>
      </table>
    </div>`;
}

function renderUsers(data) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>${t("auth.email")}</th><th>${t("admin.table.status")}</th>
          <th>${t("common.reviews")}</th><th>${t("admin.table.date")}</th><th>${t("admin.table.actions")}</th>
        </tr></thead>
        <tbody>
          ${(data.items || [])
            .map(
              (item) => `
            <tr>
              <td>${esc(item.email)}<div class="faint small">${esc(item.first_name || "")} ${esc(
                item.last_name || ""
              )}</div></td>
              <td><span class="badge badge-new">${esc(item.role)}</span>
                <span class="badge ${item.status === "active" ? "badge-verified" : "badge-danger"}">${esc(
                  item.status
                )}</span></td>
              <td class="mono-num">${formatNumber(item.reviews)}</td>
              <td class="small faint">${formatDate(item.created_at, "short")}</td>
              <td>
                <button class="btn btn-ghost sm" data-moderation="user"
                  data-action="${item.status === "active" ? "suspend" : "restore"}"
                  data-id="${esc(item.id)}">${item.status === "active" ? t("admin.action.reject") : t("admin.action.approve")}</button>
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function renderPayments(data) {
  const totals = data.totals || {};
  return `
    <div class="kpi-grid">
      ${kpi(t("admin.section.payments"), formatNumber(totals.total))}
      ${kpi(t("admin.kpi.revenue"), formatCurrency(totals.revenue))}
      ${kpi(t("admin.kpi.pending"), formatNumber(totals.pending))}
    </div>
    ${
      data.mode === "demo"
        ? `<div class="banner warning">${icon("info", { size: 16 })}<span>${t("premium.payDemoText", {
            pin: "123456",
          })}</span></div>`
        : ""
    }
    <div class="table-wrap">
      <table>
        <thead><tr><th>${t("premium.invoice")}</th><th>${t("admin.table.author")}</th><th>${t("common.of")}</th>
          <th>${t("admin.table.status")}</th><th>${t("admin.table.date")}</th></tr></thead>
        <tbody>
          ${(data.items || [])
            .map(
              (payment) => `<tr>
                <td class="mono-num small">${esc(payment.provider_ref)}</td>
                <td class="small">${esc(payment.buyer_email || "")}</td>
                <td class="mono-num">${formatCurrency(payment.amount_xaf)}</td>
                <td><span class="badge badge-new">${esc(payment.status)}</span></td>
                <td class="small faint">${formatDate(payment.created_at, "short")}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function renderMessages(data) {
  const items = data.items || [];
  if (!items.length) return emptyState({ iconName: "messageCircle", title: t("admin.empty") });
  return items
    .map(
      (item) => `
    <article class="card" style="margin-bottom:12px">
      <div class="row-between" style="gap:12px">
        <strong>${esc(item.name)}</strong>
        <span class="faint small">${formatDateTime(item.created_at)}</span>
      </div>
      <p class="small muted">${esc(item.subject || "")} · <a class="link" href="mailto:${esc(item.email)}">${esc(
        item.email
      )}</a></p>
      <p class="small">${esc(item.message)}</p>
    </article>`
    )
    .join("");
}

function renderAudit(data) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>${t("admin.audit.when")}</th><th>${t("admin.audit.who")}</th><th>${t("admin.audit.what")}</th>
          <th>${t("admin.audit.target")}</th></tr></thead>
        <tbody>
          ${(data.items || [])
            .map(
              (entry) => `<tr>
                <td class="small faint">${formatDateTime(entry.created_at)}</td>
                <td class="small">${esc(entry.actor_email || "")}</td>
                <td class="small"><strong>${esc(entry.action)}</strong></td>
                <td class="small faint">${esc(entry.object_type || "")} ${esc(
                  entry.object_id ? String(entry.object_id).slice(0, 8) : ""
                )}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function settingLabel(key) {
  return key.replace(/_/g, " ");
}

function renderSettings(data) {
  return `
    <div class="panel">
      <div class="panel-head"><h2 style="font-size:var(--text-md)">${t("admin.settings.site")}</h2></div>
      <div class="panel-body stack" style="gap:12px">
        ${(data.items || [])
          .map(
            (item) => `
          <form class="row" style="gap:8px;align-items:flex-end" data-setting="${esc(item.key)}">
            <div class="field" style="flex:1;min-width:0">
              <label>${esc(settingLabel(item.key))}</label>
              <input class="input" name="value" value="${esc(
                typeof item.value === "string" ? item.value : JSON.stringify(item.value)
              )}" />
            </div>
            <button class="btn btn-secondary" type="submit">${t("common.save")}</button>
          </form>`
          )
          .join("")}
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ données */

const RENDERERS = {
  overview: renderOverview,
  queue: renderQueue,
  reviews: renderReviews,
  contributions: renderContributions,
  reports: renderReports,
  claims: renderClaims,
  companies: renderCompanies,
  offers: renderOffers,
  users: renderUsers,
  payments: renderPayments,
  messages: renderMessages,
  audit: renderAudit,
  settings: renderSettings,
};

function filtersFor(section) {
  if (section === "reviews") return { status: cache.reviewStatus || "pending" };
  if (section === "offers") return { status: cache.offerStatus || "pending" };
  if (section === "companies") return { q: searchTerm || undefined };
  return {};
}

async function load() {
  const host = $("#admin-content");
  if (!host) return;
  host.innerHTML = `<div class="skeleton" style="height:120px"></div>`;
  const title = $("#admin-title");
  if (title) title.textContent = t(SECTIONS.find((item) => item.id === section)?.key || "admin.title");

  try {
    const data = await get("/admin/data", { params: { resource: section, ...filtersFor(section) }, cacheMs: 0 });
    const render = RENDERERS[section] || (() => emptyState({ iconName: "inbox", title: t("admin.empty") }));
    host.innerHTML = render(data);
    window.dispatchEvent(new CustomEvent("cg:admin-rendered", { detail: { section } }));
  } catch (error) {
    host.innerHTML = errorState({ text: errorMessage(error), retryAttr: "data-retry-admin" });
    host.querySelector("[data-retry-admin]")?.addEventListener("click", load);
    toast.error(errorMessage(error));
  }
}

async function act(resource, action, id, payload = {}) {
  try {
    const result = await post("/admin/actions", { resource, action, id, payload });
    toast.success(result.message || t("admin.action.saved"));
    await load();
  } catch (error) {
    toast.error(error.message || t("admin.action.failed"));
  }
}

/* ------------------------------------------------------------------ amorçage */

function wire() {
  document.addEventListener("click", async (event) => {
    const moderation = event.target.closest("[data-moderation]");
    if (moderation) {
      event.preventDefault();
      const { moderation: resource, action, id } = moderation.dataset;
      const payload = {};
      if (action === "reject" || action === "hide" || action === "resolve") {
        const reason = window.prompt(t("admin.rejectReason"), "");
        if (reason === null) return;
        payload.reason = reason || t("admin.table.reason");
      }
      if (resource === "company" && action === "verify") {
        payload.level = Number(moderation.dataset.level || 1);
      }
      setLoading(moderation, true);
      await act(resource, action, id, payload);
      setLoading(moderation, false);
      return;
    }

    const statusFilter = event.target.closest("[data-status-filter]");
    if (statusFilter) {
      event.preventDefault();
      const resource = statusFilter.dataset.resource;
      if (resource === "reviews") cache.reviewStatus = statusFilter.dataset.statusFilter;
      if (resource === "offers") cache.offerStatus = statusFilter.dataset.statusFilter;
      await load();
      return;
    }

    const queueItem = event.target.closest("[data-queue-kind]");
    if (queueItem) {
      const map = { review: "reviews", contribution: "contributions", report: "reports", claim: "claims", offer: "offers" };
      const target = map[queueItem.dataset.queueKind];
      if (target) {
        location.hash = `#${target}`;
      }
      return;
    }

    if (event.target.closest("[data-purge-demo]")) {
      event.preventDefault();
      const ok = await confirmDialog({
        title: t("admin.action.purgeDemo"),
        text: t("admin.action.purgeDemoConfirm", { n: formatNumber(cache.demoCount || 0) }),
        confirmLabel: t("common.delete"),
        danger: true,
      });
      if (!ok) return;
      try {
        const result = await post("/admin/actions", {
          resource: "company",
          action: "purge_demo",
          id: "00000000-0000-0000-0000-000000000000",
          payload: { confirm: "SUPPRIMER" },
        });
        toast.success(result.message);
        await load();
      } catch (error) {
        toast.error(error.message || t("admin.action.failed"));
      }
    }
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-setting]");
    if (!form) {
      return;
    }
    event.preventDefault();
    const key = form.dataset.setting;
    const value = form.querySelector('input[name="value"]').value;
    let parsed = value;
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = value;
    }
    try {
      await post("/admin/actions", { resource: "settings", action: "update", id: "", payload: { key, value: parsed } });
      toast.success(t("admin.settings.saved"));
    } catch (error) {
      toast.error(error.message || t("admin.action.failed"));
    }
  });

  const search = $("#admin-search");
  if (search) {
    search.addEventListener(
      "input",
      debounce(() => {
        searchTerm = search.value.trim();
        if (section === "companies") load();
      }, 350)
    );
  }

  window.addEventListener("hashchange", () => {
    section = currentHash();
    renderNav();
    load();
  });
}

export async function init({ user: sessionUser } = {}) {
  user = sessionUser;
  const isStaff = user && ["super_admin", "admin", "moderator"].includes(user.role);

  if (!isStaff) {
    const root = $("#admin-root");
    if (root) {
      root.innerHTML = `<div class="container section">
        <div class="empty-state">
          ${icon("lock", { size: 34 })}
          <h1>${t("admin.denied")}</h1>
          <p>${t("admin.deniedText")}</p>
          <a class="btn btn-primary" href="/login?next=/admin">${t("nav.login")}</a>
        </div></div>`;
    }
    return;
  }

  section = currentHash();
  renderNav();

  const who = $("#admin-user");
  if (who) who.textContent = `${user.firstName || user.email} · ${user.roleLabel || user.role}`;

  try {
    const meta = await get("/meta", { cacheMs: 5 * 60_000 });
    if (meta?.settings?.demoBanner) {
      const banner = $("#admin-demo-banner");
      if (banner) {
        banner.hidden = false;
        banner.innerHTML = `${icon("info", { size: 16 })}<span>${t("admin.demoBanner")}</span>`;
      }
    }
  } catch {
    /* bandeau facultatif */
  }

  wire();
  await load();
}

export default { init };
