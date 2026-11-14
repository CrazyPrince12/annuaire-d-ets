/**
 * Thème : sombre (défaut), clair, automatique — plus le « mode économie de
 * données » qui coupe flous, dégradés animés et animations non essentielles.
 *
 * Le choix est appliqué avant le premier rendu par un court script inline
 * (`data-theme` sur <html>), ce module ne gère que l'interaction.
 */

import { SITE } from "./config.js";
import * as storage from "./storage.js";
import { t } from "./i18n.js";

const MEDIA = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;

export const THEMES = ["dark", "light", "auto"];

export function getTheme() {
  const stored = storage.read(storage.KEYS.theme, "dark");
  return THEMES.includes(stored) ? stored : "dark";
}

function resolved(theme) {
  if (theme === "auto") return MEDIA && MEDIA.matches ? "light" : "dark";
  return theme;
}

export function applyTheme(theme = getTheme(), { persist = false } = {}) {
  const actual = resolved(theme);
  const root = document.documentElement;
  root.setAttribute("data-theme", actual);
  root.setAttribute("data-theme-choice", theme);
  root.style.colorScheme = actual;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", actual === "light" ? SITE.themeColorLight : SITE.themeColor);
  if (persist) storage.write(storage.KEYS.theme, theme);
  syncThemeButtons(theme, actual);
  window.dispatchEvent(new CustomEvent("cg:theme", { detail: { theme, resolved: actual } }));
  return actual;
}

export function setTheme(theme) {
  if (!THEMES.includes(theme)) theme = "dark";
  return applyTheme(theme, { persist: true });
}

/** Fait tourner sombre → clair → auto → sombre. */
export function cycleTheme() {
  const order = ["dark", "light", "auto"];
  const next = order[(order.indexOf(getTheme()) + 1) % order.length];
  setTheme(next);
  const label = t(`theme.${next === "auto" ? "auto" : next}`);
  window.dispatchEvent(new CustomEvent("cg:toast", { detail: { message: `${t("theme.label")} · ${label}` } }));
  return next;
}

export function getSaver() {
  return storage.read(storage.KEYS.saver, false) === true;
}

export function setSaver(on) {
  document.documentElement.setAttribute("data-saver", on ? "true" : "false");
  storage.write(storage.KEYS.saver, !!on);
  window.dispatchEvent(new CustomEvent("cg:saver", { detail: { on: !!on } }));
  return !!on;
}

function syncThemeButtons(theme, actual) {
  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    btn.setAttribute("aria-label", `${t("theme.switch")} · ${t(`theme.${theme}`)}`);
    btn.setAttribute("title", `${t("theme.label")} : ${t(`theme.${theme}`)}`);
    const iconSlot = btn.querySelector("[data-theme-icon]");
    if (iconSlot) {
      iconSlot.dataset.theme = theme;
      iconSlot.dataset.resolved = actual;
    }
    btn.dataset.themeChoice = theme;
  });
  document.querySelectorAll("[data-theme-option]").forEach((el) => {
    el.setAttribute("aria-checked", String(el.dataset.themeOption === theme));
  });
}

export function initTheme() {
  applyTheme();
  setSaver(getSaver());
  if (MEDIA) {
    const onChange = () => {
      if (getTheme() === "auto") applyTheme("auto");
    };
    if (MEDIA.addEventListener) MEDIA.addEventListener("change", onChange);
    else if (MEDIA.addListener) MEDIA.addListener(onChange);
  }
  document.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-theme-toggle]");
    if (toggle) {
      event.preventDefault();
      cycleTheme();
      return;
    }
    const option = event.target.closest("[data-theme-option]");
    if (option) {
      event.preventDefault();
      setTheme(option.dataset.themeOption);
    }
  });
  window.addEventListener("cg:lang", () => syncThemeButtons(getTheme(), resolved(getTheme())));
}

export default { initTheme, setTheme, getTheme, cycleTheme, setSaver, getSaver };
