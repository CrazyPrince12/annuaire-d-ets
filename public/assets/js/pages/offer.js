/**
 * Détail d'une offre — contenu, entreprise, candidature, offres proches.
 * La candidature interne exige un compte (règle serveur) : la page propose donc
 * un repli clair (téléphone / e-mail de l'entreprise) pour les visiteurs.
 */

import { get, post } from "../core/api.js";
import { t, formatDate, formatNumber, formatRelative } from "../core/i18n.js";
import { icon } from "../core/icons.js";
import { toast } from "../core/toast.js";
import {
  $,
  esc,
  salaryLabel,
  contractLabel,
  offerCard,
  logoMark,
  ratingHtml,
  displayPhone,
  phoneHref,
  directionsUrl,
  emptyState,
  errorMessage,
  share,
  setLoading,
  revealOnScroll,
} from "../core/ui.js";

function metaRow(label, value, iconName) {
  if (!value) return "";
  return `<div class="offer-meta-row">${icon(iconName, { size: 16 })}<span class="faint">${esc(
    label
  )}</span><strong>${esc(value)}</strong></div>`;
}

function render(data) {
  const { offer, company } = data;
  const host = $("#offer-root");
  if (!host) return;

  const expired = offer.expired || offer.status !== "published";
  const salary = offer.salary
    ? (offer.salary.min && offer.salary.max && offer.salary.min !== offer.salary.max
        ? `${formatNumber(offer.salary.min)} – ${formatNumber(offer.salary.max)} FCFA`
        : `${formatNumber(offer.salary.min)} FCFA`)
    : t("offers.salary.negotiable");

  host.innerHTML = `
    <div class="container">
      <nav class="breadcrumb" style="padding-top:16px" aria-label="Fil d'Ariane">
        <a href="/" data-i18n="nav.home">Accueil</a>
        <span aria-hidden="true">${icon("chevronRight", { size: 14 })}</span>
        <a href="/offres">${t("offers.title")}</a>
        <span aria-hidden="true">${icon("chevronRight", { size: 14 })}</span>
        <span aria-current="page">${esc(offer.title)}</span>
      </nav>

      <div class="company-layout" style="padding-top:24px">
        <article class="stack" style="gap:24px">
          <header class="stack" style="gap:12px">
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <span class="badge ${offer.isInternship ? "badge-intern" : "badge-verified"}">${esc(
                contractLabel(offer.contractType)
              )}</span>
              ${expired ? `<span class="badge badge-danger">${t("offers.expired")}</span>` : ""}
              ${
                offer.deadlineAt
                  ? `<span class="badge badge-new">${icon("clock", { size: 12 })} ${esc(
                      t("offers.deadline", { date: formatDate(offer.deadlineAt, "short") })
                    )}</span>`
                  : ""
              }
              ${offer.provenance === "exemple" ? `<span class="example-flag">${t("common.example")}</span>` : ""}
            </div>
            <h1>${esc(offer.title)}</h1>
            <div class="company-subline">
              <a class="link" href="/entreprises/${esc(offer.company.slug)}">${esc(offer.company.name)}</a>
              ${offer.city ? `<span>${icon("mapPin", { size: 15 })}${esc(offer.city.name)}${
                offer.neighborhood ? ` · ${esc(offer.neighborhood.name)}` : ""
              }</span>` : ""}
              ${offer.sector ? `<span>${icon("tag", { size: 15 })}${esc(offer.sector.name)}</span>` : ""}
              <span class="faint">${icon("calendar", { size: 15 })}${esc(
                t("offers.published", { date: formatDate(offer.publishedAt, "short") })
              )}</span>
            </div>
          </header>

          <div class="card pad-lg stack" style="gap:16px">
            <div class="offer-meta-grid">
              ${metaRow(t("offers.salary"), salary, "wallet")}
              ${metaRow(t("offers.experience"), offer.experienceBand ? t(`offers.experience.${offer.experienceBand}`) : "", "trendingUp")}
              ${metaRow(t("review.role"), offer.educationLevel, "graduationCap")}
              ${metaRow(t("offers.contract"), contractLabel(offer.contractType), "fileText")}
            </div>
            ${
              !expired
                ? `<button type="button" class="btn btn-primary" data-open-apply>${icon("send", {
                    size: 17,
                  })} ${t("offers.apply")}</button>`
                : `<p class="banner warning">${icon("info", { size: 16 })}<span>${t(
                    "offers.applyClosed"
                  )}</span></p>`
            }
          </div>

          ${
            offer.description
              ? `<section><h2>${t("company.about")}</h2><div class="prose"><p>${esc(
                  offer.description
                )}</p></div></section>`
              : ""
          }
          ${
            offer.missions
              ? `<section><h2>${t("offers.missions")}</h2><div class="prose">${String(offer.missions)
                  .split(/\n+/)
                  .filter(Boolean)
                  .map((line) => `<p>${esc(line.replace(/^[-•]\s*/, ""))}</p>`)
                  .join("")}</div></section>`
              : ""
          }
          ${
            offer.profile
              ? `<section><h2>${t("offers.profile")}</h2><div class="prose">${String(offer.profile)
                  .split(/\n+/)
                  .filter(Boolean)
                  .map((line) => `<p>${esc(line.replace(/^[-•]\s*/, ""))}</p>`)
                  .join("")}</div></section>`
              : ""
          }
          ${
            Array.isArray(offer.benefits) && offer.benefits.length
              ? `<section><h2>${t("offers.benefits")}</h2><div class="chips wrap">${offer.benefits
                  .map((benefit) => `<span class="chip">${icon("check", { size: 14 })} ${esc(benefit)}</span>`)
                  .join("")}</div></section>`
              : ""
          }
          ${
            Array.isArray(offer.skills) && offer.skills.length
              ? `<section><h2>${t("offers.profile")}</h2><div class="chips wrap">${offer.skills
                  .map((skill) => `<span class="chip">${esc(skill)}</span>`)
                  .join("")}</div></section>`
              : ""
          }

          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button type="button" class="btn btn-secondary" data-share
                    data-share-title="${esc(offer.title)}">${icon("share2", { size: 16 })} ${t(
            "offers.share"
          )}</button>
            <a class="btn btn-ghost" href="/offres">${icon("arrowLeft", { size: 16 })} ${t(
            "offers.backToOffers"
          )}</a>
          </div>
        </article>

        <aside class="company-side">
          <div class="stack" style="gap:16px">
            <div class="card stack" style="gap:12px">
              <div class="row" style="gap:10px;align-items:center">
                ${logoMark(company?.name || offer.company.name)}
                <div style="min-width:0">
                  <a class="link" href="/entreprises/${esc(offer.company.slug)}" style="font-weight:700">${esc(
                    offer.company.name
                  )}</a>
                  <div style="margin-top:2px">${company?.rating ? ratingHtml(company) : ""}</div>
                </div>
              </div>
              ${company?.short ? `<p class="small muted">${esc(company.short)}</p>` : ""}
              ${
                company?.contacts?.phone
                  ? `<a class="btn btn-secondary block" href="${phoneHref(company.contacts.phone)}">${icon(
                      "phone",
                      { size: 16 }
                    )} ${esc(displayPhone(company.contacts.phone))}</a>`
                  : ""
              }
              <a class="btn btn-ghost block" href="/entreprises/${esc(offer.company.slug)}">${t(
                "company.about"
              )} ${icon("arrowUpRight", { size: 15 })}</a>
            </div>

            <div class="card">
              <h2 style="font-size:var(--text-md);margin-bottom:8px">${t("offers.companyOffers")}</h2>
              ${
                data.otherOffers?.length
                  ? `<div class="stack" style="gap:8px">${data.otherOffers
                      .slice(0, 3)
                      .map((item) => offerCard(item, { showCompany: false }))
                      .join("")}</div>`
                  : `<p class="faint small">${t("company.noOffers")}</p>`
              }
            </div>
          </div>
        </aside>
      </div>

      <section class="section">
        <div class="section-head"><div><h2>${t("home.offers.cta")}</h2></div>
          <a class="btn btn-ghost sm" href="/offres">${t("common.seeAll")} ${icon("arrowRight", {
            size: 15,
          })}</a>
        </div>
        <div class="stack" style="gap:10px">
          ${
            data.similarOffers?.length
              ? data.similarOffers.map((item) => offerCard(item)).join("")
              : emptyState({ iconName: "briefcase", title: t("offers.empty") })
          }
        </div>
      </section>

      <p class="notice-small" style="padding-bottom:32px">${t("offers.demoNote")}</p>
    </div>
  `;

  revealOnScroll(host);
}

function buildApplyForm(offer) {
  return `
    <form id="apply-form" class="stack" novalidate>
      <p class="notice-small">${t("offers.applyIntro")}</p>
      <div class="field">
        <label for="apply-name">${t("offers.applyName")} *</label>
        <input class="input" id="apply-name" name="name" required minlength="2" maxlength="90" />
      </div>
      <div class="field">
        <label for="apply-email">${t("offers.applyEmail")} *</label>
        <input class="input" id="apply-email" name="email" type="email" required />
      </div>
      <div class="field">
        <label for="apply-phone">${t("offers.applyPhone")}</label>
        <input class="input" id="apply-phone" name="phone" type="tel" inputmode="tel" />
      </div>
      <div class="field">
        <label for="apply-cv">${t("offers.applyCv")}</label>
        <input class="input" id="apply-cv" name="cv" type="url" placeholder="https://" />
        <span class="hint">${t("offers.applyCvHint")}</span>
      </div>
      <div class="field">
        <label for="apply-message">${t("offers.applyMessage")}</label>
        <textarea class="textarea" id="apply-message" name="coverLetter" rows="4" maxlength="1500"></textarea>
        <span class="hint">${t("offers.applyMessageHint")}</span>
      </div>
      <div class="row" style="gap:8px;justify-content:flex-end">
        <button type="button" class="btn btn-ghost" data-close-dialog>${t("common.cancel")}</button>
        <button type="submit" class="btn btn-primary">${t("offers.applySubmit")}</button>
      </div>
    </form>`;
}

function openApply(offer, user) {
  const dialog = $("#apply-dialog");
  if (!dialog) return;
  const body = dialog.querySelector("[data-dialog-body]");

  if (!user) {
    body.innerHTML = `
      <div class="stack" style="gap:16px">
        <p class="notice-small">${t("review.loginRequired")}</p>
        <a class="btn btn-primary block" href="/login?next=${encodeURIComponent(location.pathname)}">
          ${icon("user", { size: 17 })} ${t("nav.login")}
        </a>
        <a class="btn btn-secondary block" href="/login?mode=register">${t("nav.signup")}</a>
      </div>`;
  } else {
    body.innerHTML = buildApplyForm(offer);
    body.querySelector("#apply-name").value = `${user.firstName || ""} ${user.lastName || ""}`.trim();
    body.querySelector("#apply-email").value = user.email || "";
    body.querySelector("#apply-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const button = form.querySelector('button[type="submit"]');
      setLoading(button, true);
      try {
        const result = await post("/apply", {
          offerSlug: offer.slug,
          coverLetter: String(data.get("coverLetter") || "").trim() || undefined,
          cvName: String(data.get("cv") || "").trim() || undefined,
        });
        close();
        toast.success(result.message || t("offers.applySent"));
      } catch (error) {
        toast.error(error.message || t("common.errorGeneric"));
      } finally {
        setLoading(button, false);
      }
    });
  }

  function close() {
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
  }

  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  body.querySelector("[data-close-dialog]")?.addEventListener("click", close);
}

export async function init({ user } = {}) {
  const slug = decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "");
  const host = $("#offer-root");

  try {
    const data = await get(`/offers/${encodeURIComponent(slug)}`, { cacheMs: 60_000 });
    // L'offre publique n'expose pas l'entreprise complète : on complète si besoin.
    if (!data.company) {
      try {
        const company = await get(`/companies/${encodeURIComponent(data.offer.company.slug)}`);
        data.company = company.company;
        data.otherOffers = company.offers || [];
      } catch {
        /* la fiche entreprise reste facultative */
      }
    }
    render(data);
    document.title = `${data.offer.title} — ${data.offer.company.name} | CONGLOMERAT`;

    document.querySelector("[data-open-apply]")?.addEventListener("click", () =>
      openApply(data.offer, user)
    );

    $("#apply-dialog")?.addEventListener("click", (event) => {
      if (event.target.id === "apply-dialog") {
        if (event.target.open) event.target.close();
        else event.target.removeAttribute("open");
      }
    });
  } catch (error) {
    if (host) {
      host.innerHTML = `<div class="container section">${emptyState({
        iconName: "briefcase",
        title: t("offers.empty"),
        text: errorMessage(error),
        action: `<a class="btn btn-primary" href="/offres">${t("offers.backToOffers")}</a>`,
      })}</div>`;
    }
  }
}

export default { init };
