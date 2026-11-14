/**
 * Suivi des candidatures (kanban / liste).
 * GET / POST / PATCH / DELETE sur /api/me-trackers
 */
import { one, query } from "./_lib/db.js";
import { requireUser } from "./_lib/auth.js";
import { handler, ok, readBody, requireMethod, HttpError } from "./_lib/http.js";
import { optionalString } from "./_lib/validate.js";

const STATUSES = ["to_review", "prepared", "sent", "waiting", "interview", "accepted", "rejected"];

export default handler(async (req, res) => {
  const user = await requireUser(req);

  if (req.method === "GET") {
    const rows = await query(
      `SELECT t.id, t.status, t.note, t.remind_at, t.free_label, t.created_at,
              c.slug AS company_slug, c.name AS company_name,
              o.slug AS offer_slug, o.title AS offer_title, o.contract_type
       FROM user_trackers t
       LEFT JOIN companies c ON c.id = t.company_id
       LEFT JOIN job_offers o ON o.id = t.job_offer_id
       WHERE t.user_id = $1 ORDER BY t.updated_at DESC`,
      [user.id]
    );
    return ok(res, { items: rows, statuses: STATUSES });
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    const status = STATUSES.includes(body.status) ? body.status : "to_review";
    const freeLabel = optionalString(body.freeLabel, { max: 120 });
    let companyId = null;
    let offerId = null;

    if (body.companySlug) {
      const company = await one("SELECT id FROM companies WHERE slug = $1", [body.companySlug]);
      if (!company) throw new HttpError(404, "Entreprise introuvable.");
      companyId = company.id;
    }
    if (body.offerSlug) {
      const offer = await one("SELECT id, company_id FROM job_offers WHERE slug = $1", [body.offerSlug]);
      if (!offer) throw new HttpError(404, "Offre introuvable.");
      offerId = offer.id;
      companyId = companyId || offer.company_id;
    }
    if (!companyId && !offerId && !freeLabel) {
      throw new HttpError(400, "Indiquez une entreprise, une offre ou un intitulé libre.");
    }

    const rows = await query(
      `INSERT INTO user_trackers (user_id, company_id, job_offer_id, free_label, status, note, remind_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [
        user.id,
        companyId,
        offerId,
        freeLabel,
        status,
        optionalString(body.note, { max: 500 }),
        body.remindAt || null,
      ]
    );
    return ok(res, { id: rows[0].id, message: "Démarche ajoutée à votre suivi." }, 201);
  }

  if (req.method === "PATCH") {
    const body = await readBody(req);
    if (!body.id) throw new HttpError(400, "Identifiant manquant.");
    const status = STATUSES.includes(body.status) ? body.status : null;
    const rows = await query(
      `UPDATE user_trackers SET
         status = COALESCE($3, status),
         note = COALESCE($4, note),
         remind_at = COALESCE($5, remind_at),
         updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id, status`,
      [body.id, user.id, status, body.note === undefined ? null : optionalString(body.note, { max: 500 }), body.remindAt || null]
    );
    if (!rows.length) throw new HttpError(404, "Démarche introuvable.");
    return ok(res, rows[0]);
  }

  if (req.method === "DELETE") {
    const body = await readBody(req);
    if (!body.id) throw new HttpError(400, "Identifiant manquant.");
    await query("DELETE FROM user_trackers WHERE id = $1 AND user_id = $2", [body.id, user.id]);
    return ok(res, { message: "Démarche supprimée." });
  }

  if (!requireMethod(req, res, ["GET", "POST", "PATCH", "DELETE"])) return;
});
