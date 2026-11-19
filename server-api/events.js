/** POST /api/events — statistiques anonymes, sans IP enregistrée en base. */
import { one } from "./_lib/db.js";
import { handler, ok, readBody, requireMethod, getIp, rateLimit, HttpError } from "./_lib/http.js";

const kinds = new Set(["phone_click", "whatsapp_click", "site_click", "direction_click", "view"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default handler(async (req, res) => {
  if (!requireMethod(req, res, "POST")) return;
  const limited = rateLimit(`event:${getIp(req)}`, { max: 120, windowMs: 60_000 });
  if (!limited.allowed) return ok(res, { counted: false, accepted: false });

  const { companySlug, kind, eventId } = (await readBody(req)) || {};
  if (!kinds.has(kind) || typeof companySlug !== "string" || !/^[a-z0-9][a-z0-9-]{0,179}$/.test(companySlug) ||
      (eventId !== undefined && (typeof eventId !== "string" || !uuid.test(eventId)))) {
    throw new HttpError(400, "Événement invalide.");
  }
  const result = await one(`
    WITH recorded AS (
      INSERT INTO company_events (id, company_id, kind)
      SELECT COALESCE($3::uuid, gen_random_uuid()), id, $2 FROM companies
      WHERE slug = $1 AND publication_status = 'published' AND deleted_at IS NULL
      ON CONFLICT (id) DO NOTHING
      RETURNING company_id, kind
    ), views AS (
      UPDATE companies c SET view_count = c.view_count + 1 FROM recorded e
      WHERE c.id = e.company_id AND e.kind = 'view'
    )
    SELECT EXISTS (SELECT 1 FROM recorded) AS counted,
      EXISTS (SELECT 1 FROM recorded) OR EXISTS (
        SELECT 1 FROM company_events e JOIN companies c ON c.id = e.company_id
        WHERE e.id = $3::uuid AND e.kind = $2 AND c.slug = $1
      ) AS accepted`, [companySlug, kind, eventId ?? null]);
  return ok(res, result);
});
