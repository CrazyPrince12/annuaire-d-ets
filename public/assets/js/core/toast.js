/**
 * Notifications légères + boîte de confirmation.
 *
 * `toast("Message")`, `toast.success(...)`, `toast.error(...)`.
 * `confirmDialog({ title, text })` renvoie une promesse booléenne et réutilise
 * les styles de feuille (`dialog` + `.sheet`) déjà définis dans components.css.
 */

import { UI } from "./config.js";
import { t } from "./i18n.js";
import { icon } from "./icons.js";

let region = null;

function ensureRegion() {
  if (region && document.body.contains(region)) return region;
  region = document.createElement("div");
  region.className = "toast-region";
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  document.body.appendChild(region);
  return region;
}

const GLYPHS = {
  success: "circleCheck",
  error: "circleAlert",
  warning: "alertTriangle",
  info: "info",
};

/**
 * Affiche une notification.
 * @param {string} message
 * @param {{type?:"success"|"error"|"warning"|"info", duration?:number,
 *          action?:{label:string, onClick:Function}, icon?:string}} [opts]
 * @returns {{dismiss:Function}|null}
 */
export function toast(message, opts = {}) {
  if (typeof document === "undefined" || !message) return null;
  const { type = "info", duration = UI.toastDuration, action, icon: iconName } = opts;
  const host = ensureRegion();

  const node = document.createElement("div");
  node.className = `toast ${type}`;
  node.setAttribute("role", type === "error" ? "alert" : "status");

  const glyph = document.createElement("span");
  glyph.className = "toast-glyph";
  glyph.innerHTML = icon(iconName || GLYPHS[type] || "info", { size: 18 });

  const text = document.createElement("span");
  text.className = "toast-body";
  text.textContent = message;

  const close = document.createElement("button");
  close.type = "button";
  close.className = "toast-x";
  close.setAttribute("aria-label", t("common.close"));
  close.innerHTML = icon("x", { size: 14 });

  node.append(glyph, text);

  if (action && action.label) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.textContent = action.label;
    btn.addEventListener("click", () => {
      try {
        action.onClick?.();
      } finally {
        dismiss();
      }
    });
    node.append(btn);
  }

  node.append(close);

  let timer = null;
  const dismiss = () => {
    if (!node.isConnected || node.classList.contains("leaving")) return;
    clearTimeout(timer);
    node.classList.add("leaving");
    node.addEventListener("animationend", () => node.remove(), { once: true });
    setTimeout(() => node.remove(), 500);
  };

  close.addEventListener("click", dismiss);
  if (duration > 0) timer = setTimeout(dismiss, duration);

  // On suspend le minuteur pendant la lecture (survol / focus).
  node.addEventListener("pointerenter", () => clearTimeout(timer));
  node.addEventListener("pointerleave", () => {
    if (duration > 0) timer = setTimeout(dismiss, 1800);
  });

  host.appendChild(node);
  return { dismiss };
}

toast.success = (message, opts) => toast(message, { ...opts, type: "success" });
toast.error = (message, opts) => toast(message, { ...opts, type: "error" });
toast.warning = (message, opts) => toast(message, { ...opts, type: "warning" });
toast.info = (message, opts) => toast(message, { ...opts, type: "info" });

/**
 * Confirmation accessible. Repli propre si `<dialog>` n'est pas supporté.
 * @returns {Promise<boolean>}
 */
export function confirmDialog({
  title = t("common.confirm"),
  text = "",
  confirmLabel = t("common.confirm"),
  cancelLabel = t("common.cancel"),
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "dialog-confirm";
    dialog.innerHTML = `
      <div class="sheet">
        <div class="sheet-head">
          <h2></h2>
          <button type="button" class="icon-btn sm" data-cancel aria-label="${t("a11y.closeDialog")}">
            ${icon("x", { size: 18 })}
          </button>
        </div>
        <div class="sheet-body">
          <p class="dialog-text"></p>
        </div>
        <div class="sheet-foot">
          <button type="button" class="btn btn-ghost" data-cancel>${cancelLabel}</button>
          <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-confirm>
            ${confirmLabel}
          </button>
        </div>
      </div>
    `;
    dialog.querySelector("h2").textContent = title;
    const textNode = dialog.querySelector(".dialog-text");
    textNode.textContent = text;
    if (!text) textNode.remove();

    let result = false;
    const finish = (value) => {
      result = value;
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      else {
        dialog.removeAttribute("open");
        cleanup();
      }
    };
    const cleanup = () => {
      dialog.remove();
      resolve(result);
    };

    dialog.querySelectorAll("[data-cancel]").forEach((btn) => btn.addEventListener("click", () => finish(false)));
    dialog.querySelector("[data-confirm]").addEventListener("click", () => finish(true));
    dialog.addEventListener("close", cleanup);
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(false);
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) finish(false);
    });

    document.body.appendChild(dialog);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    dialog.querySelector("[data-confirm]").focus({ preventScroll: true });
  });
}

// Notifications émises par d'autres modules (thème, favoris, réseau…).
window.addEventListener("cg:toast", (event) => {
  const detail = event.detail || {};
  if (detail.message) toast(detail.message, detail);
});

export default toast;
export { toast as notify };
