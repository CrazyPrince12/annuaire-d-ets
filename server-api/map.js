/**
 * GET /api/map — entreprises géolocalisées dans une zone visible.
 * Paramètres : bbox=minLng,minLat,maxLng,maxLat + les filtres habituels.
 * Plafond de 300 marqueurs (le regroupement visuel est fait côté client).
 */
import { handler, ok, parseFilters, requireMethod } from "./_lib/http.js";
import { mapCompanies } from "./_lib/repo.js";

export default handler(async (req, res) => {
  if (!requireMethod(req, res, "GET")) return;
  const filters = parseFilters(req.query);
  const rawBbox = String(req.query.bbox || "");
  const bbox = rawBbox
    ? rawBbox.split(",").map((value) => Number(value.trim()))
    : null;

  const items = await mapCompanies(filters, bbox);
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
  return ok(res, { items, count: items.length });
});
