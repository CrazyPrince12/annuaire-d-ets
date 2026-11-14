/**
 * Espace entreprise — /api/enterprise.
 * Les droits sont vérifiés côté serveur à chaque écriture ; l'interface ne fait
 * que refléter ce que l'API autorise (`canEdit`, rôle sur chaque fiche).
 */

import { get, patch, post } from "../core/api.js";
import { t, formatDate, formatNumber, formatCurrency } from "../core/i18n.js";
import { icon } from "../core/icons.js";
import { toast } from "../core/toast.js";
import {
  $,
  $$,
  esc,
  emptyState,
  errorMessage,
  setLoading,
  logoMark,
  ratingHtml,
  DAY_ORDER,
  dayLabel,
} from "../core/ui.js";
import { CONTRACTS } from "../core/constants.js";

let data = null;

function statusBadge(status) {
  const map = {
    published: ["badge-verified", "admin.filter.published"],
    pending: ["badge-hiring", "admin.filter.pending"],
    draft: ["badge-new", "admin.filter.pending"],
    rejected: ["badge-danger", "admin.filter.rejected"],
    closed: ["badge-closed", "offers.expired"],
    expired: ["badge-closed", "offers.expired"],
  };
  const [cls, key] = map[status] || ["badge-new", "admin.filter.pending"];
  return `<span class="badge ${cls}">${t(key)}</span>`;
}

function renderStats(company) {
  return `
    <div class="stat-grid four" style="margin-top:12px">
      <div class="stat-card"><span class="stat-value">${formatNumber(company.views30d || 0)}</span>
        <span class="stat-label">${t("business.views30")}</span></div>
      <div class="stat-card"><span class="stat-value">${formatNumber(company.phoneClicks || 0)}</span>
        <span class="stat-label">${t("business.phoneClicks")}</span></div>
      <div class="stat-card"><span class="stat-value">${formatNumber(company.directionClicks || 0)}</span>
        <span class="stat-label">${t("business.directions")}</span></div>
      <div class="stat-card"><span class="stat-value">${formatNumber(company.reviewsPublished || 0)}</span>
        <span class="stat-label">${t("business.reviews")}</span></div>
    </div>`;
}

function renderCompanies(companies) {
  const host = $("#business-companies");
  if (!host) return;
  if (!companies.length) {
    host.innerHTML = emptyState({
      iconName: "building2",
      title: t("business.noCompanies"),
      text: t("business.claim.text"),
      action: `<a class="btn btn-primary sm" href="/contribuer">${t("nav.contribute")}</a>`,
    });
    return;
  }
  host.innerHTML = companies
    .map(
      (company) => `
    <article class="card pad-lg" data-company="${esc(company.slug)}">
      <div class="row-between" style="gap:12px;flex-wrap:wrap">
        <div class="row" style="gap:12px;align-items:center">
          ${logoMark(company.name, { size: "sm" })}
          <div>
            <h3 style="font-size:var(--text-md)">${esc(company.name)}</h3>
            <p class="faint small">${esc(company.city || "")} · ${esc(company.role)} · ${statusBadge(
        company.status
      )}</p>
          </div>
        </div>
        <div class="row" style="gap:6px">
          <a class="btn btn-ghost sm" href="/entreprises/${esc(company.slug)}">${t("admin.impersonate")}</a>
          ${
            ["owner", "editor"].includes(company.role)
              ? `<button type="button" class="btn btn-secondary sm" data-edit-company="${esc(company.slug)}">
                   ${icon("pencil", { size: 15 })} ${t("business.editProfile")}</button>`
              : ""
          }
        </div>
      </div>
      ${renderStats(company)}
    </article>`
    )
    .join("");
}

function renderOffers(offers) {
  const host = $("#business-offers");
  if (!host) return;
  if (!offers.length) {
    host.innerHTML = emptyState({ iconName: "briefcase", title: t("business.noOffers") });
    return;
  }
  host.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("admin.table.item")}</th>
            <th>${t("offers.contract")}</th>
            <th>${t("admin.table.status")}</th>
            <th>${t("admin.table.date")}</th>
            <th>${t("admin.table.actions")}</th>
          </tr>
        </thead>
        <tbody>
          ${offers
            .map(
              (offer) => `
            <tr>
              <td><a class="link" href="/offres/${esc(offer.slug)}">${esc(offer.title)}</a>
                <div class="faint small">${esc(offer.company_name)}</div></td>
              <td>${esc(t(`offers.contract.${offer.contract_type}`))}</td>
              <td>${statusBadge(offer.status)}</td>
              <td class="small faint">${formatDate(offer.published_at, "short")}</td>
              <td>
                ${
                  offer.status === "closed"
                    ? `<button class="btn btn-ghost sm" data-offer-status="${esc(
                        offer.slug
                      )}" data-status="published">${t("admin.action.publish")}</button>`
                    : `<button class="btn btn-ghost sm" data-offer-status="${esc(
                        offer.slug
                      )}" data-status="closed">${t("admin.action.unpublish")}</button>`
                }
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function renderClaims(claims) {
  const host = $("#business-claims");
  if (!host) return;
  host.innerHTML = claims?.length
    ? claims
        .map(
          (claim) => `
      <div class="row-between card" style="gap:12px">
        <div>
          <strong>${esc(claim.company_name)}</strong>
          <p class="faint small">${esc(claim.work_email)} · ${formatDate(claim.created_at, "short")}</p>
        </div>
        ${statusBadge(claim.status === "pending" ? "pending" : claim.status === "approved" ? "published" : "rejected")}
      </div>`
        )
        .join("")
    : `<p class="faint small">${t("business.claim.text")}</p>`;
}

function renderPayments(payments) {
  const host = $("#business-payments");
  if (!host) return;
  host.innerHTML = payments?.length
    ? payments
        .map(
          (payment) => `
      <div class="row-between card" style="gap:12px">
        <div>
          <strong>${esc(payment.provider_ref)}</strong>
          <p class="faint small">${formatDate(payment.created_at, "short")} · ${esc(payment.channel || "")}</p>
        </div>
        <span>${formatCurrency(payment.amount_xaf)} ${statusBadge(
            payment.status === "succeeded" ? "published" : "pending"
          )}</span>
      </div>`
        )
        .join("")
    : `<p class="faint small">${t("premium.history")} — ${t("common.empty")}</p>`;
}

function companyDialog(slug) {
  const company = data.companies.find((item) => item.slug === slug);
  if (!company) return;
  const dialog = $("#company-dialog");
  const body = dialog.querySelector("[data-dialog-body]");

  body.innerHTML = `
    <form id="company-form" class="stack" novalidate>
      <p class="notice-small">${t("business.subtitle")}</p>
      <div class="field">
        <label for="edit-short">${t("contribute.description")} — ${t("common.short")}</label>
        <input class="input" id="edit-short" name="short" maxlength="280" value="${esc(company.short || "")}" />
      </div>
      <div class="field">
        <label for="edit-phone">${t("common.phone")}</label>
        <input class="input" id="edit-phone" name="phone" type="tel" inputmode="tel" />
        <span class="hint">${t("contribute.phoneHint")}</span>
      </div>
      <div class="field">
        <label for="edit-website">${t("common.website")}</label>
        <input class="input" id="edit-website" name="website" type="url" placeholder="https://" />
      </div>
      <div class="field">
        <label for="edit-address">${t("common.address")}</label>
        <input class="input" id="edit-address" name="address" maxlength="200" />
      </div>
      <div class="field">
        <label>${t("common.hours")}</label>
        <div class="hours-edit">
          ${DAY_ORDER.map(
            (day) => `
            <label class="row" style="gap:8px;align-items:center">
              <span class="faint small" style="width:82px">${esc(dayLabel(day))}</span>
              <input class="input" name="hours_${day}" placeholder="08:00-17:30" maxlength="20" />
            </label>`
          ).join("")}
        </div>
      </div>
      <div class="row" style="gap:8px;justify-content:flex-end">
        <button type="button" class="btn btn-ghost" data-close-dialog>${t("common.cancel")}</button>
        <button type="submit" class="btn btn-primary">${t("common.save")}</button>
      </div>
    </form>`;

  // Pré-remplissage via la fiche publique (contacts et horaires complets).
  get(`/companies/${encodeURIComponent(slug)}`)
    .then((payload) => {
      const c = payload.company;
      const set = (name, value) => {
        const input = body.querySelector(`[name="${name}"]`);
        if (input && value) input.value = value;
      };
      set("short", c.short || "");
      set("phone", c.phone || "");
      set("website", c.contacts?.website || "");
      set("address", c.address || "");
      DAY_ORDER.forEach((day) => set(`hours_${day}`, c.hours?.[day] || ""));
    })
    .catch(() => null);

  body.querySelector("#company-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const hours = {};
    DAY_ORDER.forEach((day) => {
      hours[day] = String(formData.get(`hours_${day}`) || "").trim();
    });
    const button = form.querySelector('button[type="submit"]');
    setLoading(button, true);
    try {
      await patch("/enterprise", {
        companySlug: slug,
        short: String(formData.get("short") || ""),
        phone: String(formData.get("phone") || ""),
        website: String(formData.get("website") || ""),
        address: String(formData.get("address") || ""),
        hours,
      });
      toast.success(t("admin.action.saved"));
      closeDialog(dialog);
      await load();
    } catch (error) {
      toast.error(error.message || t("common.errorGeneric"));
    } finally {
      setLoading(button, false);
    }
  });

  openDialog(dialog);
}

function offerDialog() {
  const dialog = $("#offer-dialog");
  const body = dialog.querySelector("[data-dialog-body]");
  const companies = data.companies.filter((company) => ["owner", "editor", "recruiter"].includes(company.role));
  if (!companies.length) {
    toast.warning(t("business.noCompanies"));
    return;
  }

  body.innerHTML = `
    <form id="offer-form" class="stack" novalidate>
      <div class="field">
        <label for="offer-company">${t("admin.table.company")}</label>
        <select class="select" id="offer-company" name="companySlug" required>
          ${companies.map((c) => `<option value="${esc(c.slug)}">${esc(c.name)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="offer-title">${t("admin.table.item")}</label>
        <input class="input" id="offer-title" name="title" required minlength="4" maxlength="140" />
      </div>
      <div class="field">
        <label for="offer-contract">${t("offers.contract")}</label>
        <select class="select" id="offer-contract" name="contractType">
          ${CONTRACTS.map(
            (value) => `<option value="${value}">${esc(t(`offers.contract.${value}`))}</option>`
          ).join("")}
        </select>
      </div>
      <div class="field">
        <label for="offer-description">${t("company.about")}</label>
        <textarea class="textarea" id="offer-description" name="description" rows="3" maxlength="2000"></textarea>
      </div>
      <div class="field">
        <label for="offer-missions">${t("offers.missions")}</label>
        <textarea class="textarea" id="offer-missions" name="missions" rows="3" maxlength="2000"></textarea>
      </div>
      <div class="field">
        <label for="offer-profile">${t("offers.profile")}</label>
        <textarea class="textarea" id="offer-profile" name="profile" rows="3" maxlength="2000"></textarea>
      </div>
      <div class="form-grid two">
        <div class="field">
          <label for="offer-deadline">${t("offers.deadline", { date: "" })}</label>
          <input class="input" id="offer-deadline" name="deadline" type="date" />
        </div>
        <div class="field">
          <label for="offer-education">${t("review.role")}</label>
          <input class="input" id="offer-education" name="educationLevel" maxlength="80" />
        </div>
      </div>
      <div class="row" style="gap:8px;justify-content:flex-end">
        <button type="button" class="btn btn-ghost" data-close-dialog>${t("common.cancel")}</button>
        <button type="submit" class="btn btn-primary">${t("business.offerNew")}</button>
      </div>
    </form>`;

  body.querySelector("#offer-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const button = form.querySelector('button[type="submit"]');
    setLoading(button, true);
    try {
      const result = await post("/enterprise", {
        action: "offer.create",
        companySlug: String(formData.get("companySlug")),
        title: String(formData.get("title") || ""),
        contractType: String(formData.get("contractType")),
        description: String(formData.get("description") || "") || undefined,
        missions: String(formData.get("missions") || "") || undefined,
        profile: String(formData.get("profile") || "") || undefined,
        educationLevel: String(formData.get("educationLevel") || "") || undefined,
        deadline: String(formData.get("deadline") || "") || undefined,
      });
      closeDialog(dialog);
      toast.success(result.message || t("admin.action.saved"));
      await load();
    } catch (error) {
      toast.error(error.message || t("common.errorGeneric"));
    } finally {
      setLoading(button, false);
    }
  });

  openDialog(dialog);
}

function openDialog(dialog) {
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeDialog(dialog) {
  if (typeof dialog.close === "function" && dialog.open) dialog.close();
  else dialog.removeAttribute("open");
}

async function load() {
  data = await get("/enterprise", { cacheMs: 0 });
  renderCompanies(data.companies);
  renderOffers(data.offers);
  renderClaims(data.claims);
  renderPayments(data.payments);
}

export async function init({ user } = {}) {
  const root = $("#business-root");
  if (!root) return;

  if (!user) {
    root.innerHTML = `
      <div class="container section">
        ${emptyState({
          iconName: "building2",
          title: t("business.title"),
          text: t("business.claim.text"),
          action: `<a class="btn btn-primary" href="/login?next=${encodeURIComponent(
            location.pathname
          )}">${t("nav.login")}</a>`,
        })}
      </div>`;
    return;
  }

  try {
    await load();
  } catch (error) {
    root.innerHTML = `<div class="container section">${emptyState({
      iconName: "alertTriangle",
      title: t("common.error"),
      text: errorMessage(error),
    })}</div>`;
    toast.error(errorMessage(error));
    return;
  }

  $("#business-new-offer")?.addEventListener("click", offerDialog);

  document.addEventListener("click", async (event) => {
    const edit = event.target.closest("[data-edit-company]");
    if (edit) {
      event.preventDefault();
      companyDialog(edit.dataset.editCompany);
      return;
    }
    if (event.target.closest("[data-close-dialog]")) {
      event.preventDefault();
      closeDialog(event.target.closest("dialog"));
      return;
    }
    const statusBtn = event.target.closest("[data-offer-status]");
    if (statusBtn) {
      event.preventDefault();
      setLoading(statusBtn, true);
      try {
        await post("/enterprise", {
          action: "offer.status",
          slug: statusBtn.dataset.offerStatus,
          status: statusBtn.dataset.status,
        });
        toast.success(t("admin.action.saved"));
        await load();
      } catch (error) {
        toast.error(error.message || t("common.errorGeneric"));
      } finally {
        setLoading(statusBtn, false);
      }
    }
  });

  $$("dialog").forEach((dialog) =>
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog(dialog);
    })
  );
}

export default { init };
