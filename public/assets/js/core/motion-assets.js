/** Scripts non bloquants, locaux, demandés uniquement par une interaction. */
const pending = new Map();

function loadScript(src, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (!pending.has(src)) {
    const loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = () => window[globalName] ? resolve(window[globalName]) : reject(new Error(globalName));
      script.onerror = () => { script.remove(); reject(new Error(globalName)); };
      document.head.appendChild(script);
    }).catch((error) => { pending.delete(src); throw error; });
    pending.set(src, loading);
  }
  return pending.get(src);
}

export const loadGsap = () => loadScript("/assets/vendor/gsap.min.js", "gsap");
export const loadScrollTrigger = () => loadScript("/assets/vendor/scroll-trigger.min.js", "ScrollTrigger");
