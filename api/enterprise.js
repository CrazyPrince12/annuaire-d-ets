/**
 * Espace entreprise — /api/enterprise
 *
 * GET    → mes fiches (droits vérifiés), leurs statistiques, mes offres,
 *          mes demandes de revendication et mes paiements.
 * PATCH  → mise à jour d'une fiche que je représente (profil, contacts,
 *          horaires, adresse) : les changements sensibles passent en modération.
 * POST   → { action: "offer.create" | "offer.update" | "offer.close" }
 *
 * Règle de sécurité : l'appartenance est vérifiée à chaque appel via
 * `company_members` (rôles owner/editor pour écrire, recruiter pour les offres).
 */
import { one, query } from "./_lib/db.js";
import { requireUser, logAudit } from "./_lib/auth.js";
import { handler, ok, readBody, requireMethod, HttpError } from "./_lib/http.js";
import { optionalString, requireOneOf, requireString, CONTRACT_TYPES } from "./_lib/validate.js";
import { normalizeCameroonPhone, slugify } from "./_lib/text.js";

const WRITE_ROLES = ["owner", "editor"];
const OFFER_ROLES = ["owner", "editor", "recruiter"];

async function membership(userId, companySlug) {
  const row = await one(
    `SELECT c.id, c.slug, c.name, m.role
     FROM company_members m JOIN companies c ON c.id = m.company_id
     WHERE m.user_id = $1 AND c.slug = $2 AND c.deleted_at IS NULL`,
    [userId, companySlug]
  );
  if (!row) throw new HttpError(403, "Vous ne représentez pas cette entreprise.");
  return row;
}

function requireRole(member, roles) {
  if (!roles.includes(member.role)) {
    throw new HttpError(403, "Votre rôle sur cette fiche ne permet pas cette action.");
  }
}

async function dashboard(user) {
  const companies = await query(
    `SELECT c.id, c.slug, c.name, c.description_short, c.publication_status,
            c.verification_level, c.rating_avg, c.rating_count, c.view_count,
            m.role, ci.name AS city_name, s.name AS sector_name, s.color AS sector_color,
            (SELECT COUNT(*)::int FROM job_offers o
               WHERE o.company_id = c.id AND o.status = 'published') AS offers_published,
            (SELECT COUNT(*)::int FROM reviews r
               WHERE r.company_id = c.id AND r.status = 'published') AS reviews_published,
            (SELECT COUNT(*)::int FROM company_events e
               WHERE e.company_id = c.id AND e.kind = 'view' AND e.created_at > NOW() - INTERVAL '30 days') AS views_30d,
            (SELECT COUNT(*)::int FROM company_events e
               WHERE e.company_id = c.id AND e.kind = 'phone_click') AS phone_clicks,
            (SELECT COUNT(*)::int FROM company_events e
               WHERE e.company_id = c.id AND e.kind = 'direction_click') AS direction_clicks
     FROM company_members m
     JOIN companies c ON c.id = m.company_id
     LEFT JOIN cities ci ON ci.id = c.city_id
     LEFT JOIN company_sectors cs ON cs.company_id = c.id AND cs.is_primary = TRUE
     LEFT JOIN sectors s ON s.id = cs.sector_id
     WHERE m.user_id = $1 AND c.deleted_at IS NULL
     ORDER BY c.name`,
    [user.id]
  );

  const companyIds = companies.map((row) => row.id);
  const offers = companyIds.length
    ? await query(
        `SELECT o.id, o.slug, o.title, o.contract_type, o.status, o.published_at, o.deadline_at,
                c.slug AS company_slug, c.name AS company_name,
                (SELECT COUNT(*)::int FROM applications a WHERE a.job_offer_id = o.id) AS applications
         FROM job_offers o JOIN companies c ON c.id = o.company_id
         WHERE o.company_id = ANY($1::uuid[])
         ORDER BY o.published_at DESC LIMIT 60`,
        [companyIds]
      )
    : [];

  const claims = await query(
    `SELECT cr.id, cr.status, cr.created_at, cr.work_email, c.name AS company_name, c.slug AS company_slug
     FROM claim_requests cr JOIN companies c ON c.id = cr.company_id
     WHERE cr.user_id = $1 ORDER BY cr.created_at DESC LIMIT 20`,
    [user.id]
  );

  const payments = await query(
    `SELECT id, provider_ref, amount_xaf, channel, status, created_at
     FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [user.id]
  );

  return {
    companies: companies.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      short: row.description_short,
      status: row.publication_status,
      verified: row.verification_level,
      rating: row.rating_count > 0 ? Number(row.rating_avg) : null,
      ratingCount: row.rating_count,
      views: row.view_count,
      views30d: row.views_30d,
      phoneClicks: row.phone_clicks,
      directionClicks: row.direction_clicks,
      role: row.role,
      city: row.city_name,
      sector: row.sector_name ? { name: row.sector_name, color: row.sector_color } : null,
      offersPublished: row.offers_published,
      reviewsPublished: row.reviews_published,
    })),
    offers,
    claims,
    payments,
    canEdit: companies.some((row) => WRITE_ROLES.includes(row.role)),
  };
}

async function updateCompany(req, user, body) {
  const slug = requireString(body.companySlug, { max: 90, label: "L'entreprise" });
  const member = await membership(user.id, slug);
  requireRole(member, WRITE_ROLES);

  const fields = [];
  const params = [];
  const set = (column, value) => {
    params.push(value);
    fields.push(`${column} = $${params.length}`);
  };
  const setJson = (column, value) => {
    params.push(JSON.stringify(value));
    fields.push(`${column} = $${params.length}::jsonb`);
  };

  if (body.short !== undefined) set("description_short", optionalString(body.short, { max: 280 }));
  if (body.long !== undefined) set("description_long", optionalString(body.long, { max: 4000 }));
  if (body.address !== undefined) set("address", optionalString(body.address, { max: 200 }));
  if (body.landmark !== undefined) set("landmark", optionalString(body.landmark, { max: 160 }));
  if (body.website !== undefined || body.phone !== undefined || body.whatsapp !== undefined) {
    const current = await one("SELECT contacts FROM companies WHERE id = $1", [member.id]);
    const contacts = { ...(current?.contacts || {}) };
    if (body.phone !== undefined) {
      const phone = body.phone ? normalizeCameroonPhone(body.phone) : "";
      if (body.phone && !phone) throw new HttpError(400, "Numéro de téléphone camerounais invalide.");
      contacts.phone = phone;
      if (!body.whatsapp) contacts.whatsapp = phone.replace(/^\+/, "");
    }
    if (body.whatsapp !== undefined) {
      const whatsapp = body.whatsapp ? normalizeCameroonPhone(body.whatsapp) : "";
      if (body.whatsapp && !whatsapp) throw new HttpError(400, "Numéro WhatsApp invalide.");
      contacts.whatsapp = whatsapp.replace(/^\+/, "");
    }
    if (body.website !== undefined) contacts.website = optionalString(body.website, { max: 200 }) || "";
    if (body.email !== undefined) contacts.email = optionalString(body.email, { max: 120 }) || "";
    setJson("contacts", contacts);
  }
  if (body.hours && typeof body.hours === "object") {
    const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    const hours = {};
    for (const day of days) {
      const value = String(body.hours[day] || "").trim().slice(0, 20);
      if (value && !/^\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}$/.test(value)) {
        throw new HttpError(400, `Horaire invalide pour ${day} (format 08:00-17:30).`);
      }
      hours[day] = value.replace("–", "-");
    }
    setJson("hours", hours);
  }

  if (!fields.length) throw new HttpError(400, "Aucune modification transmise.");

  params.push(member.id);
  await query(`UPDATE companies SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${params.length}`, params);
  await logAudit(req, user, "company.updated", {
    objectType: "company",
    objectId: member.id,
    after: Object.keys(body).filter((key) => key !== "companySlug"),
  });

  return { message: "Fiche mise à jour. Les modifications sont visibles immédiatement." };
}

async function createOffer(req, user, body) {
  const companySlug = requireString(body.companySlug, { max: 90, label: "L'entreprise" });
  const member = await membership(user.id, companySlug);
  requireRole(member, OFFER_ROLES);

  const title = requireString(body.title, { min: 4, max: 140, label: "L'intitulé" });
  const contractType = requireOneOf(body.contractType, CONTRACT_TYPES, "Le type de contrat");
  let slug = slugify(`${title}-${companySlug}`);
  const existing = await one("SELECT 1 AS found FROM job_offers WHERE slug = $1", [slug]);
  if (existing) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  const deadline = body.deadline ? new Date(body.deadline) : null;
  if (deadline && Number.isNaN(deadline.getTime())) throw new HttpError(400, "Date limite invalide.");

  const searchText = [title, contractType, body.educationLevel, body.experience, companySlug]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const rows = await query(
    `INSERT INTO job_offers (slug, company_id, title, contract_type, description, missions, profile,
        education_level, experience_band, skills, benefits, salary_min, salary_max, salary_visible,
        status, search_text, deadline_at, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,'pending',$15,$16,NOW())
     RETURNING id, slug`,
    [
      slug,
      member.id,
      title,
      contractType,
      optionalString(body.description, { max: 4000 }) || "",
      optionalString(body.missions, { max: 4000 }) || "",
      optionalString(body.profile, { max: 4000 }) || "",
      optionalString(body.educationLevel, { max: 80 }) || "",
      optionalString(body.experience, { max: 40 }) || "",
      JSON.stringify(Array.isArray(body.skills) ? body.skills.slice(0, 12) : []),
      optionalString(body.benefits, { max: 1500 }) || "",
      Number(body.salaryMin) || null,
      Number(body.salaryMax) || null,
      Boolean(body.salaryVisible),
      searchText,
      deadline,
    ]
  );

  await logAudit(req, user, "offer.created", {
    objectType: "job_offer",
    objectId: rows[0].id,
    after: { title, contractType },
  });

  return {
    id: rows[0].id,
    slug: rows[0].slug,
    status: "pending",
    message: "Offre enregistrée. Elle est publiée après vérification (généralement sous 24 h).",
  };
}

async function updateOfferStatus(req, user, body) {
  const slug = requireString(body.slug, { max: 120, label: "L'offre" });
  const status = requireOneOf(body.status, ["published", "closed", "draft"], "Le statut");
  const offer = await one(
    `SELECT o.id, o.company_id FROM job_offers o WHERE o.slug = $1`,
    [slug]
  );
  if (!offer) throw new HttpError(404, "Offre introuvable.");
  const member = await one(
    `SELECT role FROM company_members WHERE company_id = $1 AND user_id = $2`,
    [offer.company_id, user.id]
  );
  if (!member) throw new HttpError(403, "Vous ne représentez pas cette entreprise.");
  requireRole(member, OFFER_ROLES);

  await query("UPDATE job_offers SET status = $2, updated_at = NOW() WHERE id = $1", [offer.id, status]);
  await logAudit(req, user, "offer.status", {
    objectType: "job_offer",
    objectId: offer.id,
    after: { status },
  });
  return { message: status === "closed" ? "Offre clôturée." : "Statut de l'offre mis à jour." };
}

export default handler(async (req, res) => {
  const user = await requireUser(req);

  if (req.method === "GET") {
    return ok(res, await dashboard(user));
  }

  if (req.method === "PATCH") {
    const body = await readBody(req);
    return ok(res, await updateCompany(req, user, body));
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    const action = String(body.action || "");
    if (action === "offer.create") return ok(res, await createOffer(req, user, body), 201);
    if (action === "offer.status") return ok(res, await updateOfferStatus(req, user, body));
    throw new HttpError(400, "Action inconnue.");
  }

  if (!requireMethod(req, res, ["GET", "PATCH", "POST"])) return;
});
