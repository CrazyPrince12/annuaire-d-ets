import Lenis from "../../vendor/lenis.mjs";
import { loadGsap, loadScrollTrigger } from "../core/motion-assets.js";

/** Le scroll natif reste la valeur par défaut (y compris ancres et clavier). */
export async function enableHomeMotion() {
  const gsap = await loadGsap();
  const ScrollTrigger = await loadScrollTrigger();
  gsap.registerPlugin(ScrollTrigger);
  const lenis = new Lenis({
    autoRaf: false,
    smoothWheel: true,
    syncTouch: false,
    stopInertiaOnNavigate: true,
    prevent: (el) => Boolean(el.closest?.("dialog, [role='dialog'], #mobile-menu, .carousel, input, select, textarea")),
  });
  const frame = (seconds) => lenis.raf(seconds * 1000);
  gsap.ticker.add(frame);
  const unsubscribe = lenis.on("scroll", ScrollTrigger.update);
  const context = gsap.context(() => {
    const stage = document.querySelector(".atlas-stage");
    const detail = stage?.querySelector(".atlas-grid");
    if (detail) gsap.to(detail, {
      opacity: .28, ease: "none",
      scrollTrigger: { trigger: stage, start: "clamp(top 25%)", end: "bottom top", scrub: true },
    });
  });
  return () => {
    context.revert();
    unsubscribe();
    gsap.ticker.remove(frame);
    lenis.destroy();
  };
}
