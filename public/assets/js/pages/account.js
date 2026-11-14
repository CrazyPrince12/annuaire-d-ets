/**
 * Mon compte — vue d'ensemble, avis, favoris, alertes, candidatures, réglages.
 * Toutes les actions d'écriture repassent par l'API : aucun état local seul.
 */

import { get, patch, del, post } from "../core/api.js";
import { t, formatDate, formatNumber } from "../core/i18n.js";
import { icon } from "../core/icons.js";
import { toast, confirmDialog } from "../core/toast.js";
import {
  $,
  $$,
  esc,
  starsHtml,
  emptyState,
  errorMessage,
  setLoading,
} from "../core/ui.js";
import * as storage from "../core/storage.js";
import { getSaver, setSaver } from "../core/theme.js";
import { favorites, removeFavorite } from "../core/favorites.js";

const SECTIONS = ["apercu", "avis", "favoris", "alertes", "candidatures", "parametres"];

function sectionFromHash() {
  const hash = location.hash.replace("#", "");
  return SECTIONS.includes(hash) ? hash : "apercu";
}

function showSection(name) {
  $$("[data-account-section]").forEach((section) => {
    section.hidden = section.dataset.accountSection !== name;
  });
  $$(".account-nav a").forEach((link) => {
    const target = link.getAttribute("href").replace("#", "");
    if (target === name) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function statusBadge(status) {
  const map = {
    pending: ["badge-hiring", "account.reviews.status.pending"],
    published: ["badge-verified", "account.reviews.status.published"],
    rejected: ["badge-danger", "account.reviews.status.rejected"],
    hidden: ["badge-new", "account.reviews.status.rejected"],
  };
  const [cls, key] = map[status] || ["badge-new", "account.reviews.status.pending"];
  return `<span class="badge ${cls}">${t(key)}</span>`;
}

function renderOverview(me) {
  const counts = me.overview?.counts || {};
  const host = $("#account-stats");
  if (!host) return;
  host.innerHTML = `
    <div class="stat-card"><span class="stat-value">${formatNumber(counts.reviews || 0)}</span>
      <span class="stat-label">${t("account.overview.reviews")}</span></div>
    <div class="stat-card"><span class="stat-value">${formatNumber(counts.reviews_pending || 0)}</span>
      <span class="stat-label">${t("account.overview.pending")}</span></div>
    <div class="stat-card"><span class="stat-value">${formatNumber(
      Math.max(counts.favorites || 0, favorites().length)
    )}</span><span class="stat-label">${t("account.overview.favorites")}</span></div>
    <div class="stat-card"><span class="stat-value">${formatNumber(counts.alerts || 0)}</span>
      <span class="stat-label">${t("account.overview.alerts")}</span></div>`;

  const subscription = me.overview?.subscription;
  const premium = $("#account-premium");
  if (premium) {
    premium.innerHTML = subscription
      ? `<div class="banner success">${icon("badgeCheck", { size: 16 })}
          <span>${t("business.premiumActive", { date: formatDate(subscription.ends_at) })} · ${esc(
            subscription.plan_name
          )}</span></div>`
      : "";
  }

  const applications = me.overview?.applications || [];
  const apps = $("#account-applications");
  if (apps) {
    apps.innerHTML = applications.length
      ? applications
          .map(
            (application) => `
        <div class="kanban-card">
          <div class="company">${esc(application.title)}</div>
          <div class="meta">${esc(application.company_name)} · ${formatDate(application.created_at, "short")}</div>
          <div class="meta">${esc(t(`account.trackers.status.${application.status}`)) || application.status}</div>
        </div>`
          )
          .join("")
      : `<p class="faint small">${t("account.trackers.empty")}</p>`;
  }
}

function renderReviews(data) {
  const host = $("#account-reviews");
  if (!host) return;
  const items = data.items || [];
  if (!items.length) {
    host.innerHTML = emptyState({
      iconName: "star",
      title: t("account.reviews.empty"),
      action: `<a class="btn btn-secondary sm" href="/explorer">${t("account.reviews.emptyCta")}</a>`,
    });
    return;
  }
  host.innerHTML = items
    .map(
      (review) => `
    <article class="review-card">
      <div class="review-head">
        <div class="who">
          <a class="link" href="/entreprises/${esc(review.company_slug)}">${esc(review.company_name)}</a>
          <span class="faint">· ${formatDate(review.created_at, "short")}</span>
          ${statusBadge(review.status)}
        </div>
        <div>${starsHtml(Number(review.rating_overall), { size: 14 })}</div>
      </div>
      ${review.title ? `<h3 style="font-size:var(--text-md)">${esc(review.title)}</h3>` : ""}
      <p class="small muted">${esc(review.pros || "")}</p>
      ${
        review.decision_reason
          ? `<p class="notice-small">${t("admin.table.reason")} : ${esc(review.decision_reason)}</p>`
          : ""
      }
    </article>`
    )
    .join("");
}

function renderFavorites(remote) {
  const host = $("#account-favorites");
  if (!host) return;
  const local = favorites();
  const merged = new Map();
  local.forEach((item) => merged.set(item.slug, { slug: item.slug, name: item.name }));
  (remote?.companies || []).forEach((company) => merged.set(company.slug, company));

  const items = [...merged.values()];
  if (!items.length) {
    host.innerHTML = emptyState({
      iconName: "heart",
      title: t("account.favorites.empty"),
      action: `<a class="btn btn-secondary sm" href="/explorer">${t("nav.explore")}</a>`,
    });
    return;
  }
  host.innerHTML = items
    .map(
      (item) => `
    <div class="row-between card" style="gap:12px">
      <div style="min-width:0">
        <a class="link" href="/entreprises/${esc(item.slug)}" style="font-weight:600">${esc(item.name)}</a>
        <p class="faint small">${esc(item.city?.name || item.city || "")}</p>
      </div>
      <button type="button" class="btn btn-ghost sm" data-remove-favorite="${esc(item.slug)}">
        ${icon("x", { size: 14 })} ${t("account.favorites.remove")}
      </button>
    </div>`
    )
    .join("");
}

function renderAlerts(data) {
  const host = $("#account-alerts");
  if (!host) return;
  const items = data.items || [];
  host.innerHTML = items.length
    ? items
        .map(
          (alert) => `
      <div class="row-between card" style="gap:12px">
        <div style="min-width:0">
          <strong>${esc(
            (alert.filters?.q || "").trim() ||
              [...(alert.filters?.cities || []), ...(alert.filters?.sectors || [])].join(", ") ||
              t("account.alerts.new")
          )}</strong>
          <p class="faint small">${esc(t(`account.alerts.frequency.${alert.frequency}`))} · ${
            alert.active ? t("common.open") : t("common.closed")
          }</p>
        </div>
        <button type="button" class="btn btn-ghost sm" data-delete-alert="${esc(alert.id)}">
          ${icon("trash2", { size: 14 })} ${t("common.delete")}
        </button>
      </div>`
        )
        .join("")
    : emptyState({ iconName: "bell", title: t("account.alerts.empty") });
}

function renderTrackers(data) {
  const host = $("#account-trackers");
  if (!host) return;
  const items = data.items || [];
  host.innerHTML = items.length
    ? `<div class="kanban">${["sent", "interview", "accepted", "rejected"]
        .map((status) => {
          const bucket = items.filter((item) => item.status === status);
          return `<div class="kanban-col"><h4>${t(`account.trackers.status.${status}`)} <span>${
            bucket.length
          }</span></h4>${bucket
            .map(
              (item) => `
            <div class="kanban-card">
              <div class="company">${esc(item.offer_title || item.free_label || "—")}</div>
              <div class="meta">${esc(item.company_name || "")}</div>
            </div>`
            )
            .join("")}</div>`;
        })
        .join("")}</div>`
    : emptyState({ iconName: "briefcase", title: t("account.trackers.empty") });
}

function wireAlerts() {
  $("#alert-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const button = form.querySelector('button[type="submit"]');
    setLoading(button, true);
    try {
      await post("/me-alerts", {
        q: String(data.get("q") || "").trim(),
        cities: data.get("city") ? [String(data.get("city"))] : [],
        sectors: data.get("sector") ? [String(data.get("sector"))] : [],
        frequency: String(data.get("frequency") || "weekly"),
      });
      toast.success(t("account.alerts.created"));
      form.reset();
      await loadAlerts();
    } catch (error) {
      toast.error(error.message || t("common.errorGeneric"));
    } finally {
      setLoading(button, false);
    }
  });
}

async function loadAlerts() {
  try {
    renderAlerts(await get("/me-alerts", { cacheMs: 0 }));
  } catch (error) {
    toast.error(errorMessage(error));
  }
}

function wireSettings(user) {
  const form = $("#settings-form");
  if (form) {
    form.querySelector('[name="firstName"]').value = user.firstName || "";
    form.querySelector('[name="lastName"]').value = user.lastName || "";
    form.querySelector('[name="pseudonym"]').value = user.pseudonym || "";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const button = form.querySelector('button[type="submit"]');
      setLoading(button, true);
      try {
        await patch("/me", {
          firstName: String(data.get("firstName") || "").trim() || undefined,
          lastName: String(data.get("lastName") || "").trim() || undefined,
          pseudonym: String(data.get("pseudonym") || "").trim() || undefined,
        });
        toast.success(t("account.settings.saved"));
      } catch (error) {
        toast.error(error.message || t("common.errorGeneric"));
      } finally {
        setLoading(button, false);
      }
    });
  }

  const saver = $("#saver-toggle");
  if (saver) {
    saver.checked = getSaver();
    saver.addEventListener("change", () => {
      setSaver(saver.checked);
      storage.write(storage.KEYS.saver, saver.checked);
      toast.success(t("account.settings.saved"));
    });
  }

  $("#delete-account")?.addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: t("account.settings.deleteAccount"),
      text: t("account.settings.deleteHint"),
      confirmLabel: t("common.delete"),
      danger: true,
    });
    if (!ok) return;
    try {
      await del("/me");
      toast.success(t("account.settings.saved"));
      setTimeout(() => (location.href = "/"), 600);
    } catch (error) {
      toast.error(error.message || t("common.errorGeneric"));
    }
  });
}

function renderMissingUser() {
  const host = $("#account-root");
  if (!host) return;
  host.innerHTML = `
    <div class="container section">
      ${emptyState({
        iconName: "user",
        title: t("auth.loginTitle"),
        text: t("auth.loginSubtitle"),
        action: `<a class="btn btn-primary" href="/login?next=${encodeURIComponent(
          location.pathname
        )}">${t("nav.login")}</a>
        <a class="btn btn-ghost" href="/login?mode=register">${t("nav.signup")}</a>`,
      })}
    </div>`;
}

export async function init({ user } = {}) {
  if (!user) {
    renderMissingUser();
    return;
  }

  const greeting = $("#account-greeting");
  if (greeting) greeting.textContent = t("account.greeting", { name: user.firstName || user.email });
  const since = $("#account-since");
  if (since) since.textContent = user.email || "";

  showSection(sectionFromHash());
  $$(".account-nav a").forEach((link) =>
    link.addEventListener("click", () => {
      const name = link.getAttribute("href").replace("#", "");
      if (SECTIONS.includes(name)) showSection(name);
    })
  );
  window.addEventListener("hashchange", () => showSection(sectionFromHash()));

  try {
    const [me, reviews, remoteFavorites, alerts, trackers] = await Promise.all([
      get("/me", { cacheMs: 0 }),
      get("/me-reviews", { cacheMs: 0 }).catch(() => ({ items: [] })),
      get("/me-favorites", { cacheMs: 0 }).catch(() => ({ companies: [] })),
      get("/me-alerts", { cacheMs: 0 }).catch(() => ({ items: [] })),
      get("/me-trackers", { cacheMs: 0 }).catch(() => ({ items: [] })),
    ]);

    renderOverview(me);
    renderReviews(reviews);
    renderFavorites(remoteFavorites);
    renderAlerts(alerts);
    renderTrackers(trackers);
    wireSettings(me.user || user);
    wireAlerts();
  } catch (error) {
    toast.error(errorMessage(error));
  }

  document.addEventListener("click", async (event) => {
    const remove = event.target.closest("[data-remove-favorite]");
    if (remove) {
      event.preventDefault();
      const slug = remove.dataset.removeFavorite;
      removeFavorite(slug);
      try {
        await del("/me-favorites", { type: "company", slug });
      } catch {
        /* le favori local est déjà retiré */
      }
      remove.closest(".card")?.remove();
      return;
    }
    const alertDelete = event.target.closest("[data-delete-alert]");
    if (alertDelete) {
      event.preventDefault();
      try {
        await del("/me-alerts", { id: alertDelete.dataset.deleteAlert });
        toast.success(t("account.alerts.deleted"));
        await loadAlerts();
      } catch (error) {
        toast.error(error.message || t("common.errorGeneric"));
      }
    }
  });
}

export default { init };
