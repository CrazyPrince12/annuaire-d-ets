/**
 * GET /sitemap.xml — plan du site généré depuis la base.
 * Les fiches suspendues ou non publiées ne sont jamais listées.
 */
import { query } from "./_lib/db.js";
import { handler, publicOrigin, requireMethod } from "./_lib/http.js";

const STATIC_PAGES = [
  ["/", "1.0", "daily"],
  ["/explorer", "0.9", "daily"],
  ["/carte", "0.8", "weekly"],
  ["/offres", "0.9", "daily"],
  ["/stages", "0.8", "daily"],
  ["/avis", "0.7", "weekly"],
  ["/villes", "0.7", "weekly"],
  ["/secteurs", "0.7", "weekly"],
  ["/comparer", "0.4", "monthly"],
  ["/contribuer", "0.5", "monthly"],
  ["/premium", "0.4", "monthly"],
  ["/plan-du-site", "0.2", "yearly"],
  ["/a-propos", "0.4", "monthly"],
  ["/aide", "0.4", "monthly"],
  ["/charte-des-avis", "0.3", "yearly"],
  ["/contact", "0.3", "yearly"],
  ["/mentions-legales", "0.2", "yearly"],
  ["/confidentialite", "0.2", "yearly"],
  ["/conditions", "0.2", "yearly"],
];

const escapeXml = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export default handler(async (req, res) => {
  if (!requireMethod(req, res, "GET")) return;
  const origin = publicOrigin(req);

  const [companies, offers, cities, sectors] = await Promise.all([
    query(
      `SELECT slug, updated_at FROM companies
       WHERE publication_status='published' AND deleted_at IS NULL ORDER BY updated_at DESC`
    ),
    query(
      `SELECT o.slug, o.updated_at FROM job_offers o JOIN companies c ON c.id = o.company_id
       WHERE o.status='published' AND c.publication_status='published'
       ORDER BY o.published_at DESC LIMIT 2000`
    ),
    query("SELECT slug FROM cities WHERE is_active = TRUE"),
    query(
      `SELECT s.slug FROM sectors s WHERE s.is_active = TRUE AND EXISTS (
         SELECT 1 FROM company_sectors cs JOIN companies c ON c.id = cs.company_id
         WHERE cs.sector_id = s.id AND c.publication_status='published'
       )`
    ),
  ]);

  const url = (path, priority = "0.6", changefreq = "weekly", lastmod) =>
    `  <url><loc>${escapeXml(origin + path)}</loc>${
      lastmod ? `<lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>` : ""
    }<changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...STATIC_PAGES.map(([path, priority, freq]) => url(path, priority, freq)),
    ...cities.map((city) => url(`/villes/${city.slug}`, "0.7")),
    ...sectors.map((sector) => url(`/secteurs/${sector.slug}`, "0.7")),
    ...companies.map((company) => url(`/entreprises/${company.slug}`, "0.8", "weekly", company.updated_at)),
    ...offers.map((offer) => url(`/offres/${offer.slug}`, "0.6", "weekly", offer.updated_at)),
    "</urlset>",
  ].join("\n");

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
  res.end(body);
});
