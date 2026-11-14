/**
 * Génère `public/assets/js/core/icons.js` à partir de `lucide-static`.
 *
 * Les icônes sont inlinées en SVG (aucune requête réseau, colorables par
 * `currentColor`, compatibles avec le CSP de Vercel). On n'embarque que les
 * icônes réellement utilisées par l'interface : le bundle reste léger.
 *
 *   npm run icons
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const LUCIDE = path.join(ROOT, "node_modules/lucide-static/icons");

/** Icônes utilisées par l'interface (nom Lucide → clé applicative). */
const USED = [
  // navigation & structure
  "house", "search", "map-pin", "map", "compass", "menu", "x", "chevron-right",
  "chevron-left", "chevron-down", "chevron-up", "arrow-right", "arrow-left",
  "arrow-up-right", "external-link", "arrow-up-down", "move-right",
  // thème & langue
  "sun", "moon", "monitor", "globe", "languages",
  // entreprises & secteurs
  "building-2", "building", "cpu", "landmark", "calculator", "store", "factory",
  "hard-hat", "heart-pulse", "truck", "sprout", "graduation-cap", "utensils",
  "heart-handshake", "megaphone", "wrench", "briefcase", "scale", "hotel",
  "palette", "car", "plane", "leaf", "tag", "map-pinned", "badge-percent",
  // confiance
  "badge-check", "star", "star-half", "shield-check", "shield", "award",
  "circle-check", "check", "check-check", "circle-x", "alert-triangle",
  "info", "flag", "thumbs-up", "message-square-quote", "quote",
  // formulaires & actions
  "plus", "minus", "trash-2", "pencil", "pencil-line", "copy", "link", "share-2",
  "heart", "bookmark", "bell", "send", "upload", "download", "filter",
  "sliders-horizontal", "settings", "log-out", "lock", "mail", "phone",
  "eye", "eye-off", "loader", "rotate-ccw", "calendar", "clock", "wallet",
  "credit-card", "smartphone", "receipt", "chart-no-axes-column",
  // vues
  "layout-grid", "list", "table-2", "layers", "navigation",
  "crosshair", "maximize-2", "minimize-2", "route",
  // espace pro & admin
  "users", "user", "user-check", "file-text", "folder-tree", "inbox",
  "gauge", "trending-up", "message-circle", "messages-square",
  // divers
  "sparkles", "zap", "rocket", "target", "lightbulb", "help-circle",
  "book-open", "file-badge", "clapperboard", "circle-alert",
];

/** Icônes de marque (absentes de Lucide) — tracés simples, 24×24. */
const BRAND = {
  whatsapp:
    '<path fill="currentColor" stroke="none" d="M12.04 2C6.6 2 2.2 6.4 2.2 11.84c0 1.74.46 3.44 1.32 4.94L2 22l5.36-1.4a9.86 9.86 0 0 0 4.68 1.2h.01c5.43 0 9.84-4.4 9.84-9.84C21.89 6.4 17.48 2 12.04 2Zm5.76 14.06c-.24.68-1.42 1.3-1.96 1.34-.54.04-1.02.24-3.46-.72-2.94-1.16-4.78-4.2-4.92-4.4-.14-.2-1.16-1.54-1.16-2.94 0-1.4.74-2.08 1-2.38.26-.3.56-.36.74-.36.18 0 .36 0 .52.02.18 0 .42-.06.64.48.24.58.8 2 .86 2.14.06.14.1.3.02.48-.08.18-.16.3-.3.46-.14.16-.3.36-.42.48-.14.14-.28.3-.12.58.16.28.72 1.18 1.54 1.92 1.06.94 1.9 1.24 2.18 1.38.28.14.44.12.6-.06.16-.18.7-.8.88-1.08.18-.28.36-.22.6-.14.24.08 1.54.72 1.8.86.26.14.44.2.5.32.06.12.06.7-.18 1.38Z"/>',
  linkedin:
    '<path fill="currentColor" stroke="none" d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.05a4.2 4.2 0 0 1 3.75-2.05c4 0 4.4 2.6 4.4 6V21h-4v-5.6c0-1.35-.03-3.1-1.9-3.1-1.9 0-2.2 1.47-2.2 3v5.7h-4V9Z"/>',
  instagram:
    '<rect width="20" height="20" x="2" y="2" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37Z" /><line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />',
  facebook:
    '<path fill="currentColor" stroke="none" d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h3l1-3h-4v-2c0-.55.45-1 1-1Z"/>',
  x: '<path fill="currentColor" stroke="none" d="M17.5 3h2.9l-6.35 7.26L21.5 21h-5.8l-4.55-5.94L5.9 21H3l6.8-7.77L2.7 3h5.95l4.1 5.42L17.5 3Zm-1.02 16.2h1.6L7.6 4.72H5.9l10.58 14.48Z"/>',
  google:
    '<path fill="currentColor" stroke="none" d="M21.6 12.23c0-.72-.06-1.24-.19-1.79H12v3.24h5.5c-.11.9-.71 2.25-2.04 3.16l-.02.13 2.96 2.29.2.02c1.88-1.74 2.96-4.3 2.96-7.05ZM12 21.6c2.7 0 4.96-.89 6.6-2.42l-3.15-2.44c-.84.59-1.98 1-3.45 1a5.98 5.98 0 0 1-5.66-4.14l-.12.01-3.06 2.37-.04.12A10.4 10.4 0 0 0 12 21.6ZM6.34 13.6a6.4 6.4 0 0 1-.35-2.05c0-.71.13-1.4.34-2.05l-.01-.14L3.2 6.96l-.1.05A10.4 10.4 0 0 0 2 11.55c0 1.65.4 3.2 1.1 4.55l3.24-2.5Zm5.66-8.73c1.83 0 3.06.79 3.77 1.45l2.75-2.68C16.95 1.87 14.7 1 12 1A10.4 10.4 0 0 0 3.1 6.9l3.24 2.5A5.99 5.99 0 0 1 12 4.87Z"/>',
};

function keyOf(name) {
  return name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

const out = {};
const missing = [];
for (const name of USED) {
  const file = path.join(LUCIDE, `${name}.svg`);
  if (!existsSync(file)) {
    missing.push(name);
    continue;
  }
  const svg = await readFile(file, "utf8");
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>[\s\S]*$/, "").trim();
  // On normalise les guillemets et on compresse les espaces.
  out[keyOf(name)] = inner.replace(/\s{2,}/g, " ").replace(/>\s+</g, "><");
}
for (const [name, inner] of Object.entries(BRAND)) out[keyOf(name)] = inner;

const names = Object.keys(out).sort();
const body = names.map((k) => `  ${/^[a-z][A-Za-z0-9]*$/.test(k) ? k : JSON.stringify(k)}:\n    '${out[k].replace(/'/g, "\\'")}',`).join("\n");

const header = `/**
 * Icônes SVG (Lucide, licence ISC + quelques marques dessinées à la main).
 * FICHIER GÉNÉRÉ — ne pas modifier à la main : lancer \`npm run icons\`.
 * ${names.length} icônes, ${(Buffer.byteLength(body) / 1024).toFixed(1)} Ko.
 */
export const ICONS = {
${body}
};

const TEMPLATE = (inner, size, cls, extra) =>
  \`<svg xmlns="http://www.w3.org/2000/svg" width="\${size}" height="\${size}" viewBox="0 0 24 24"\` +
  \` fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"\` +
  \` stroke-linejoin="round" class="icon\${cls ? " " + cls : ""}" aria-hidden="true"\` +
  \` focusable="false"\${extra || ""}>\${inner}</svg>\`;

/**
 * Retourne le balisage SVG d'une icône.
 * @param {string} name clé camelCase (« mapPin ») ou kebab-case (« map-pin »)
 * @param {{size?: number, class?: string, title?: string}} [opts]
 */
export function icon(name, opts = {}) {
  const key = /-/.test(name) ? name.replace(/-(.)/g, (_, c) => c.toUpperCase()) : name;
  const inner = ICONS[key];
  if (!inner) {
    if (typeof console !== "undefined") console.warn("[icons] icône inconnue:", name);
    return "";
  }
  const size = opts.size || 20;
  const titleId = opts.title ? \`t-\${key}-\${Math.random().toString(36).slice(2, 8)}\` : "";
  const extra = opts.title ? \` role="img" aria-labelledby="\${titleId}"\` : "";
  const svg = TEMPLATE(inner, size, opts.class, extra);
  return opts.title
    ? svg.replace(">", \`><title id="\${titleId}">\${opts.title}</title>\`)
    : svg;
}

/** Liste des clés disponibles (utile pour les tests). */
export const ICON_NAMES = Object.keys(ICONS);
`;

const target = path.join(ROOT, "public/assets/js/core/icons.js");
await writeFile(target, header, "utf8");
console.log(
  `icons.js : ${names.length} icônes, ${(Buffer.byteLength(header) / 1024).toFixed(1)} Ko` +
    (missing.length ? `\nabsentes de lucide-static : ${missing.join(", ")}` : "")
);
