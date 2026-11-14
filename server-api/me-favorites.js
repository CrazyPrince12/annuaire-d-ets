/**
 * GET    /api/me-favorites          → entreprises et offres enregistrées
 * POST   /api/me-favorites          → ajoute { type: "company"|"job", slug|id }
 * DELETE /api/me-favorites          → retire { type, id }
 *
 * Les favoris d'un visiteur vivent dans localStorage ; à la connexion, le
 * front propose de les synchroniser en appelant POST pour chacun.
 */
import { query, one } from "./_lib/db.js";
import { requireUser } from "./_lib/auth.js";
import { handler, ok, readBody, requireMethod, HttpError } from "./_lib/http.js";
import { companiesByIds, offersByIds } from "./_lib/repo.js";

async function resolveTarget(type, slug, id) {
  if (type === "company") {
    const row = id
      ? await one("SELECT id FROM companies WHERE id = $1", [id])
      : await one("SELECT id FROM companies WHERE slug = $1", [slug]);
    if (!row) throw new HttpError(404, "Entreprise introuvable.");
    return row.id;
  }
  if (type === "job") {
    const row = id
      ? await one("SELECT id FROM job_offers WHERE id = $1", [id])
      : await one("SELECT id FROM job_offers WHERE slug = $1", [slug]);
    if (!row) throw new HttpError(404, "Offre introuvable.");
    return row.id;
  }
  throw new HttpError(400, "Type de favori inconnu.");
}

export default handler(async (req, res) => {
  const user = await requireUser(req);

  if (req.method === "GET") {
    const rows = await query(
      "SELECT target_type, target_id FROM favorites WHERE user_id = $1 ORDER BY created_at DESC",
      [user.id]
    );
    const companyIds = rows.filter((row) => row.target_type === "company").map((row) => row.target_id);
    const jobIds = rows.filter((row) => row.target_type === "job").map((row) => row.target_id);
    return ok(res, {
      companies: await companiesByIds(companyIds),
      offers: await offersByIds(jobIds),
      total: rows.length,
    });
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    const type = body.type === "job" ? "job" : "company";
    const targetId = await resolveTarget(type, body.slug, body.id);
    await query(
      `INSERT INTO favorites (user_id, target_type, target_id) VALUES ($1,$2,$3)
       ON CONFLICT DO NOTHING`,
      [user.id, type, targetId]
    );
    const total = await one("SELECT COUNT(*)::int AS total FROM favorites WHERE user_id = $1", [user.id]);
    return ok(res, { id: targetId, type, total: total.total, message: "Ajouté à vos favoris." });
  }

  if (req.method === "DELETE") {
    const body = await readBody(req);
    const type = body.type === "job" ? "job" : "company";
    const targetId = await resolveTarget(type, body.slug, body.id);
    await query("DELETE FROM favorites WHERE user_id = $1 AND target_type = $2 AND target_id = $3", [
      user.id,
      type,
      targetId,
    ]);
    return ok(res, { id: targetId, type, message: "Retiré de vos favoris." });
  }

  if (!requireMethod(req, res, ["GET", "POST", "DELETE"])) return;
});
