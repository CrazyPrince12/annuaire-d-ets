/**
 * POST /api/events — statistiques anonymes de contact.
 * { companySlug, kind: "phone_click" | "whatsapp_click" | "site_click" | "direction_click" | "view" }
 * Aucune donnée personnelle, aucune adresse IP conservée.
 */
import { one, query } from "./_lib/db.js";
import { handler, ok, readBody, requireMethod, getIp, rateLimit } from "./_lib/http.js";

const KINDS = ["phone_click", "whatsapp_click", "site_click", "direction_click", "view"];

export default handler(async (req, res) => {
  if (!requireMethod(req, res, "POST")) return;
  const limited = rateLimit(`event:${getIp(req)}`, { max: 120, windowMs: 60_000 });
  if (!limited.allowed) return ok(res, { counted: false });

  const body = await readBody(req);
  const kind = KINDS.includes(body.kind) ? body.kind : "view";
  const company = body.companySlug
    ? await one("SELECT id FROM companies WHERE slug = $1", [String(body.companySlug)])
    : null;
  if (!company) return ok(res, { counted: false });

  try {
    await query("INSERT INTO company_events (company_id, kind) VALUES ($1,$2)", [company.id, kind]);
    if (kind === "view") {
      await query("UPDATE companies SET view_count = view_count + 1 WHERE id = $1", [company.id]);
    }
  } catch {
    return ok(res, { counted: false });
  }
  return ok(res, { counted: true });
});
