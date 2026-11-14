/**
 * Connexion unique — le rôle décide de la destination (compte, espace
 * entreprise ou administration). Aucune page de connexion réservée à l'admin.
 */

import { login, register, post, session } from "../core/api.js";
import { t } from "../core/i18n.js";
import { icon } from "../core/icons.js";
import { toast } from "../core/toast.js";
import { $, $$, esc, setLoading } from "../core/ui.js";

const DEMO = [
  {
    role: "account.nav.overview",
    label: "Visiteur",
    email: "demo@conglomerat.cm",
    password: "Demo!2026conglomerat",
  },
  {
    role: "nav.business",
    label: "Entreprise · Cabinet Ekombo",
    email: "entrepriseconglomerat@conglomerat.cm",
    password: "Entreprise!2026",
  },
  {
    role: "nav.admin",
    label: "Modérateur",
    email: "moderateur@conglomerat.cm",
    password: "Moderateur!2026",
  },
  {
    role: "nav.admin",
    label: "Super administrateur",
    email: "admin@conglomerat.cm",
    password: "Conglomerat!2026",
  },
];

function nextParam() {
  const params = new URLSearchParams(location.search);
  const next = params.get("next") || "";
  if (next.startsWith("/") && !next.startsWith("//")) return next;
  return "";
}

function resetToken() {
  const token = new URLSearchParams(location.search).get("reset") || "";
  return /^[a-f0-9]{32,128}$/i.test(token) ? token : "";
}

function modeFromUrl() {
  if (resetToken()) return "reset";
  const mode = new URLSearchParams(location.search).get("mode");
  return ["login", "register", "forgot"].includes(mode) ? mode : "login";
}

function setMode(mode) {
  $$("[data-mode-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.modePanel !== mode;
  });
  $$("[data-auth-tab]").forEach((tab) =>
    tab.setAttribute("aria-selected", String(tab.dataset.authTab === mode))
  );
  if (mode === "reset") return;
  const url = new URL(location.href);
  url.searchParams.delete("reset");
  if (mode === "login") url.searchParams.delete("mode");
  else url.searchParams.set("mode", mode);
  history.replaceState({}, "", url);
}

function strengthMeter(input, meter) {
  if (!input || !meter) return;
  const update = () => {
    const value = input.value;
    let level = 0;
    if (value.length >= 8) level += 1;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) level += 1;
    if (/\d/.test(value)) level += 1;
    if (/[^\w\s]/.test(value) || value.length >= 14) level += 1;
    meter.dataset.level = String(value ? level : 0);
  };
  input.addEventListener("input", update);
  update();
}

async function handleLogin(form) {
  const data = new FormData(form);
  const email = String(data.get("email") || "").trim();
  const password = String(data.get("password") || "");
  if (!email || !password) {
    toast.error(t("auth.required"));
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  setLoading(button, true);
  try {
    const result = await login(email, password);
    toast.success(result.message || t("auth.welcome", { name: result.user?.firstName || email }));
    const target = nextParam() || result.redirect || "/compte";
    setTimeout(() => {
      location.href = target;
    }, 320);
  } catch (error) {
    toast.error(error.message || t("auth.invalid"));
  } finally {
    setLoading(button, false);
  }
}

async function handleRegister(form) {
  const data = new FormData(form);
  const password = String(data.get("password") || "");
  const confirm = String(data.get("confirmPassword") || "");
  if (password !== confirm) {
    toast.error(t("auth.mismatch"));
    return;
  }
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    toast.error(t("auth.weakPassword"));
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  setLoading(button, true);
  try {
    const result = await register({
      firstName: String(data.get("firstName") || "").trim(),
      email: String(data.get("email") || "").trim(),
      password,
      accountType: data.get("accountType") || "user",
      acceptTerms: Boolean(data.get("acceptTerms")),
    });
    toast.success(result.message || t("auth.welcome", { name: result.user?.firstName || "" }));
    setTimeout(() => {
      location.href = nextParam() || result.redirect || "/compte";
    }, 320);
  } catch (error) {
    toast.error(error.message || t("common.errorGeneric"));
  } finally {
    setLoading(button, false);
  }
}

async function handleReset(form) {
  const data = new FormData(form);
  const password = String(data.get("password") || "");
  const confirm = String(data.get("confirmPassword") || "");
  if (password !== confirm) {
    toast.error(t("auth.mismatch"));
    return;
  }
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    toast.error(t("auth.weakPassword"));
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  setLoading(button, true);
  try {
    const result = await post("/auth", { action: "reset", token: resetToken(), password });
    toast.success(result.message || t("auth.resetDone"));
    const url = new URL(location.href);
    url.searchParams.delete("reset");
    url.searchParams.set("mode", "login");
    history.replaceState({}, "", url);
    form.reset();
    setMode("login");
  } catch (error) {
    toast.error(error.message || t("auth.resetInvalid"));
  } finally {
    setLoading(button, false);
  }
}

async function handleForgot(form) {
  const data = new FormData(form);
  const email = String(data.get("email") || "").trim();
  const button = form.querySelector('button[type="submit"]');
  setLoading(button, true);
  try {
    await post("/auth", { action: "forgot", email });
    toast.success(t("auth.forgotSent"));
    form.reset();
  } catch (error) {
    toast.error(error.message || t("common.errorGeneric"));
  } finally {
    setLoading(button, false);
  }
}

export async function init() {
  // Déjà connecté ? On propose la redirection plutôt que de réafficher le formulaire.
  try {
    const data = await session();
    if (data?.user) {
      const banner = $("#login-already");
      if (banner) {
        banner.hidden = false;
        banner.innerHTML = `${icon("info", { size: 16 })}
          <span>${t("auth.welcome", { name: data.user.firstName || data.user.email })}</span>
          <a class="link" href="/compte">${t("nav.account")}</a>`;
      }
    }
  } catch {
    /* pas de session : formulaire normal */
  }

  setMode(modeFromUrl());
  $$("[data-auth-tab]").forEach((tab) =>
    tab.addEventListener("click", (event) => {
      event.preventDefault();
      setMode(tab.dataset.authTab);
    })
  );

  $("#login-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    handleLogin(event.currentTarget);
  });
  $("#register-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    handleRegister(event.currentTarget);
  });
  $("#forgot-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    handleForgot(event.currentTarget);
  });

  $("#reset-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    handleReset(event.currentTarget);
  });

  strengthMeter($("#register-password"), $("#password-strength"));
  strengthMeter($("#reset-password"), $("#reset-strength"));

  $$("[data-show-password]").forEach((button) =>
    button.addEventListener("click", () => {
      const input = button.closest(".input-icon")?.querySelector("input");
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.setAttribute("aria-label", t(show ? "auth.hidePassword" : "auth.showPassword"));
      button.innerHTML = icon(show ? "eyeOff" : "eye", { size: 18 });
    })
  );

  const demoHost = $("#demo-accounts");
  if (demoHost) {
    demoHost.innerHTML = DEMO.map(
      (account) => `
      <button type="button" class="choice-card" data-demo-email="${esc(account.email)}"
              data-demo-password="${esc(account.password)}">
        <strong>${esc(account.label)}</strong>
        <span>${esc(account.email)}</span>
      </button>`
    ).join("");
    demoHost.addEventListener("click", (event) => {
      const card = event.target.closest("[data-demo-email]");
      if (!card) return;
      setMode("login");
      const email = $("#login-email");
      const password = $("#login-password");
      if (email) email.value = card.dataset.demoEmail;
      if (password) password.value = card.dataset.demoPassword;
      toast.info(t("auth.demoFill"));
      $("#login-form")?.requestSubmit();
    });
  }
}

export default { init };
