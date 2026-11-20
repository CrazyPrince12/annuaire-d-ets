/**
 * POST /api/events — statistiques anonymes de contact.
 * { companySlug, kind: "phone_click" | "whatsapp_click" | "site_click" | "direction_click" | "view" }
 * Aucune donnée personnelle, aucune adresse IP conservée.
 *
 * Ces statistiques ne doivent JAMAIS produire d'erreur visible : toute panne de
 * base est avalée (`counted: false`). L'identifiant de l'entreprise est mis en
 * cache 10 min pour éviter une requête SQL à chaque envoi.
 */
import { one, query } from "./_lib/db.js";
import { handler, ok, readBody, requireMethod, getIp, rateLimit } from "./_lib/http.js";

const KINDS = ["phone_click", "whatsapp_click", "site_click", "direction_click", "view"];
const ID_TTL_MS = 10 * 60_000;
const ID_CACHE_MAX = 500;
const idCache = new Map();

async function companyId(slug) {
  const hit = idCache.get(slug);
  if (hit && hit.expires > Date.now()) return hit.id;
  const row = await one("SELECT id FROM companies WHERE slug = $1", [slug]);
  if (!row) return null;
  if (idCache.size >= ID_CACHE_MAX) idCache.delete(idCache.keys().next().value);
  idCache.set(slug, { id: row.id, expires: Date.now() + ID_TTL_MS });
  return row.id;
}

export default handler(async (req, res) => {
  if (!requireMethod(req, res, "POST")) return;
  const limited = rateLimit(`event:${getIp(req)}`, { max: 120, windowMs: 60_000 });
  if (!limited.allowed) return ok(res, { counted: false });

  const body = await readBody(req);
  const kind = KINDS.includes(body.kind) ? body.kind : "view";
  const slug = String(body.companySlug || "").trim().slice(0, 160);
  if (!slug) return ok(res, { counted: false });

  try {
    const id = await companyId(slug);
    if (!id) return ok(res, { counted: false });
    const writes = [query("INSERT INTO company_events (company_id, kind) VALUES ($1,$2)", [id, kind])];
    if (kind === "view") {
      writes.push(query("UPDATE companies SET view_count = view_count + 1 WHERE id = $1", [id]));
    }
    await Promise.all(writes);
  } catch (error) {
    console.warn("[events] statistique ignorée :", error?.code || error?.message);
    return ok(res, { counted: false });
  }
  return ok(res, { counted: true });
});
