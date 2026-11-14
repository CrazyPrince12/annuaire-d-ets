/**
 * GET /api/og?slug=cabinet-ekombo — image de partage 1200×630.
 *
 * L'image est générée en SVG : pas de dépendance binaire, un rendu net à toutes
 * les tailles et un poids de quelques kilo-octets. Les réseaux qui n'acceptent
 * que le PNG (WhatsApp, Facebook) retombent sur `og-default.jpg`, déclaré dans
 * les balises `og:image` des pages.
 */

import { one } from "./_lib/db.js";
import { handler } from "./_lib/http.js";
import { SITE } from "./_lib/site.js";

const WIDTH = 1200;
const HEIGHT = 630;

const GREEN = "#22C07A";
const YELLOW = "#FFC83D";
const BG = "#0B1310";
const INK = "#EAF3EE";
const MUTED = "#9DB2A8";

function xml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Découpe un texte en lignes d'environ `max` caractères, sans couper les mots. */
function wrap(text, max = 24, limit = 3) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > max && line) {
      lines.push(line);
      line = word;
      if (lines.length === limit) break;
    } else {
      line = candidate;
    }
  }
  if (lines.length < limit && line) lines.push(line);
  if (lines.length === limit && words.join(" ").length > lines.join(" ").length) {
    lines[limit - 1] = `${lines[limit - 1].replace(/[,;:]$/, "")}…`;
  }
  return lines;
}

function stars(rating) {
  if (!rating) return "";
  const full = Math.round(Number(rating));
  return Array.from({ length: 5 }, (_, index) =>
    `<path d="M12 2.4l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.3 6.1 20.4l1.2-6.5L2.5 9.3l6.6-.9z"
       transform="translate(${index * 34} 0) scale(1.05)"
       fill="${index < full ? YELLOW : "rgba(255,255,255,.14)"}" />`
  ).join("");
}

function build({ name, subtitle, badge, rating }) {
  const lines = wrap(name, 22, 3);
  const titleY = lines.length > 2 ? 250 : 280;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"
     viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img"
     aria-label="${xml(name)} — ${xml(subtitle)}">
  <defs>
    <linearGradient id="glow" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${GREEN}" stop-opacity=".34" />
      <stop offset=".55" stop-color="${GREEN}" stop-opacity="0" />
    </linearGradient>
    <linearGradient id="arc" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#3FE39A" />
      <stop offset=".55" stop-color="${GREEN}" />
      <stop offset="1" stop-color="#0B8F55" />
    </linearGradient>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="${BG}" />
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)" />
  <g opacity=".08" stroke="${INK}" stroke-width="1">
    ${Array.from({ length: 14 }, (_, index) => `<line x1="${index * 90}" y1="0" x2="${index * 90 - 120}" y2="${HEIGHT}" />`).join("")}
  </g>

  <g transform="translate(72 64)">
    <path d="M4 30a26 26 0 0 1 52 0" fill="none" stroke="url(#arc)" stroke-width="9" stroke-linecap="round" />
    <circle cx="56" cy="8" r="6" fill="${YELLOW}" />
    <text x="72" y="34" font-family="Manrope, Inter, sans-serif" font-size="26" font-weight="800"
          letter-spacing="4" fill="${INK}">CONGLOMERAT</text>
  </g>

  <g font-family="Manrope, Inter, sans-serif">
    ${lines
      .map(
        (line, index) =>
          `<text x="72" y="${titleY + index * 84}" font-size="76" font-weight="800"
             letter-spacing="-2" fill="${INK}">${xml(line)}</text>`
      )
      .join("\n    ")}
  </g>

  <text x="72" y="${titleY + lines.length * 84 + 24}" font-family="Inter, sans-serif"
        font-size="30" fill="${MUTED}">${xml(subtitle)}</text>

  ${
    badge
      ? `<g transform="translate(72 ${HEIGHT - 132})">
          <rect width="${Math.max(220, badge.length * 17 + 56)}" height="56" rx="28"
                fill="rgba(34,192,122,.12)" stroke="rgba(34,192,122,.45)" />
          <text x="28" y="36" font-family="Inter, sans-serif" font-size="24" font-weight="600"
                fill="${GREEN}">${xml(badge)}</text>
        </g>`
      : ""
  }

  ${
    rating
      ? `<g transform="translate(72 ${HEIGHT - 62})">${stars(rating)}
          <text x="196" y="24" font-family="Inter, sans-serif" font-size="24" fill="${MUTED}">
            ${xml(Number(rating).toFixed(1))} / 5
          </text>
        </g>`
      : ""
  }

  <text x="${WIDTH - 72}" y="${HEIGHT - 40}" text-anchor="end" font-family="Inter, sans-serif"
        font-size="22" fill="rgba(157,178,168,.75)">${xml(SITE.url.replace(/^https?:\/\//, ""))}</text>
</svg>`;
}

export default handler(async (req, res) => {
  const url = new URL(req.url, SITE.url);
  const slug = String(req.query.slug || url.searchParams.get("slug") || "").slice(0, 120);

  let name = "L'annuaire des entreprises du Cameroun";
  let subtitle = "Coordonnées vérifiées · Avis modérés · Offres d'emploi";
  let badge = "conglomerat.cm";
  let rating = 0;

  if (slug) {
    const company = await one(
      `SELECT c.name, c.rating_avg, c.rating_count, c.verification_level,
              ci.name AS city_name, s.name AS sector_name
       FROM companies c
       LEFT JOIN cities ci ON ci.id = c.city_id
       LEFT JOIN company_sectors cs ON cs.company_id = c.id AND cs.is_primary = TRUE
       LEFT JOIN sectors s ON s.id = cs.sector_id
       WHERE c.slug = $1 AND c.publication_status = 'published' AND c.deleted_at IS NULL`,
      [slug]
    );
    if (company) {
      name = company.name;
      subtitle = [company.sector_name, company.city_name].filter(Boolean).join(" · ") || subtitle;
      if (company.verification_level > 0) badge = "Entreprise vérifiée";
      else if (company.rating_count > 0) badge = `${company.rating_count} avis`;
      rating = company.rating_count > 0 ? Number(company.rating_avg) : 0;
    } else {
      name = "Entreprise introuvable";
      subtitle = "Cette fiche n'existe pas ou n'est plus publiée.";
      badge = "conglomerat.cm";
    }
  } else if (req.query.title) {
    name = String(req.query.title).slice(0, 90);
    subtitle = String(req.query.subtitle || subtitle).slice(0, 90);
  }

  const svg = build({ name, subtitle, badge, rating });
  res.statusCode = 200;
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400");
  res.end(svg);
});
