/** Page contact — formulaire relié à /api/contact (visible dans l'admin). */

import { post } from "../core/api.js";
import { t } from "../core/i18n.js";
import { toast } from "../core/toast.js";
import { $, setLoading } from "../core/ui.js";

export function init() {
  const form = $("#contact-form");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const button = form.querySelector('button[type="submit"]');
    setLoading(button, true);
    try {
      const result = await post("/contact", {
        name: String(data.get("name") || "").trim(),
        email: String(data.get("email") || "").trim(),
        subject: String(data.get("subject") || "").trim() || undefined,
        message: String(data.get("message") || "").trim(),
      });
      toast.success(result.message || t("common.saved"));
      form.reset();
    } catch (error) {
      toast.error(error.message || t("common.errorGeneric"));
    } finally {
      setLoading(button, false);
    }
  });
}

export default { init };
