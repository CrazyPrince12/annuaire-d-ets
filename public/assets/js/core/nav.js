/**
 * Chrome partagé : en-tête, pied de page, barre d'onglets mobile, menu
 * déroulant, bandeau cookies, bandeau hors-ligne, boutons de partage.
 *
 * Construit en JS depuis un seul fichier pour que les 25 pages restent
 * identiques : un changement de lien ou de libellé se fait ici. Chaque page
 * embarque un `<noscript>` avec les liens essentiels (voir le modèle HTML).
 */

import { SITE, SITE_NAME } from "./config.js";
import { t, setLang, getLang } from "./i18n.js";
import { icon } from "./icons.js";
import { toast, confirmDialog } from "./toast.js";
import * as storage from "./storage.js";
import { $, $$, esc, share, copyText, initials } from "./ui.js";
import { session, logout, post, can } from "./api.js";
import { getTheme } from "./theme.js";

const MAIN_LINKS = [
  { href: "/explorer", key: "nav.explore", icon: "search", match: ["/explorer", "/entreprises"] },
  { href: "/carte", key: "nav.map", icon: "map", match: ["/carte"] },
  { href: "/offres", key: "nav.offers", icon: "briefcase", match: ["/offres", "/stages"] },
  { href: "/villes", key: "nav.cities", icon: "building2", match: ["/villes"] },
  { href: "/secteurs", key: "nav.sectors", icon: "layers", match: ["/secteurs"] },
];

const FOOTER_LINKS = {
  explore: [
    { href: "/explorer", key: "nav.explore" },
    { href: "/carte", key: "nav.map" },
    { href: "/villes", key: "nav.cities" },
    { href: "/secteurs", key: "nav.sectors" },
    { href: "/offres", key: "nav.offers" },
    { href: "/stages", key: "nav.internships" },
  ],
  business: [
    { href: "/contribuer", key: "footer.addCompany" },
    { href: "/espace-entreprise", key: "footer.claim" },
    { href: "/premium", key: "common.premium" },
    { href: "/offres", key: "nav.offers" },
  ],
  resources: [
    { href: "/aide", key: "footer.help" },
    { href: "/charte-des-avis", key: "footer.charter" },
    { href: "/plan-du-site", key: "footer.sitemap" },
    { href: "/contact", key: "footer.contact" },
    { href: "/a-propos", key: "nav.about" },
  ],
  legal: [
    { href: "/mentions-legales", key: "footer.legalNotice" },
    { href: "/confidentialite", key: "footer.privacy" },
    { href: "/conditions", key: "footer.terms" },
  ],
};

let currentUser = null;

function isCurrent(path) {
  const here = location.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/";
  return here === path || (path !== "/" && here.startsWith(`${path}/`));
}

/* ------------------------------------------------------------------ en-tête */

function authZone() {
  if (!currentUser) {
    return `
      <a class="btn btn-ghost sm header-login" href="/login?next=${encodeURIComponent(
        location.pathname + location.search
      )}">${icon("user", { size: 16 })} <span>${t("nav.login")}</span></a>`;
  }
  const name = `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim() || currentUser.email;
  const isStaff = ["super_admin", "admin", "moderator"].includes(currentUser.role);
  return `
    <div class="auth-menu" data-auth-menu>
      <button type="button" class="avatar-btn" aria-expanded="false" aria-haspopup="true"
              aria-label="${esc(t("nav.account"))} — ${esc(name)}">
        <span class="avatar">${esc(initials(name) || "CG")}</span>
      </button>
      <div class="dropdown" hidden>
        <div class="dropdown-head">
          <strong>${esc(name)}</strong>
          <span>${esc(currentUser.roleLabel || currentUser.role)}</span>
        </div>
        <a href="/compte">${icon("user", { size: 16 })} ${t("nav.account")}</a>
        <a href="/compte#favoris">${icon("heart", { size: 16 })} ${t("nav.favorites")}</a>
        <a href="/compte#alertes">${icon("bell", { size: 16 })} ${t("account.nav.alerts")}</a>
        ${
          can(currentUser, "company.manage") || currentUser.role === "company"
            ? `<a href="/espace-entreprise">${icon("building2", { size: 16 })} ${t("nav.business")}</a>`
            : ""
        }
        ${isStaff ? `<a href="/admin">${icon("settings", { size: 16 })} ${t("nav.admin")}</a>` : ""}
        <hr />
        <button type="button" data-logout>${icon("logOut", { size: 16 })} ${t("nav.logout")}</button>
      </div>
    </div>`;
}

function headerMarkup() {
  return `
  <div class="container">
    <div class="header-shell" id="header-shell">
      <div class="header-inner">
        <a class="brand" href="/" aria-label="${SITE_NAME} — ${esc(t("nav.home"))}">
          <img src="/assets/img/logo-mark.svg" alt="" width="28" height="28" />
          <span>${SITE_NAME}</span>
        </a>

        <nav class="header-nav" aria-label="${esc(t("nav.mainNav"))}">
          ${MAIN_LINKS.map(
            (link) =>
              `<a href="${link.href}" ${isCurrent(link.href) ? 'aria-current="page"' : ""}>${t(link.key)}</a>`
          ).join("")}
        </nav>

        <div class="header-actions">
          <button type="button" class="search-mini header-search" data-open-search
                  aria-label="${esc(t("search.open"))}">
            ${icon("search", { size: 16 })}
            <input type="text" placeholder="${esc(t("search.placeholder"))}" tabindex="-1" readonly
                   aria-hidden="true" />
            <kbd>/</kbd>
          </button>

          <button type="button" class="icon-btn search-mobile-btn" data-open-search
                  aria-label="${esc(t("search.open"))}">${icon("search", { size: 20 })}</button>

          <a class="icon-btn header-fav" href="/compte#favoris" aria-label="${esc(t("nav.favorites"))}">
            ${icon("heart", { size: 20 })}
            <span class="badge-dot" data-favorites-count hidden>0</span>
          </a>

          <button type="button" class="icon-btn" data-theme-toggle
                  aria-label="${esc(t("theme.switch"))}">
            <span data-theme-icon class="theme-icon"></span>
          </button>

          <button type="button" class="icon-btn lang-btn" data-lang-toggle
                  aria-label="${esc(t("lang.switch"))}" title="${esc(t("lang.switch"))}">
            ${icon("languages", { size: 20 })}
          </button>

          <div class="header-auth" data-auth-zone>${authZone()}</div>

          <button type="button" class="icon-btn header-menu-btn" data-open-menu
                  aria-label="${esc(t("nav.openMenu"))}" aria-expanded="false"
                  aria-controls="mobile-menu">${icon("menu", { size: 22 })}</button>
        </div>
      </div>
    </div>
  </div>`;
}

/* ------------------------------------------------------------- menu mobile */

function mobileMenuMarkup() {
  return `
  <div class="mobile-menu" id="mobile-menu" hidden role="dialog" aria-modal="true"
       aria-label="${esc(t("nav.menu"))}">
    <div class="mobile-menu-head">
      <a class="brand" href="/">
        <img src="/assets/img/logo-mark.svg" alt="" width="28" height="28" />
        <span>${SITE_NAME}</span>
      </a>
      <button type="button" class="icon-btn" data-close-menu aria-label="${esc(t("nav.close"))}">
        ${icon("x", { size: 22 })}
      </button>
    </div>
    <nav aria-label="${esc(t("nav.mainNav"))}">
      ${MAIN_LINKS.map(
        (link) => `<a href="${link.href}">${icon(link.icon, { size: 20 })} ${t(link.key)}</a>`
      ).join("")}
      <div class="group-label">${t("nav.more")}</div>
      <a href="/avis">${icon("star", { size: 20 })} ${t("nav.reviews")}</a>
      <a href="/contribuer">${icon("plus", { size: 20 })} ${t("nav.contribute")}</a>
      <a href="/comparer">${icon("scale", { size: 20 })} ${t("nav.compare")}</a>
      <a href="/aide">${icon("helpCircle", { size: 20 })} ${t("nav.help")}</a>
    </nav>
    <div class="mobile-menu-footer">
      ${
        currentUser
          ? `
        <a class="btn btn-secondary" href="/compte">${icon("user", { size: 18 })} ${t("nav.account")}</a>
        ${
          ["super_admin", "admin", "moderator"].includes(currentUser.role)
            ? `<a class="btn btn-ghost" href="/admin">${icon("settings", { size: 18 })} ${t("nav.admin")}</a>`
            : ""
        }
        <button type="button" class="btn btn-ghost" data-logout>${icon("logOut", { size: 18 })} ${t("nav.logout")}</button>`
          : `
        <a class="btn btn-primary" href="/login?next=${encodeURIComponent(location.pathname)}">${icon("user", {
          size: 18,
        })} ${t("nav.login")}</a>
        <a class="btn btn-secondary" href="/login?mode=register">${t("nav.signup")}</a>`
      }
      <div class="row" style="justify-content:space-between;margin-top:auto">
        <button type="button" class="btn btn-ghost sm" data-theme-toggle>
          <span data-theme-icon></span> ${t("theme.label")}
        </button>
        <button type="button" class="btn btn-ghost sm" data-lang-toggle>
          ${icon("languages", { size: 16 })} ${getLang() === "fr" ? "EN" : "FR"}
        </button>
      </div>
    </div>
  </div>`;
}

/* ------------------------------------------------- barre d'onglets mobile */

function bottomNavMarkup() {
  const current = location.pathname.replace(/\.html$/, "") || "/";
  const items = [
    { href: "/", key: "nav.home", icon: "house" },
    { href: "/explorer", key: "nav.explore", icon: "search" },
    { href: "/carte", key: "nav.map", icon: "map" },
    { href: "/offres", key: "nav.offers", icon: "briefcase" },
    current.startsWith("/compte") || current.startsWith("/espace-entreprise")
      ? { href: "/compte", key: "nav.account", icon: "user" }
      : { href: "/login", key: "nav.login", icon: "user" },
  ];
  return `
  <nav class="bottom-nav" aria-label="${esc(t("nav.mainNav"))}">
    ${items
      .map(
        (item) => `
      <a href="${item.href}" ${current === item.href ? 'aria-current="page"' : ""}>
        ${icon(item.icon, { size: 22 })}
        <span>${t(item.key)}</span>
      </a>`
      )
      .join("")}
  </nav>`;
}

/* ------------------------------------------------------------- pied de page */

function footerMarkup() {
  const column = (titleKey, links) => `
    <div>
      <h3>${t(titleKey)}</h3>
      <div class="footer-links">
        ${links.map((link) => `<a href="${link.href}">${t(link.key)}</a>`).join("")}
      </div>
    </div>`;

  return `
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <a class="brand" href="/">
          <img src="/assets/img/logo-mark.svg" alt="" width="28" height="28" />
          <span>${SITE_NAME}</span>
        </a>
        <p>${t("footer.about")}</p>
        <div class="footer-social">
          <a href="${SITE.social.facebook}" target="_blank" rel="noopener noreferrer"
             aria-label="Facebook">${icon("facebook", { size: 18 })}</a>
          <a href="${SITE.social.linkedin}" target="_blank" rel="noopener noreferrer"
             aria-label="LinkedIn">${icon("linkedin", { size: 18 })}</a>
          <a href="${SITE.social.x}" target="_blank" rel="noopener noreferrer"
             aria-label="X">${icon("x", { size: 18 })}</a>
          <a href="${SITE.social.instagram}" target="_blank" rel="noopener noreferrer"
             aria-label="Instagram">${icon("instagram", { size: 18 })}</a>
        </div>
        <form class="newsletter" data-newsletter novalidate>
          <label for="newsletter-email">${t("footer.newsletter")}</label>
          <p class="notice-small">${t("footer.newsletterHint")}</p>
          <div class="row">
            <input class="input" id="newsletter-email" name="email" type="email" required
                   autocomplete="email" placeholder="${esc(t("footer.emailPlaceholder"))}"
                   aria-label="${esc(t("footer.newsletter"))}" />
            <button class="btn btn-primary sm" type="submit">${t("footer.subscribe")}</button>
          </div>
        </form>
      </div>

      ${column("footer.explore", FOOTER_LINKS.explore)}
      ${column("footer.company", FOOTER_LINKS.business)}
      ${column("footer.resources", FOOTER_LINKS.resources)}

      <div>
        <h3>${t("footer.legal")}</h3>
        <div class="footer-links">
          ${FOOTER_LINKS.legal.map((link) => `<a href="${link.href}">${t(link.key)}</a>`).join("")}
          <a href="/sitemap.xml">sitemap.xml</a>
          <a href="/llms.txt">llms.txt</a>
        </div>
        <p class="notice-small" style="margin-top:14px">
          ${esc(SITE.address.street)}<br />${esc(SITE.address.city)}, ${esc(SITE.address.country)}<br />
          <a class="link" href="mailto:${SITE.email}">${SITE.email}</a>
        </p>
      </div>
    </div>

    <div class="footer-bottom">
      <span>© ${new Date().getFullYear()} ${SITE_NAME}. ${t("footer.rights")}</span>
      <span class="footer-made">${icon("mapPin", { size: 13 })} ${t("footer.madeIn")}</span>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ tiroirs */

let lastFocus = null;

function openMobileMenu() {
  const menu = $("#mobile-menu");
  if (!menu) return;
  lastFocus = document.activeElement;
  menu.hidden = false;
  document.body.style.overflow = "hidden";
  $("[data-open-menu]")?.setAttribute("aria-expanded", "true");
  menu.querySelector("button, a")?.focus();
}

function closeMobileMenu({ restore = true } = {}) {
  const menu = $("#mobile-menu");
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  document.body.style.overflow = "";
  $("[data-open-menu]")?.setAttribute("aria-expanded", "false");
  if (restore) lastFocus?.focus?.();
}

/* ------------------------------------------------------------------- auth */

async function renderAuth() {
  try {
    const data = await session();
    currentUser = data?.user || null;
  } catch {
    currentUser = null;
  }
  const zone = $("[data-auth-zone]");
  if (zone) zone.innerHTML = authZone();
  const menu = $("#mobile-menu");
  if (menu) {
    menu.outerHTML = mobileMenuMarkup();
    wireMobileMenu();
  }
  document.documentElement.dataset.auth = currentUser ? "in" : "out";
  window.dispatchEvent(new CustomEvent("cg:auth", { detail: { user: currentUser } }));
  return currentUser;
}

export function currentSessionUser() {
  return currentUser;
}

function wireAuthMenu() {
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest(".avatar-btn");
    const menu = trigger?.parentElement?.querySelector(".dropdown");
    if (trigger && menu) {
      const open = menu.hidden;
      menu.hidden = !open;
      trigger.setAttribute("aria-expanded", String(open));
      return;
    }
    if (!event.target.closest("[data-auth-menu]")) {
      $$("[data-auth-menu] .dropdown").forEach((dropdown) => {
        dropdown.hidden = true;
        dropdown.parentElement?.querySelector(".avatar-btn")?.setAttribute("aria-expanded", "false");
      });
    }

    if (event.target.closest("[data-logout]")) {
      event.preventDefault();
      handleLogout();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMobileMenu();
      $$("[data-auth-menu] .dropdown").forEach((dropdown) => (dropdown.hidden = true));
    }
  });
}

async function handleLogout() {
  const ok = await confirmDialog({
    title: t("nav.logout"),
    text: t("account.logoutConfirm"),
    confirmLabel: t("nav.logout"),
  });
  if (!ok) return;
  try {
    await logout();
    toast.success(t("auth.loggedOut"));
    setTimeout(() => {
      location.href = "/";
    }, 400);
  } catch {
    toast.error(t("common.errorGeneric"));
  }
}

/* -------------------------------------------------------- bandeaux & divers */

function ensureDemoRibbon() {
  if (storage.read(storage.KEYS.cookie + ".demoDismissed", false)) return;
  if ($(".demo-ribbon")) return;
  const node = document.createElement("div");
  node.className = "demo-ribbon";
  node.setAttribute("role", "status");
  node.innerHTML = `
    ${icon("sparkles", { size: 14 })}
    <span><strong>${t("demo.ribbon")}</strong> · ${t("demo.ribbonText")}
      <a href="/login">${t("nav.login")}</a></span>
    <button type="button" data-dismiss-demo aria-label="${esc(t("common.close"))}">${icon("x", { size: 14 })}</button>`;
  document.body.prepend(node);
  node.querySelector("[data-dismiss-demo]").addEventListener("click", () => {
    storage.write(storage.KEYS.cookie + ".demoDismissed", true);
    node.remove();
  });
}

function ensureCookieBanner() {
  if (storage.read(storage.KEYS.cookie, false)) return;
  const node = document.createElement("div");
  node.className = "cookie-banner";
  node.setAttribute("role", "dialog");
  node.setAttribute("aria-live", "polite");
  node.setAttribute("aria-label", t("cookie.text"));
  node.innerHTML = `
    <p>${t("cookie.text")} <a class="link" href="/confidentialite">${t("cookie.more")}</a></p>
    <div class="actions">
      <button type="button" class="btn btn-primary sm" data-cookie-accept>${t("cookie.accept")}</button>
    </div>`;
  document.body.appendChild(node);
  node.querySelector("[data-cookie-accept]").addEventListener("click", () => {
    storage.write(storage.KEYS.cookie, true);
    node.remove();
  });
}

function wireNetwork() {
  const show = (offline) => {
    let banner = $("#offline-banner");
    if (!offline) {
      banner?.remove();
      return;
    }
    if (banner) return;
    banner = document.createElement("div");
    banner.id = "offline-banner";
    banner.className = "banner warning offline-banner";
    banner.setAttribute("role", "status");
    banner.innerHTML = `${icon("info", { size: 16 })}<span>${t("offline.banner")}</span>
      <button type="button" class="btn btn-ghost sm" data-offline-retry>${t("offline.retry")}</button>`;
    document.body.prepend(banner);
    banner.querySelector("[data-offline-retry]").addEventListener("click", () => location.reload());
  };
  show(navigator.onLine === false);
  window.addEventListener("offline", () => {
    show(true);
    toast.error(t("common.networkOffline"));
  });
  window.addEventListener("online", () => {
    show(false);
    toast.success(t("common.networkBack"));
  });
}

/** Boutons `data-share`, `data-copy` et statistiques de contact. */
function wireGlobalActions() {
  document.addEventListener("click", (event) => {
    const shareBtn = event.target.closest("[data-share]");
    if (shareBtn) {
      event.preventDefault();
      share({
        title: shareBtn.dataset.shareTitle || document.title,
        text: shareBtn.dataset.shareText || SITE.description,
        url: shareBtn.dataset.shareUrl || location.href,
      });
      return;
    }

    const copyBtn = event.target.closest("[data-copy]");
    if (copyBtn) {
      event.preventDefault();
      copyText(copyBtn.dataset.copy).then((ok) => {
        if (ok) toast.success(t("toast.linkCopied"));
        else toast.error(t("common.errorGeneric"));
      });
      return;
    }

    const trackLink = event.target.closest("[data-track]");
    if (trackLink) {
      const kindMap = { phone: "phone_click", whatsapp: "whatsapp_click", site: "site_click", direction: "direction_click" };
      const kind = kindMap[trackLink.dataset.track];
      const slug = trackLink.closest("[data-company]")?.dataset.company || document.body.dataset.company;
      if (kind && slug) post("/events", { kind, companySlug: slug }).catch(() => null);
    }
  });

  const form = $("[data-newsletter]");
  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = form.querySelector('input[type="email"]');
      if (!email?.value || !email.checkValidity()) {
        email?.focus();
        toast.error(t("auth.badEmail"));
        return;
      }
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        await post("/contact", {
          name: "Newsletter",
          email: email.value.trim(),
          subject: "Inscription à la lettre mensuelle",
          message: "Inscription à la lettre mensuelle depuis le pied de page du site.",
        });
        toast.success(t("footer.subscribed"));
        form.reset();
      } catch (err) {
        toast.error(err?.message || t("common.errorGeneric"));
      } finally {
        button.disabled = false;
      }
    });
  }
}

/* --------------------------------------------------------------- amorçage */

function wireHeader() {
  const header = $(".site-header");
  const shell = $("#header-shell");
  if (!header) return;
  let ticking = false;
  const update = () => {
    const scrolled = window.scrollY > 8;
    header.dataset.scrolled = String(scrolled);
    if (shell) shell.dataset.scrolled = String(scrolled);
    ticking = false;
  };
  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    },
    { passive: true }
  );
  update();

  const activeMatch = MAIN_LINKS.find((link) => link.match.some((m) => isCurrent(m)));
  $$(".header-nav a").forEach((link) => {
    if (link.getAttribute("href") === activeMatch?.href) link.setAttribute("aria-current", "page");
  });
}

function wireMobileMenu() {
  $$("[data-open-menu]").forEach((btn) =>
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      openMobileMenu();
    })
  );
  $$("[data-close-menu]").forEach((btn) => btn.addEventListener("click", () => closeMobileMenu()));
  $("#mobile-menu")?.addEventListener("click", (event) => {
    if (event.target.id === "mobile-menu") closeMobileMenu();
  });
  $$("#mobile-menu a").forEach((link) =>
    link.addEventListener("click", () => closeMobileMenu({ restore: false }))
  );
}

function wireLang() {
  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-lang-toggle]")) return;
    event.preventDefault();
    const next = getLang() === "fr" ? "en" : "fr";
    setLang(next);
    // Les textes générés en JS doivent être reconstruits : on recharge.
    location.reload();
  });
}

export async function initNav() {
  const header = $("#site-header");
  if (header) header.innerHTML = headerMarkup();
  const footer = $("#site-footer");
  if (footer) footer.innerHTML = footerMarkup();
  document.body.insertAdjacentHTML("beforeend", mobileMenuMarkup());
  document.body.insertAdjacentHTML("beforeend", bottomNavMarkup());

  // Icône de thème : soleil / lune / moniteur selon le choix.
  const paintThemeIcon = () => {
    const choice = getTheme();
    const name = choice === "light" ? "sun" : choice === "dark" ? "moon" : "monitor";
    const target = $(".site-header [data-theme-icon]");
    if (target) target.innerHTML = icon(name, { size: 20 });
    const mobileTarget = $("#mobile-menu [data-theme-icon]");
    if (mobileTarget) mobileTarget.innerHTML = icon(name, { size: 18 });
  };
  paintThemeIcon();
  window.addEventListener("cg:theme", paintThemeIcon);

  wireHeader();
  wireMobileMenu();
  wireAuthMenu();
  wireLang();
  wireGlobalActions();
  wireNetwork();
  ensureCookieBanner();
  if (document.body.dataset.demo !== "false") ensureDemoRibbon();

  await renderAuth();
  window.addEventListener("cg:lang", () => {
    paintThemeIcon();
  });

  return currentUser;
}

export default { initNav, currentSessionUser };
