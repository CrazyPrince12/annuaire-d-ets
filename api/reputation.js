/** GET /api/reputation — classements et avis récents pour le hub /avis. */
import { handler, ok, requireMethod } from "./_lib/http.js";
import { reputationData } from "./_lib/repo.js";

export default handler(async (req, res) => {
  if (!requireMethod(req, res, "GET")) return;
  const data = await reputationData();
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
  return ok(res, data);
});
