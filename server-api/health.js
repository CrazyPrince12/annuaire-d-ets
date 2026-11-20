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
    latencyMs: health.latencyMs ?? null,
    bootstrap: health.bootstrap ?? "idle",
    error: health.error || null,
    hint: health.ok
      ? null
      : "Vérifiez DATABASE_URL (chaîne Neon complète), puis lancez « npm run db:init » si la base est vide.",
    time: new Date().toISOString(),
  });
});
