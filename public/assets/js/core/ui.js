/**
 * Briques d'interface partagées : sélecteurs, construction de DOM, cartes
 * d'entreprise et d'offre, états vide/erreur, étoiles, animations d'apparition.
 *
 * Toutes les fonctions qui produisent du HTML échappent les valeurs reçues :
 * les données viennent de la base (donc d'utilisateurs pour les avis).
 */

import { SITE, UI } from "./config.js";
import { t, formatNumber, formatDate, formatRelative, formatCurrency } from "./i18n.js";
import { icon } from "./icons.js";
import { toast } from "./toast.js";

/* ------------------------------------------------------------- sélecteurs */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/** Échappe une valeur pour insertion dans du HTML. */
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]
  );
}

/** Construit un élément : `el("div", { class: "x" }, "texte")`. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "html") node.innerHTML = value;
    else if (key === "text") node.textContent = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value);
  }
  [].concat(children).forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });
  return node;
}

export function debounce(fn, wait = 200) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

export function throttle(fn, wait = 120) {
  let last = 0;
  let timer = null;
  return (...args) => {
    const now = Date.now();
    const remaining = wait - (now - last);
    if (remaining <= 0) {
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        last = Date.now();
        fn(...args);
      }, remaining);
    }
  };
}

export function sortedUnique(list) {
  return [...new Set((list || []).filter(Boolean))].sort();
}

/* ---------------------------------------------------------------- réglages */

export function savedView() {
  return "grid";
}

/* ------------------------------------------------------------------- liens */

export const companyUrl = (slug) => `/entreprises/${encodeURIComponent(slug)}`;
export const offerUrl = (slug) => `/offres/${encodeURIComponent(slug)}`;
export const cityUrl = (slug) => `/villes/${encodeURIComponent(slug)}`;
export const sectorUrl = (slug) => `/secteurs/${encodeURIComponent(slug)}`;

/** Numéro camerounais lisible : +237 6 XX XX XX XX. */
export function displayPhone(raw) {
  const digits = String(raw || "").replace(/[^\d+]/g, "");
  const local = digits.startsWith("+237") ? digits.slice(4) : digits.startsWith("237") ? digits.slice(3) : digits;
  if (local.length !== 9) return String(raw || "");
  return `+237 ${local[0]} ${local.slice(1, 3)} ${local.slice(3, 5)} ${local.slice(5, 7)} ${local.slice(7, 9)}`;
}

export function phoneHref(raw) {
  const digits = String(raw || "").replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("+")) return `tel:${digits}`;
  if (digits.startsWith("237")) return `tel:+${digits}`;
  return `tel:+237${digits.replace(/^0+/, "")}`;
}

export function whatsappHref(raw, text) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  const full = digits.startsWith("237") ? digits : `237${digits.replace(/^0+/, "")}`;
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${full}${query}`;
}

export function websiteHref(url) {
  if (!url) return "";
  try {
    const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

export function websiteLabel(url) {
  try {
    return new URL(websiteHref(url)).hostname.replace(/^www\./, "");
  } catch {
    return url || "";
  }
}

/** Itinéraire : OpenStreetMap par défaut (aucune clé, aucune fuite de données). */
export function directionsUrl({ lat, lng, address, label } = {}) {
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.openstreetmap.org/directions?route=&to=${lat}%2C${lng}`;
  }
  const query = [label, address].filter(Boolean).join(" ");
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`;
}

export function mapUrl({ lat, lng, label, zoom = 16 } = {}) {
  const params = new URLSearchParams();
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    params.set("lat", String(lat));
    params.set("lng", String(lng));
    params.set("z", String(zoom));
  }
  if (label) params.set("q", label);
  return `/carte?${params.toString()}`;
}

/* ------------------------------------------------------------------- notes */

/** Étoiles (0 à 5, demi-étoiles) en SVG. */
export function starsHtml(rating, { size = 16, label = null } = {}) {
  const value = Number(rating) || 0;
  const out = [];
  for (let i = 1; i <= 5; i += 1) {
    const cls = value >= i - 0.25 ? "filled" : value >= i - 0.75 ? "half" : "";
    out.push(icon("star", { size, class: cls }));
  }
  const aria = label ?? (value ? t("a11y.ratingStars", { n: value.toFixed(1) }) : t("a11y.ratingNone"));
  return `<span class="stars" role="img" aria-label="${esc(aria)}">${out.join("")}</span>`;
}

/** Bloc note compact pour les cartes. */
export function ratingHtml(company, { showCount = true } = {}) {
  if (!company || !company.rating) {
    return `<span class="rating rating--empty">${icon("star", { size: 15 })}<span class="rating-count">${t("company.noRating")}</span></span>`;
  }
  const count = company.reviewsPublished ?? company.ratingCount ?? 0;
  return `
    <span class="rating" title="${esc(t("company.ratingValue", { rating: Number(company.rating).toFixed(1) }))}">
      ${icon("star", { size: 15 })}
      <span>${Number(company.rating).toFixed(1)}</span>
      ${showCount ? `<span class="rating-count">(${formatNumber(count)})</span>` : ""}
    </span>`;
}

/* -------------------------------------------------------- monogramme/couleur */

const PALETTE = [
  ["#6FE3B4", "#22C07A"],
  ["#FFD97A", "#E0A82E"],
  ["#8FD0FF", "#3B82F6"],
  ["#C7A8FF", "#7C4DFF"],
  ["#FFB3A7", "#EF5B4B"],
  ["#A8E6D0", "#12A778"],
  ["#F4C3E3", "#C2459A"],
  ["#BFD88E", "#6E9E2F"],
];

function hash(str) {
  let h = 0;
  const value = String(str || "");
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

export function monogramStyle(name) {
  const [m1, m2] = PALETTE[hash(name) % PALETTE.length];
  return `--m1:${m1};--m2:${m2}`;
}

export function initials(name) {
  const words = String(name || "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
  if (!words.length) return "CG";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function logoMark(name, { size = "sm", extraClass = "" } = {}) {
  return `<span class="logo-mark ${size} ${extraClass}" style="${monogramStyle(name)}" aria-hidden="true">${esc(
    initials(name)
  )}</span>`;
}

/* --------------------------------------------------------------- horaires */

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function dayLabel(key) {
  return t(`company.day.${key}`);
}

/** « 08:00-17:30 » → { open: 480, close: 1050 } (minutes). */
function parseRange(range) {
  const match = /^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/.exec(String(range || "").trim());
  if (!match) return null;
  return {
    open: Number(match[1]) * 60 + Number(match[2]),
    close: Number(match[3]) * 60 + Number(match[4]),
  };
}

export function hoursForToday(hours) {
  if (!hours) return null;
  const key = DAY_KEYS[new Date().getDay()];
  const range = hours[key];
  if (!range) return null;
  return { key, range, parsed: parseRange(range) };
}

export function isOpenNow(hours) {
  const today = hoursForToday(hours);
  if (!today || !today.parsed) return null;
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const { open, close } = today.parsed;
  if (close >= open) return minutes >= open && minutes < close;
  return minutes >= open || minutes < close; // horaires de nuit
}

export function openBadge(hours) {
  const state = isOpenNow(hours);
  if (state === null) return "";
  return `<span class="badge ${state ? "badge-open" : "badge-closed"}">${
    state ? t("common.open") : t("common.closed")
  }</span>`;
}

export function todayHoursText(hours) {
  const today = hoursForToday(hours);
  if (!today || !today.parsed) return t("company.day.closed");
  return today.range.replace("-", " – ");
}

/* ------------------------------------------------------- cartes entreprise */

export function companyCard(company, { compact = false } = {}) {
  if (!company) return "";
  const badges = [];
  if (company.verified === 2) badges.push(`<span class="badge badge-partner">${icon("badgeCheck", { size: 12 })} ${t("common.verified")}</span>`);
  else if (company.verified === 1) badges.push(`<span class="badge badge-verified">${icon("shieldCheck", { size: 12 })} ${t("common.verified")}</span>`);
  if (company.isHiring) badges.push(`<span class="badge badge-hiring">${icon("briefcase", { size: 12 })} ${company.offersCount || ""}</span>`);
  if (company.isNew) badges.push(`<span class="badge badge-new">${t("common.new")}</span>`);
  if (company.provenance === "exemple") badges.push(`<span class="example-flag">${t("common.example")}</span>`);

  const where = [company.neighborhood?.name, company.city?.name].filter(Boolean).join(", ");
  const tel = phoneHref(company.phone);
  const wa = whatsappHref(company.phone);
  const open = openBadge(company.hours);

  return `
  <article class="company-card" data-company="${esc(company.slug)}">
    <div class="company-card-head">
      ${logoMark(company.name)}
      <div class="company-card-body">
        <h3><a href="${companyUrl(company.slug)}">${esc(company.name)}</a></h3>
        <div class="company-card-meta">
          ${company.sector ? `<span>${icon("tag", { size: 14 })}${esc(company.sector.name)}</span>` : ""}
          ${where ? `<span>${icon("mapPin", { size: 14 })}${esc(where)}</span>` : ""}
        </div>
        <div class="company-card-meta">
          ${ratingHtml(company)}
          ${open}
          ${badges.join("")}
        </div>
        ${!compact && company.short ? `<p class="company-short">${esc(company.short)}</p>` : ""}
      </div>
      <button type="button" class="fav-btn" data-favorite="${esc(company.slug)}" aria-pressed="false"
              aria-label="${t("company.favoriteAdd")}" title="${t("company.favoriteAdd")}">
        ${icon("heart", { size: 18 })}
      </button>
    </div>
    <div class="company-card-foot">
      ${
        tel
          ? `<a class="contact-btn" href="${tel}" data-track="phone" aria-label="${t("common.call")} — ${esc(company.name)}">${icon("phone", { size: 17 })}</a>`
          : ""
      }
      ${
        wa
          ? `<a class="contact-btn" href="${wa}" target="_blank" rel="noopener noreferrer" aria-label="${t("common.whatsapp")} — ${esc(company.name)}">${icon("whatsapp", { size: 17 })}</a>`
          : ""
      }
      <a class="contact-btn" href="${mapUrl({ lat: company.lat, lng: company.lng, label: company.name })}"
         aria-label="${t("common.directions")} — ${esc(company.name)}">${icon("mapPin", { size: 17 })}</a>
      <span class="spacer"></span>
      <a class="btn btn-ghost sm" href="${companyUrl(company.slug)}">${t("common.seeMore")} ${icon("chevronRight", { size: 15 })}</a>
    </div>
  </article>`;
}

export function companyCards(list, opts) {
  return (list || []).map((company) => companyCard(company, opts)).join("");
}

export function skeletonCards(count = 6) {
  return Array.from({ length: count })
    .map(
      () => `
    <div class="company-card skeleton-card" aria-hidden="true">
      <div class="company-card-head">
        <div class="skeleton" style="width:40px;height:40px;border-radius:10px"></div>
        <div class="company-card-body">
          <div class="skeleton skeleton-line w60"></div>
          <div class="skeleton skeleton-line w40"></div>
        </div>
      </div>
      <div class="skeleton skeleton-line"></div>
    </div>`
    )
    .join("");
}

/* ----------------------------------------------------------- cartes offre */

export function contractLabel(type) {
  if (!type) return t("offers.contract.other");
  const key = `offers.contract.${type}`;
  const label = t(key);
  return label === key ? t("offers.contract.other") : label;
}

export function salaryLabel(offer) {
  if (!offer?.salary) return t("offers.salary.hidden");
  const { min, max } = offer.salary;
  const fmt = (v) => formatNumber(v, { maximumFractionDigits: 0 });
  if (min && max && min !== max) return `${fmt(min)} – ${fmt(max)} FCFA`;
  if (min) return `${fmt(min)} FCFA`;
  return t("offers.salary.negotiable");
}

export function offerCard(offer, { showCompany = true } = {}) {
  if (!offer) return "";
  const soon = offer.deadlineAt && !offer.expired && new Date(offer.deadlineAt).getTime() - Date.now() < 3 * 86400000;
  return `
  <article class="offer-card ${offer.expired ? "expired" : ""}">
    <div class="offer-main">
      <div class="offer-meta">
        <span class="badge ${offer.isInternship ? "badge-intern" : "badge-verified"}">${esc(contractLabel(offer.contractType))}</span>
        ${offer.city ? `<span>${icon("mapPin", { size: 13 })}${esc(offer.city.name)}</span>` : ""}
        ${offer.deadlineAt ? `<span class="${soon ? "deadline-soon" : ""}">${icon("clock", { size: 13 })}${esc(
          offer.expired ? t("offers.expired") : t("offers.deadline", { date: formatDate(offer.deadlineAt, "short") })
        )}</span>` : ""}
      </div>
      <h3><a href="${offerUrl(offer.slug)}">${esc(offer.title)}</a></h3>
      ${
        showCompany && offer.company
          ? `<p class="offer-company">${esc(offer.company.name)}${
              offer.company.verified ? ` ${icon("badgeCheck", { size: 13, class: "verified-glyph" })}` : ""
            }</p>`
          : ""
      }
    </div>
    <div class="offer-side">
      <span class="badge badge-new">${esc(salaryLabel(offer))}</span>
      ${offer.provenance === "exemple" ? `<span class="example-flag">${t("common.example")}</span>` : ""}
    </div>
  </article>`;
}

/* ---------------------------------------------------------- états divers */

export function emptyState({ iconName = "search", title, text, action = "" } = {}) {
  return `
  <div class="empty-state">
    ${icon(iconName, { size: 34 })}
    <h3>${esc(title || t("common.empty"))}</h3>
    ${text ? `<p>${esc(text)}</p>` : ""}
    ${action}
  </div>`;
}

export function errorState({ text, retryLabel, retryAttr = "data-retry" } = {}) {
  return `
  <div class="error-state" role="alert">
    ${icon("alertTriangle", { size: 34 })}
    <h3>${t("common.error")}</h3>
    <p>${esc(text || t("common.errorGeneric"))}</p>
    <button type="button" class="btn btn-secondary sm" ${retryAttr}>${icon("rotateCcw", { size: 15 })} ${esc(
      retryLabel || t("common.retry")
    )}</button>
  </div>`;
}

export function errorMessage(error) {
  if (!error) return t("common.errorGeneric");
  if (error.offline) return t("common.errorNetwork");
  if (error.code === "timeout") return t("common.errorGeneric");
  if (error.code === "db_unavailable") {
    const message = t("common.databaseUnavailable");
    const reason = error.details?.reason;
    return typeof reason === "string" && /^[a-z_]{1,32}$/.test(reason)
      ? `${message} ${t("common.databaseReference", { code: reason })}`
      : message;
  }
  return error.message || t("common.errorGeneric");
}

export function setLoading(button, loading = true) {
  if (!button) return;
  if (loading) {
    button.dataset.loading = "true";
    button.setAttribute("aria-busy", "true");
    button.disabled = true;
  } else {
    delete button.dataset.loading;
    button.removeAttribute("aria-busy");
    button.disabled = false;
  }
}

/* ------------------------------------------------------------ partage/copie */

export async function copyText(value) {
  const text = String(value ?? "");
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* on tente le repli */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export async function share({ title, text, url }) {
  const payload = { title: title || SITE.name, text: text || SITE.tagline, url: url || location.href };
  try {
    if (navigator.share) {
      await navigator.share(payload);
      return "shared";
    }
  } catch (err) {
    if (err?.name === "AbortError") return "cancelled";
  }
  const ok = await copyText(payload.url);
  toast[ok ? "success" : "error"](t(ok ? "toast.linkCopied" : "common.errorGeneric"));
  return ok ? "copied" : "failed";
}

/* --------------------------------------------------------- animations douces */

let observer = null;

/** Révélation à l'apparition (IntersectionObserver, dégradation CSS). */
export function revealOnScroll(root = document) {
  const nodes = $$("[data-reveal]", root).filter((node) => !node.dataset.revealed);
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduced || !("IntersectionObserver" in window)) {
    nodes.forEach((node) => {
      node.dataset.revealed = "true";
      node.classList.add("is-revealed");
    });
    return;
  }
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, index) => {
          if (!entry.isIntersecting) return;
          const node = entry.target;
          node.style.setProperty("--reveal-delay", `${Math.min(index * 60, 240)}ms`);
          node.classList.add("is-revealed");
          node.dataset.revealed = "true";
          observer.unobserve(node);
        });
      },
      { threshold: UI.revealThreshold, rootMargin: "0px 0px -40px 0px" }
    );
  }
  nodes.forEach((node) => observer.observe(node));
}

/** Compteur animé (respecte `prefers-reduced-motion`). */
export function countUp(node, target, { duration = 900 } = {}) {
  if (!node) return;
  const value = Number(target) || 0;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduced || value < 10) {
    node.textContent = formatNumber(value);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    node.textContent = formatNumber(Math.round(value * eased));
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* Zone d'annonce pour lecteurs d'écran. */
let liveRegion = null;
export function announce(message) {
  if (!message || typeof document === "undefined") return;
  if (!liveRegion) {
    liveRegion = document.createElement("div");
    liveRegion.className = "visually-hidden";
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.setAttribute("role", "status");
    document.body.appendChild(liveRegion);
  }
  liveRegion.textContent = "";
  setTimeout(() => {
    liveRegion.textContent = message;
  }, 60);
}

/** Remplit les jetons `<span data-icon="…">` présents dans le HTML statique. */
export function hydrateIcons(root = document) {
  $$("[data-icon]", root).forEach((node) => {
    if (node.dataset.iconDone === "true") return;
    const size = Number(node.dataset.iconSize) || 18;
    node.innerHTML = icon(node.dataset.icon, { size });
    node.dataset.iconDone = "true";
  });
}

export function truncate(text, max = 140) {
  const value = String(text || "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

export { formatNumber, formatDate, formatRelative, formatCurrency, icon, toast };
