import { FEATURES } from "../core/config.js";
import { t } from "../core/i18n.js";

const saver = () => document.documentElement.dataset.saver === "true" || navigator.connection?.saveData === true;

function wireAtlas() {
  const toggle = document.querySelector("#atlas-toggle");
  const host = document.querySelector("#atlas-canvas");
  const turn = document.querySelector("#atlas-rotate");
  const status = document.querySelector("#atlas-status");
  if (!FEATURES.three || !toggle || !host || !turn || !status || typeof ResizeObserver !== "function") return;
  let scene;
  let attempt = 0;
  const announce = (key) => {
    status.hidden = !key;
    status.textContent = key ? t(key) : "";
  };
  const reset = (key) => {
    const moveFocus = document.activeElement === turn;
    attempt++;
    scene?.dispose();
    scene = undefined;
    host.hidden = true;
    turn.hidden = true;
    toggle.disabled = false;
    toggle.removeAttribute("aria-busy");
    toggle.setAttribute("aria-pressed", "false");
    announce(key);
    if (moveFocus && !toggle.hidden) toggle.focus({ preventScroll: true });
  };
  const update = () => {
    toggle.hidden = saver();
    if (toggle.hidden) reset();
  };
  update();
  toggle.addEventListener("click", async () => {
    if (scene) { reset(); return; }
    if (saver()) return;
    const run = ++attempt;
    toggle.disabled = true;
    toggle.setAttribute("aria-busy", "true");
    announce("home.atlas.loading");
    try {
      const { mountCityScene } = await import("./city-scene.js");
      if (run !== attempt) return;
      scene = mountCityScene(host, { onLost: () => reset("home.atlas.unavailable") });
      host.hidden = false;
      turn.hidden = false;
      toggle.setAttribute("aria-pressed", "true");
      announce("home.atlas.ready");
    } catch {
      if (run === attempt) reset("home.atlas.unavailable");
    } finally {
      if (run === attempt) {
        toggle.disabled = false;
        toggle.removeAttribute("aria-busy");
      }
    }
  });
  turn.addEventListener("click", () => scene?.rotate());
  window.addEventListener("cg:saver", update);
  navigator.connection?.addEventListener?.("change", update);
  window.addEventListener("pagehide", () => reset());
}

function wireMotionPreference() {
  const panel = document.querySelector("#home-motion");
  const toggle = document.querySelector("#home-motion-toggle");
  const status = document.querySelector("#home-motion-status");
  const media = window.matchMedia?.("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
  if (!panel || !toggle || !status || !media) return;
  let dispose;
  let attempt = 0;
  const allowed = () => media.matches && !saver();
  const stop = () => {
    attempt++;
    dispose?.();
    dispose = undefined;
    toggle.disabled = false;
    toggle.setAttribute("aria-pressed", "false");
  };
  const update = () => {
    panel.hidden = !allowed();
    if (panel.hidden) stop();
  };
  update();
  media.addEventListener?.("change", update);
  window.addEventListener("cg:saver", update);
  navigator.connection?.addEventListener?.("change", update);
  window.addEventListener("pagehide", stop);
  toggle.addEventListener("click", async () => {
    if (dispose) { stop(); return; }
    if (!allowed()) return;
    const run = ++attempt;
    status.hidden = true;
    toggle.disabled = true;
    try {
      const { enableHomeMotion } = await import("./home-motion.js");
      if (run !== attempt || !allowed()) return;
      const cleanup = await enableHomeMotion();
      if (run !== attempt || !allowed()) { cleanup(); return; }
      dispose = cleanup;
      toggle.setAttribute("aria-pressed", "true");
    } catch {
      if (run !== attempt) return;
      status.textContent = t("home.motion.unavailable");
      status.hidden = false;
    } finally {
      if (run === attempt) toggle.disabled = false;
    }
  });
}

export function wireHomeEnhancements() {
  wireAtlas();
  wireMotionPreference();
}
