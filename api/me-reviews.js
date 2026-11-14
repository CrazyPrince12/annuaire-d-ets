/** GET /api/me-reviews — mes avis, tous statuts confondus. */
import { query } from "./_lib/db.js";
import { requireUser } from "./_lib/auth.js";
import { handler, ok, requireMethod } from "./_lib/http.js";

export default handler(async (req, res) => {
  if (!requireMethod(req, res, "GET")) return;
  const user = await requireUser(req);
  const rows = await query(
    `SELECT r.id, r.relationship, r.period_label, r.rating_overall, r.title, r.pros, r.cons,
            r.advice, r.status, r.decision_reason, r.verified_experience, r.helpful_count,
            r.created_at, r.published_at, c.slug AS company_slug, c.name AS company_name
     FROM reviews r JOIN companies c ON c.id = r.company_id
     WHERE r.user_id = $1 ORDER BY r.created_at DESC`,
    [user.id]
  );
  return ok(res, { items: rows });
});
