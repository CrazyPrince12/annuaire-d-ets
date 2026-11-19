/**
 * CONFIGURATION GLOBALE — source de vérité unique.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  POUR RENOMMER LE SITE : modifier UNIQUEMENT `SITE_NAME` ci-dessous.
 *  Tout le reste (HTML, JS, API, e-mails, sitemap, llms.txt, balises meta,
 *  manifeste PWA, données de démonstration) lit cette constante.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Ce module est chargé par le navigateur ET par les fonctions serverless
 * (`api/_lib/site.js` le ré-exporte) : il ne doit donc contenir aucune API
 * propre au navigateur ni au serveur.
 */

export const SITE_NAME = "CONGLOMERAT";

/** Identité éditoriale. */
export const SITE = {
  name: SITE_NAME,
  /** Slogan (FR). La version EN vit dans `i18n.js`. */
  tagline: "L'annuaire des entreprises du Cameroun",
  description:
    "Trouvez les entreprises camerounaises qui font le travail : coordonnées vérifiées, avis authentiques, horaires, itinéraires et offres d'emploi — à Yaoundé, Douala et Bafoussam.",
  /** Domaine de production (sitemap, canoniques, OG). */
  url: "https://conglomerat.cm",
  locale: "fr-CM",
  langs: ["fr", "en"],
  defaultLang: "fr",
  /** Coordonnées de l'équipe (affichées, non simulées). */
  email: "bonjour@conglomerat.cm",
  supportEmail: "support@conglomerat.cm",
  phone: "+237 6 90 00 00 00",
  whatsapp: "+237 6 90 00 00 00",
  address: {
    street: "Rue 1.234, Bastos",
    city: "Yaoundé",
    region: "Centre",
    country: "Cameroun",
    postal: "BP 1234",
  },
  social: {
    facebook: "https://facebook.com/",
    linkedin: "https://linkedin.com/",
    x: "https://x.com/",
    instagram: "https://instagram.com/",
  },
  /** Villes de lancement. */
  cities: [
    { slug: "yaounde", name: "Yaoundé" },
    { slug: "douala", name: "Douala" },
    { slug: "bafoussam", name: "Bafoussam" },
  ],
  /** Année de lancement (pied de page, JSON-LD). */
  since: 2026,
  themeColor: "#0B1310",
  themeColorLight: "#F6F8F7",
};

/** Réglages de l'interface (pagination, quotas d'affichage, timings). */
export const UI = {
  pageSize: 12,
  suggestDebounce: 180,
  searchMinChars: 2,
  toastDuration: 4200,
  /** Favoris + comparateur stockés en local (aucun compte requis). */
  maxCompare: 4,
  maxRecentSearches: 6,
  revealThreshold: 0.15,
  /** Passerelles d'écriture prévues (voir DECISIONS.md). */
  mapStyle: "https://tiles.openfreemap.org/styles/liberty",
  mapMaxZoom: 18,
  mapHome: { lng: 11.2, lat: 4.6, zoom: 6.4 },
};

/** Drapeaux de fonctionnalités (désactiver une brique sans toucher au code). */
export const FEATURES = {
  maps: true,
  three: true, // maquette WebGL chargée uniquement sur demande
  serviceWorker: true,
  analytics: false, // aucun traceur tiers par défaut
  paymentsDemo: true,
};

/** Palette exposée aux scripts (tuiles de secteurs, marqueurs, OG). */
export const PALETTE = {
  primary: "#22C07A",
  primaryDark: "#3FE39A",
  accent: "#FFC83D",
  danger: "#F2574F",
  info: "#4EA8FF",
};

export default { SITE_NAME, SITE, UI, FEATURES, PALETTE };
