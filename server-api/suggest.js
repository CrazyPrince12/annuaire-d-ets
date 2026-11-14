/** GET /api/suggest?q=… — suggestions de recherche groupées. */
import { handler, ok, requireMethod } from "./_lib/http.js";
import { suggest } from "./_lib/repo.js";

export default handler(async (req, res) => {
  if (!requireMethod(req, res, "GET")) return;
  const q = String(req.query.q || "").slice(0, 80);
  const data = await suggest(q);
  res.setHeader("Cache-Control", "public, max-age=30, s-maxage=120");
  return ok(res, { q, ...data });
});
