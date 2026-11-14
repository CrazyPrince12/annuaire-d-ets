#!/usr/bin/env node
/**
 * `npm run smoke` — fumée DOM, sans navigateur.
 *
 * Chaque page HTML est chargée dans un DOM simulé (`linkedom`), les API sont
 * remplacées par un `fetch` minimal renvoyant la bonne forme de données, puis le
 * module de la page est initialisé. On détecte ainsi :
 *   - une coquille HTML qui ne contient pas les éléments attendus par le module,
 *   - une exception au premier rendu (sélecteur vide, donnée manquante),
 *   - un import cassé.
 *
 * Ce test ne remplace pas une vérification visuelle : il vérifie que la page
 * « démarre » sans erreur, ce qui est la cause la plus fréquente de page blanche.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");

let parseHTML;
try {
  ({ parseHTML } = await import("linkedom"));
} catch {
  console.error("\n  linkedom manquant : lancez `npm install` avant `npm run smoke`.\n");
  process.exit(1);
}

const PAGES = [
  ["home", "index.html", "home.js", "/"],
  ["explorer", "explorer.html", "explorer.js", "/explorer"],
  ["company", "entreprise.html", "company.js", "/entreprises/cabinet-fiscal-akwa"],
  ["map", "carte.html", "map.js", "/carte"],
  ["offers", "offres.html", "offers.js", "/offres"],
  ["offer", "offre.html", "offer.js", "/offres/exemple"],
  ["cities", "villes.html", "cities.js", "/villes"],
  ["city", "ville.html", "city.js", "/villes/douala"],
  ["sectors", "secteurs.html", "sectors.js", "/secteurs"],
  ["sector", "secteur.html", "sector.js", "/secteurs/comptabilite"],
  ["reviews", "avis.html", "reviews.js", "/avis"],
  ["compare", "comparer.html", "compare.js", "/comparer"],
  ["contribute", "contribuer.html", "contribute.js", "/contribuer"],
  ["login", "login.html", "login.js", "/login"],
  ["contact", "contact.html", "contact.js", "/contact"],
  ["account", "compte.html", "account.js", "/compte"],
  ["business", "espace-entreprise.html", "business.js", "/espace-entreprise"],
  ["premium", "premium.html", "premium.js", "/premium"],
  ["admin", "admin.html", "admin.js", "/admin"],
];

/** Réponse API plausible pour un chemin donné. */
function payloadFor(pathname) {
  const path = pathname.replace(/^\/api/, "");
  if (path.startsWith("/companies/")) {
    return {
      company: {
        slug: "exemple",
        name: "Entreprise Exemple",
        phone: "+237600000001",
        contacts: {},
        hours: {},
        city: { slug: "douala", name: "Douala" },
        sector: { slug: "comptabilite", name: "Comptabilité" },
      },
      summary: { total: 0, criteria: {}, distribution: {} },
      reviews: { items: [], total: 0 },
      offers: [],
      similar: [],
      sectors: [],
      minReviews: 3,
    };
  }
  if (path.startsWith("/offers/")) {
    return {
      offer: {
        slug: "exemple",
        title: "Offre exemple",
        contractType: "cdi",
        company: { name: "Entreprise Exemple", slug: "exemple" },
        salary: {},
        status: "published",
      },
      company: {},
    };
  }
  if (path.startsWith("/me")) {
    return {
      user: { id: "u1", email: "demo@conglomerat.cm", firstName: "Aïcha", role: "user" },
      overview: { counts: {}, applications: [] },
      items: [],
      companies: [],
    };
  }
  if (path === "/enterprise") return { companies: [], offers: [], claims: [], payments: [], canEdit: false };
  if (path === "/billing") return { mode: "demo", plans: [], payments: [], subscription: null };
  if (path.startsWith("/admin/data")) return { items: [], kpis: {}, counts: [] };
  if (path === "/reputation") return { bySector: [], recent: [], internships: [], atmosphere: [] };
  if (path === "/map") return { items: [], count: 0 };
  return { cities: [], sectors: [], items: [], stats: { companies: 0 }, settings: {} };
}

const results = [];

for (const [page, htmlFile, jsFile, pathname] of PAGES) {
  const html = fs.readFileSync(path.join(PUBLIC, htmlFile), "utf8");
  const { window, document } = parseHTML(html);

  // `select.value` est en lecture seule dans linkedom : on ajoute un setter pour
  // reproduire le comportement d'un navigateur.
  const selectProto = window.HTMLSelectElement?.prototype;
  if (selectProto) {
    const descriptor = Object.getOwnPropertyDescriptor(selectProto, "value");
    if (descriptor && !descriptor.set) {
      Object.defineProperty(selectProto, "value", {
        configurable: true,
        get: descriptor.get,
        set(value) {
          for (const option of this.querySelectorAll("option")) {
            if (option.value === String(value)) option.setAttribute("selected", "");
            else option.removeAttribute("selected");
          }
        },
      });
    }
  }

  const storage = () =>
    new Map();
  const makeStorage = () => {
    const store = storage();
    return {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    };
  };

  globalThis.window = window;
  globalThis.document = document;
  globalThis.location = {
    href: `http://localhost${pathname}`,
    pathname,
    search: "",
    hash: "",
    origin: "http://localhost",
  };
  window.location = globalThis.location;
  globalThis.localStorage = makeStorage();
  globalThis.sessionStorage = makeStorage();
  window.localStorage = globalThis.localStorage;
  window.sessionStorage = globalThis.sessionStorage;
  Object.defineProperty(globalThis, "navigator", {
    value: { language: "fr-FR", onLine: true, userAgent: "smoke" },
    configurable: true,
  });
  globalThis.history = { replaceState() {}, pushState() {} };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  };
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
  };
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.matchMedia = globalThis.matchMedia;
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  globalThis.scrollTo = () => {};
  window.scrollTo = globalThis.scrollTo;
  if (window.Event) globalThis.Event = window.Event;

  globalThis.fetch = async (input) => {
    const url = new URL(String(input), "http://localhost");
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ ok: true, data: payloadFor(url.pathname) }),
      text: async () => "",
    };
  };

  const errors = [];
  const originalWarn = console.warn;
  console.warn = (...args) => errors.push(args.join(" "));

  try {
    const module = await import(`file://${PUBLIC}/assets/js/pages/${jsFile}?smoke=${page}`);
    if (typeof module.init === "function") await module.init({ user: null });
    const missing = errors.filter((message) => message.includes("[i18n] clé manquante"));
    results.push({
      page,
      ok: missing.length === 0,
      message: missing.length ? `${missing.length} clé(s) i18n manquante(s)` : "",
    });
  } catch (error) {
    results.push({ page, ok: false, message: `${error.constructor.name}: ${error.message}` });
  } finally {
    console.warn = originalWarn;
  }
}

console.log("\nCONGLOMERAT — fumée DOM (linkedom)\n");
let failed = 0;
for (const result of results) {
  if (!result.ok) failed += 1;
  console.log(`  ${result.ok ? "✓" : "✗"} ${result.page.padEnd(11)} ${result.message}`);
}
console.log("");
if (failed) {
  console.log(`  ${failed} page(s) en échec.\n`);
  process.exit(1);
}
console.log(`  ${results.length} pages démarrent sans erreur.\n`);
