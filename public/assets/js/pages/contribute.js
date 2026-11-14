/**
 * Contribution — ajout d'une entreprise (modération systématique).
 * Formulaire en trois étapes côté client, un seul appel serveur.
 */

import { get, post } from "../core/api.js";
import { t } from "../core/i18n.js";
import { icon } from "../core/icons.js";
import { toast } from "../core/toast.js";
import { $, $$, esc, setLoading } from "../core/ui.js";

let meta = null;
let step = 1;

function goTo(next) {
  step = Math.min(3, Math.max(1, next));
  $$("[data-step-panel]").forEach((panel) => {
    panel.hidden = Number(panel.dataset.stepPanel) !== step;
  });
  $$(".stepper .step").forEach((node, index) => {
    node.classList.toggle("done", index < step);
  });
  const label = $("#step-label");
  if (label) label.textContent = t("common.step", { current: step, total: 3 });
  const back = $("#wizard-back");
  const nextBtn = $("#wizard-next");
  if (back) back.hidden = step === 1;
  if (nextBtn) {
    // L'étape 3 est la dernière : le bouton devient « Envoyer » au lieu de disparaître.
    nextBtn.textContent = step === 3 ? t("contribute.submit") : t("common.next");
    nextBtn.disabled = false;
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function validateStep(current) {
  const form = $("#contribute-form");
  const fields =
    current === 1
      ? ["name", "sector", "city"]
      : current === 2
        ? ["submitterEmail"]
        : [];
  for (const name of fields) {
    const input = form.querySelector(`[name="${name}"]`);
    if (!input) continue;
    if (!input.value.trim()) {
      input.setAttribute("aria-invalid", "true");
      input.focus();
      toast.error(current === 1 ? t("contribute.errorRequired") : t("contribute.errorContact"));
      return false;
    }
    input.removeAttribute("aria-invalid");
    if (input.type === "email" && !input.checkValidity()) {
      input.setAttribute("aria-invalid", "true");
      input.focus();
      toast.error(t("contribute.errorContact"));
      return false;
    }
  }
  return true;
}

export async function init() {
  const form = $("#contribute-form");
  if (!form) return;

  try {
    meta = await get("/meta", { cacheMs: 5 * 60_000 });
    const sector = form.querySelector('select[name="sector"]');
    const city = form.querySelector('select[name="city"]');
    if (sector && meta?.sectors) {
      sector.innerHTML =
        `<option value="">${t("contribute.sector")}</option>` +
        meta.sectors
          .map((item) => `<option value="${esc(item.slug)}">${esc(item.name)}</option>`)
          .join("");
    }
    if (city && meta?.cities) {
      city.innerHTML =
        `<option value="">${t("contribute.city")}</option>` +
        meta.cities
          .filter((item) => item.companies >= 0)
          .map((item) => `<option value="${esc(item.slug)}">${esc(item.name)}</option>`)
          .join("");
    }
  } catch {
    /* les listes restent vides : le serveur acceptera tout de même les champs */
  }

  goTo(1);

  $("#wizard-next")?.addEventListener("click", () => {
    if (!validateStep(step)) return;
    if (step === 3) {
      // Il n'y a pas de bouton `submit` dans le gabarit : on déclenche
      // l'évènement attendu par l'écouteur du formulaire.
      form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
      return;
    }
    goTo(step + 1);
  });

  $("#wizard-back")?.addEventListener("click", () => goTo(step - 1));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateStep(1) || !validateStep(2)) return;
    const data = new FormData(form);
    const button = $("#wizard-next") || form.querySelector('button[type="submit"]');
    setLoading(button, true);
    try {
      const result = await post("/contributions", {
        kind: "new_company",
        name: String(data.get("name") || "").trim(),
        sector: String(data.get("sector") || "").trim(),
        city: String(data.get("city") || "").trim(),
        neighborhood: String(data.get("neighborhood") || "").trim() || undefined,
        address: String(data.get("address") || "").trim() || undefined,
        landmark: String(data.get("landmark") || "").trim() || undefined,
        description: String(data.get("description") || "").trim() || undefined,
        phone: String(data.get("phone") || "").trim() || undefined,
        whatsapp: String(data.get("whatsapp") || "").trim() || undefined,
        email: String(data.get("email") || "").trim() || undefined,
        website: String(data.get("website") || "").trim() || undefined,
        notes: String(data.get("notes") || "").trim() || undefined,
        submitterName: String(data.get("submitterName") || "").trim() || undefined,
        submitterEmail: String(data.get("submitterEmail") || "").trim(),
      });
      form.hidden = true;
      const success = $("#contribute-success");
      if (success) {
        success.hidden = false;
        success.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      toast.success(result.message || t("contribute.success"));
    } catch (error) {
      toast.error(error.message || t("common.errorGeneric"));
    } finally {
      setLoading(button, false);
    }
  });

  $("#contribute-again")?.addEventListener("click", () => {
    form.reset();
    form.hidden = false;
    const success = $("#contribute-success");
    if (success) success.hidden = true;
    goTo(1);
  });
}

export default { init };
