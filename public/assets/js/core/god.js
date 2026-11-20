/**
 * Couche « God dev » — améliorations progressives, sans dépendance.
 *
 *  • charge god.css (verre, boutons, transitions de page) ;
 *  • barre de progression de lecture (animée en CSS pur) ;
 *  • titre de page animé mot par mot (ignoré si mouvement réduit) ;
 *  • fond shader WebGL du héros d'accueil (GLSL, ~3 Ko, pause hors écran) ;
 *  • compteurs animés des statistiques du héros ;
 *  • projecteur lumineux qui suit le pointeur sur les cartes ;
 *  • lazy loading + décodage asynchrone des images et iframes ;
 *  • préchargement des pages internes au survol / au toucher.
 *
 * Tout est entouré de garde-fous : une erreur ici ne doit jamais casser une page.
 * Les effets coûteux sont coupés en mode économie de données, avec
 * prefers-reduced-motion, et sur les appareils modestes.
 */

const root = document.documentElement;
const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const saveData = Boolean(navigator.connection?.saveData) || root.dataset.saver === "true";
const lowEnd = (navigator.hardwareConcurrency || 8) < 4 || (navigator.deviceMemory || 8) < 4;
const canAnimate = !reduceMotion && !saveData;

function safely(label, fn) {
  try {
    fn();
  } catch (error) {
    console.warn(`[god] ${label} ignoré :`, error);
  }
}

/* ------------------------------------------------------------------ styles */
function loadStyles() {
  if (document.getElementById("god-styles")) return;
  const link = document.createElement("link");
  link.id = "god-styles";
  link.rel = "stylesheet";
  link.href = "/assets/css/god.css";
  document.head.append(link);
}

/* ---------------------------------------------------- progression de lecture */
function addProgressBar() {
  if (!canAnimate || document.querySelector(".god-progress")) return;
  const bar = document.createElement("div");
  bar.className = "god-progress";
  bar.setAttribute("aria-hidden", "true");
  document.body.append(bar);
}

/* -------------------------------------------------- titre animé mot par mot */
function splitHeading() {
  if (reduceMotion) return;
  const heading = document.querySelector("main h1");
  if (!heading || heading.dataset.godSplit || heading.children.length) return;
  const text = heading.textContent.trim();
  if (!text || text.length > 140) return;
  const style = getComputedStyle(heading);
  // Un texte en dégradé (background-clip: text) serait cassé par le découpage.
  if (style.webkitBackgroundClip === "text" || style.backgroundClip === "text") return;

  heading.dataset.godSplit = "1";
  heading.textContent = "";
  text.split(/\s+/).forEach((word, index) => {
    const outer = document.createElement("span");
    outer.className = "god-word";
    const inner = document.createElement("span");
    inner.style.setProperty("--i", String(index));
    inner.textContent = word;
    outer.append(inner);
    heading.append(outer, " ");
  });
}

/* ------------------------------------------------------ compteurs du héros */
function animateCounters() {
  if (!canAnimate) return;
  document.querySelectorAll(".hero-stats .num").forEach((element) => {
    let running = false;
    new MutationObserver(() => {
      if (running) return;
      const raw = element.textContent.trim();
      if (!/^[\d\s.,\u202f\u00a0]+$/.test(raw)) return;
      const target = parseInt(raw.replace(/[^\d]/g, ""), 10);
      if (!Number.isFinite(target) || target <= 0 || element.dataset.counted === String(target)) return;

      running = true;
      element.dataset.counted = String(target);
      const format = new Intl.NumberFormat(root.lang || "fr");
      const start = performance.now();
      const duration = 900;
      const tick = (now) => {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        element.textContent = format.format(Math.round(target * eased));
        if (progress < 1) requestAnimationFrame(tick);
        else running = false;
      };
      requestAnimationFrame(tick);
    }).observe(element, { childList: true, characterData: true, subtree: true });
  });
}

/* ------------------------------------------- projecteur sur les cartes (verre) */
function cardSpotlight() {
  if (!canAnimate || !window.matchMedia("(hover: hover)").matches) return;
  let frame = 0;
  document.addEventListener(
    "pointermove",
    (event) => {
      const card = event.target.closest?.(".bento-card, .pricing-grid > *");
      if (!card || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const box = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${event.clientX - box.left}px`);
        card.style.setProperty("--my", `${event.clientY - box.top}px`);
      });
    },
    { passive: true }
  );
}

/* ----------------------------------------------------- shader WebGL du héros */
const VERTEX = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
const FRAGMENT = `
precision mediump float;
uniform vec2 uRes; uniform float uTime; uniform vec3 uC1; uniform vec3 uC2; uniform vec2 uMouse;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p*=2.02;a*=.5;}return v;}
void main(){
  vec2 uv=gl_FragCoord.xy/uRes;
  vec2 p=uv*vec2(uRes.x/uRes.y,1.)*1.6;
  float t=uTime*.06;
  vec2 q=vec2(fbm(p+t),fbm(p+vec2(5.2,1.3)-t));
  float f=fbm(p+2.*q+uMouse*.3);
  vec3 col=mix(uC1,uC2,smoothstep(.25,.85,f));
  float a=smoothstep(.35,.95,f)*(1.-uv.y*.6);
  gl_FragColor=vec4(col*a,a);
}`;

function cssColor(name, fallback) {
  const value = getComputedStyle(root).getPropertyValue(name).trim();
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return fallback;
  const n = parseInt(match[1], 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "shader");
  return shader;
}

function heroShader() {
  if (!canAnimate || lowEnd || document.body.dataset.page !== "home") return;
  const host = document.querySelector(".hero-bg");
  if (!host || host.querySelector(".god-shader")) return;

  const canvas = document.createElement("canvas");
  canvas.className = "god-shader";
  canvas.setAttribute("aria-hidden", "true");
  const gl = canvas.getContext("webgl", { alpha: true, antialias: false, powerPreference: "low-power" });
  if (!gl) return;

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("link");
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uniform = (name) => gl.getUniformLocation(program, name);
  const uRes = uniform("uRes");
  const uTime = uniform("uTime");
  const uMouse = uniform("uMouse");
  const setColors = () => {
    gl.uniform3fv(uniform("uC1"), cssColor("--primary", [0.13, 0.75, 0.48]));
    gl.uniform3fv(uniform("uC2"), cssColor("--accent", [1, 0.78, 0.24]));
  };
  setColors();
  new MutationObserver(setColors).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  host.append(canvas);

  // Résolution réduite : le flou naturel du shader n'a pas besoin de pixels.
  const scale = Math.min(window.devicePixelRatio || 1, 1.5) * 0.5;
  const resize = () => {
    const width = Math.max(2, Math.round(host.clientWidth * scale));
    const height = Math.max(2, Math.round(host.clientHeight * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uRes, width, height);
    }
  };
  new ResizeObserver(resize).observe(host);
  resize();

  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  host.parentElement?.addEventListener(
    "pointermove",
    (event) => {
      const box = host.getBoundingClientRect();
      mouse.tx = (event.clientX - box.left) / box.width - 0.5;
      mouse.ty = (event.clientY - box.top) / box.height - 0.5;
    },
    { passive: true }
  );

  let visible = true;
  let raf = 0;
  let last = 0;
  const start = performance.now();
  const frame = (now) => {
    raf = 0;
    if (!visible || document.hidden) return;
    raf = requestAnimationFrame(frame);
    if (now - last < 33) return; // ~30 images/s suffisent pour un fond doux
    last = now;
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;
    gl.uniform1f(uTime, (now - start) / 1000);
    gl.uniform2f(uMouse, mouse.x, mouse.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const play = () => {
    if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
  };

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    play();
  }).observe(host);
  document.addEventListener("visibilitychange", play);
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    canvas.remove();
  });

  play();
  requestAnimationFrame(() => canvas.classList.add("is-ready"));
}

/* ------------------------------------------------------ images et iframes */
function optimizeMedia(scope = document) {
  const firstImage = document.querySelector("main img");
  scope.querySelectorAll?.("img:not([loading]), iframe:not([loading])").forEach((element) => {
    const aboveTheFold = element === firstImage || element.closest(".site-header") || element.hasAttribute("fetchpriority");
    if (aboveTheFold) return;
    element.loading = "lazy";
    if (element.tagName === "IMG" && !element.hasAttribute("decoding")) element.decoding = "async";
  });
}

function watchMedia() {
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      optimizeMedia();
    });
  }).observe(document.body, { childList: true, subtree: true });
}

/* ------------------------------------------- préchargement à l'intention */
function prefetchOnIntent() {
  if (saveData || !document.createElement("link").relList?.supports?.("prefetch")) return;
  const seen = new Set();
  const warm = (event) => {
    const link = event.target.closest?.("a[href]");
    if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
    if (url.pathname === location.pathname && url.search === location.search) return;
    if (seen.has(url.href)) return;
    seen.add(url.href);
    const hint = document.createElement("link");
    hint.rel = "prefetch";
    hint.href = url.href;
    document.head.append(hint);
  };
  document.addEventListener("pointerover", warm, { passive: true });
  document.addEventListener("touchstart", warm, { passive: true });
}

export function initGod() {
  safely("styles", loadStyles);
  safely("progression", addProgressBar);
  safely("titre", splitHeading);
  safely("compteurs", animateCounters);
  safely("projecteur", cardSpotlight);
  safely("médias", () => {
    optimizeMedia();
    watchMedia();
  });
  safely("préchargement", prefetchOnIntent);
  // Le shader attend que le navigateur soit au repos : jamais en concurrence avec le LCP.
  const idle = window.requestIdleCallback || ((callback) => setTimeout(callback, 600));
  idle(() => safely("shader du héros", heroShader), { timeout: 2500 });
}

export default initGod;
