/**
 * Fiche premium — paiement Mobile Money SIMULÉ (aucun débit réel).
 * Le code de confirmation de démonstration est 123456 (imposé par /api/billing).
 */

import { get, post } from "../core/api.js";
import { loadGsap } from "../core/motion-assets.js";
import { t, formatCurrency, formatDate } from "../core/i18n.js";
import { icon } from "../core/icons.js";
import { toast } from "../core/toast.js";
import { $, esc, setLoading, emptyState, errorMessage } from "../core/ui.js";

const PIN_HINT = "123456";
let billing = null;

function wireSeal() {
  const cta = $(".cta-seal");
  const ring = cta?.querySelector(".seal-ring");
  if (!ring) return;
  const motion = window.matchMedia?.("(prefers-reduced-motion: no-preference)");
  const canAnimate = () => motion?.matches && document.documentElement.dataset.saver !== "true" && !navigator.connection?.saveData;
  let tween;
  const stop = () => { tween?.revert(); tween = null; };
  const spin = async () => {
    if (!canAnimate()) return;
    const gsap = await loadGsap().catch(() => null);
    if (!gsap || !canAnimate() || !ring.isConnected || !cta.matches(":hover, :focus-visible")) return;
    stop();
    tween = gsap.to(ring, { rotation: 360, transformOrigin: "50% 50%", duration: 1.1, ease: "power2.out" });
  };
  cta.addEventListener("pointerenter", spin);
  cta.addEventListener("focus", spin);
  motion?.addEventListener?.("change", stop);
  window.addEventListener("cg:saver", stop);
}

function premiumSeal() {
  return `<span class="seal-mark" aria-hidden="true">
    <svg class="seal-ring" viewBox="0 0 60 60" focusable="false">
      <path id="premium-ring-path" d="M30 30m-21 0a21 21 0 1 1 42 0a21 21 0 1 1-42 0" fill="none"/>
      <text textLength="128" lengthAdjust="spacing"><textPath href="#premium-ring-path">PREMIUM · CONGLOMERAT ·</textPath></text>
    </svg>${icon("sparkles", { size: 16 })}</span>`;
}

function planCard(plan, featured) {
  return `
    <article class="price-card ${featured ? "featured" : ""}">
      ${featured ? `<span class="badge badge-hiring" style="position:absolute;top:16px;right:16px">${t("common.premium")}</span>` : ""}
      <h3 style="font-size:var(--text-lg)">${esc(plan.name)}</h3>
      <p class="price">${formatCurrency(plan.priceXaf)}<small> ${plan.period === "monthly" ? t("premium.month") : t("premium.year")}</small></p>
      <ul>
        ${(plan.features || []).map((feature) => `<li>${icon("check", { size: 16 })} ${esc(feature)}</li>`).join("")}
      </ul>
      <button type="button" class="btn ${featured ? "btn-primary cta-seal" : "btn-secondary cta-morph"} block"
              data-plan="${esc(plan.slug)}">${featured ? premiumSeal() : ""}<span>${t("premium.cta")}</span></button>
    </article>`;
}

function renderPlans() {
  const host = $("#plans-grid");
  if (!host) return;
  const plans = billing?.plans || [];
  if (!plans.length) {
    host.innerHTML = emptyState({ iconName: "wallet", title: t("common.empty") });
    return;
  }
  host.innerHTML = plans
    .map((plan, index) => planCard(plan, index === 1 || (plans.length === 1 && index === 0)))
    .join("");
}

function renderHistory() {
  const host = $("#payments-history");
  if (!host) return;
  const payments = billing?.payments || [];
  host.innerHTML = payments.length
    ? `<div class="table-wrap"><table>
        <thead><tr><th>${t("premium.invoice")}</th><th>${t("common.of")}</th><th>${t("admin.table.status")}</th><th>${t("admin.table.date")}</th></tr></thead>
        <tbody>${payments
          .map(
            (payment) => `<tr>
              <td class="mono-num">${esc(payment.provider_ref)}</td>
              <td>${formatCurrency(payment.amount_xaf)}</td>
              <td>${esc(payment.status)}</td>
              <td class="small faint">${formatDate(payment.created_at, "short")}</td>
            </tr>`
          )
          .join("")}</tbody>
      </table></div>`
    : `<p class="faint small">${t("premium.history")} — ${t("common.empty")}</p>`;
}

function openCheckout(planSlug) {
  const plan = (billing?.plans || []).find((item) => item.slug === planSlug);
  if (!plan) return;
  const dialog = $("#checkout-dialog");
  const body = dialog.querySelector("[data-dialog-body]");
  body.innerHTML = `
    <form id="checkout-form" class="stack" novalidate>
      <div class="banner warning">${icon("info", { size: 16 })}
        <span>${t("premium.payDemoText", { pin: PIN_HINT })}</span></div>

      <div class="row-between" style="gap:12px">
        <strong>${esc(plan.name)}</strong>
        <span>${formatCurrency(plan.priceXaf)}</span>
      </div>

      <div class="field">
        <label>${t("premium.operator")}</label>
        <div class="choice-grid two">
          <button type="button" class="choice-card selected" data-channel="mtn" aria-pressed="true">
            <strong>${t("premium.mtn")}</strong><span>MoMo</span>
          </button>
          <button type="button" class="choice-card" data-channel="orange" aria-pressed="false">
            <strong>${t("premium.orange")}</strong><span>OM</span>
          </button>
        </div>
      </div>

      <div class="field">
        <label for="pay-phone">${t("premium.phone")}</label>
        <input class="input" id="pay-phone" name="phone" type="tel" inputmode="tel"
               placeholder="6 90 00 00 00" value="${esc(billing?.userPhone || "")}" />
      </div>

      <div class="field">
        <label for="pay-pin">${t("premium.pin")}</label>
        <input class="input" id="pay-pin" name="pin" inputmode="numeric" pattern="[0-9]{6}" maxlength="6"
               placeholder="••••••" />
        <span class="hint">${t("premium.payDemo")} · ${PIN_HINT}</span>
      </div>

      <div class="row" style="gap:8px;justify-content:flex-end">
        <button type="button" class="btn btn-ghost" data-close-dialog>${t("common.cancel")}</button>
        <button type="submit" class="btn btn-primary">${t("premium.pay")}</button>
      </div>
    </form>`;

  let channel = "mtn";
  body.querySelectorAll("[data-channel]").forEach((button) =>
    button.addEventListener("click", () => {
      channel = button.dataset.channel;
      body.querySelectorAll("[data-channel]").forEach((node) => {
        const active = node === button;
        node.classList.toggle("selected", active);
        node.setAttribute("aria-pressed", String(active));
      });
    })
  );

  body.querySelector("#checkout-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const phone = form.phone.value.trim();
    const pin = form.pin.value.trim();
    if (!pin) {
      toast.error(t("premium.pin"));
      return;
    }
    setLoading(button, true);
    try {
      const created = await post("/billing", {
        action: "checkout",
        planSlug,
        channel,
        phone: phone || undefined,
      });
      const confirmed = await post("/billing", {
        action: "confirm",
        reference: created.reference,
        pin,
      });
      toast.success(confirmed.message || t("premium.success"));
      if (typeof dialog.close === "function") dialog.close();
      billing = await get("/billing", { cacheMs: 0 });
      renderHistory();
      const subscription = billing.subscription;
      const host = $("#subscription-status");
      if (host && subscription) {
        host.innerHTML = `<div class="banner success">${icon("badgeCheck", { size: 16 })}
          <span>${t("business.premiumActive", { date: formatDate(subscription.ends_at) })}</span></div>`;
      }
    } catch (error) {
      toast.error(error.message || t("premium.failed"));
    } finally {
      setLoading(button, false);
    }
  });

  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

export async function init({ user } = {}) {
  try {
    billing = await get("/billing", { cacheMs: 0 });
  } catch (error) {
    const host = $("#plans-grid");
    if (host) host.innerHTML = emptyState({ iconName: "wallet", title: t("common.error"), text: errorMessage(error) });
    return;
  }

  renderPlans();
  wireSeal();
  renderHistory();

  const subscription = billing.subscription;
  const status = $("#subscription-status");
  if (status && subscription) {
    status.innerHTML = `<div class="banner success">${icon("badgeCheck", { size: 16 })}
      <span>${t("business.premiumActive", { date: formatDate(subscription.ends_at) })}</span></div>`;
  }

  document.addEventListener("click", (event) => {
    const plan = event.target.closest("[data-plan]");
    if (plan) {
      event.preventDefault();
      if (!user) {
        toast.info(t("review.loginRequired"));
        location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
        return;
      }
      openCheckout(plan.dataset.plan);
      return;
    }
    if (event.target.closest("[data-close-dialog]")) {
      const dialog = event.target.closest("dialog");
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      else dialog.removeAttribute("open");
    }
  });
}

export default { init };
