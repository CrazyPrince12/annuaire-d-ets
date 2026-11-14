/** GET /api/health — état de la base et du mode d'exécution. */
import { healthCheck, isDemoDatabase } from "./_lib/db.js";
import { handler, ok, requireMethod } from "./_lib/http.js";

export default handler(async (req, res) => {
  if (!requireMethod(req, res, "GET")) return;
  const health = await healthCheck();
  return ok(res, {
    status: health.ok ? "ok" : "degraded",
    database: health.mode,
    demo: isDemoDatabase(),
    companies: health.companies ?? 0,
    error: health.error || null,
    time: new Date().toISOString(),
  });
});
