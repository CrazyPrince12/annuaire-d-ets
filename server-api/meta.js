/**
 * GET /api/meta — référentiels publics : villes, quartiers, secteurs, chiffres,
 * réglages utilisables par le front (aucune donnée sensible).
 * La réponse est mise en cache 5 minutes côté navigateur et côté CDN.
 */
import { handler, ok, requireMethod } from "./_lib/http.js";
import { metaData } from "./_lib/repo.js";

export default handler(async (req, res) => {
  if (!requireMethod(req, res, "GET")) return;
  const data = await metaData();
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
  return ok(res, data);
});
