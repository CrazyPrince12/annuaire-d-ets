/**
 * GET /api/admin/data?resource=…
 * Toutes les lectures du panneau d'administration, protégées par rôle.
 */
import { one, query } from "../_lib/db.js";
import { can, requireUser, isAdminRole } from "../_lib/auth.js";
import { handler, ok, requireMethod, HttpError } from "../_lib/http.js";
import { parseFilters } from "../_lib/http.js";

const ALLOWED = {
  moderator: ["overview", "queue", "reviews", "contributions", "reports", "offers", "companies", "company"],
  admin: [
    "overview", "queue", "reviews", "contributions", "reports", "offers", "companies", "company",
    "claims", "users", "payments", "settings", "audit", "messages",
  ],
  super_admin: ["*"],
};

function assertResource(user, resource) {
  const allowed = ALLOWED[user.role] || [];
  if (allowed.includes("*") || allowed.includes(resource)) return;
  throw new HttpError(403, "Accès refusé à cette ressource.");
}

export default handler(async (req, res) => {
  if (!requireMethod(req, res, "GET")) return;
  const user = await requireUser(req);
  if (!isAdminRole(user.role)) throw new HttpError(403, "Espace réservé à l'équipe de modération.");

  const resource = String(req.query.resource || "overview");
  assertResource(user, resource);

  switch (resource) {
    case "overview": {
      const kpis = await one(
        `SELECT
          (SELECT COUNT(*)::int FROM companies WHERE publication_status='published' AND deleted_at IS NULL) AS companies_published,
          (SELECT COUNT(*)::int FROM companies WHERE publication_status='pending') AS companies_pending,
          (SELECT COUNT(*)::int FROM companies WHERE verification_level > 0) AS companies_verified,
          (SELECT COUNT(*)::int FROM companies WHERE provenance='exemple') AS companies_demo,
          (SELECT COUNT(*)::int FROM reviews WHERE status='pending') AS reviews_pending,
          (SELECT COUNT(*)::int FROM reviews WHERE status='published') AS reviews_published,
          (SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (published_at - created_at)) / 3600))::int, 0)
             FROM reviews WHERE published_at IS NOT NULL) AS moderation_hours,
          (SELECT COUNT(*)::int FROM contributions WHERE status='pending') AS contributions_pending,
          (SELECT COUNT(*)::int FROM reports WHERE status='open') AS reports_open,
          (SELECT COUNT(*)::int FROM claim_requests WHERE status='pending') AS claims_pending,
          (SELECT COUNT(*)::int FROM job_offers WHERE status='published') AS offers_published,
          (SELECT COUNT(*)::int FROM job_offers WHERE status='pending') AS offers_pending,
          (SELECT COUNT(*)::int FROM users WHERE status <> 'deleted') AS users_total,
          (SELECT COUNT(*)::int FROM users WHERE created_at > NOW() - INTERVAL '7 days') AS users_new,
          (SELECT COUNT(*)::int FROM contact_messages WHERE status='new') AS messages_new,
          (SELECT COUNT(*)::int FROM payments WHERE status='succeeded') AS payments_count,
          (SELECT COALESCE(SUM(amount_xaf), 0)::int FROM payments WHERE status='succeeded') AS revenue_xaf`
      );

      const topCompanies = await query(
        `SELECT c.slug, c.name, c.view_count, c.rating_avg, c.rating_count, ci.name AS city_name
         FROM companies c LEFT JOIN cities ci ON ci.id = c.city_id
         WHERE c.publication_status='published'
         ORDER BY c.view_count DESC LIMIT 8`
      );
      const byCity = await query(
        `SELECT ci.name, COUNT(c.id)::int AS total,
                SUM(CASE WHEN c.verification_level > 0 THEN 1 ELSE 0 END)::int AS verified
         FROM cities ci LEFT JOIN companies c ON c.city_id = ci.id AND c.publication_status='published'
         GROUP BY ci.name ORDER BY total DESC`
      );
      const activity = await query(
        `SELECT to_char(d.day, 'DD/MM') AS day,
                (SELECT COUNT(*)::int FROM reviews r WHERE r.created_at::date = d.day) AS reviews,
                (SELECT COUNT(*)::int FROM companies c WHERE c.created_at::date = d.day) AS companies,
                (SELECT COUNT(*)::int FROM companies c WHERE c.updated_at::date = d.day) AS updates
         FROM (SELECT generate_series((NOW() - INTERVAL '13 days')::date, NOW()::date, INTERVAL '1 day')::date AS day) d
         ORDER BY d.day`
      );
      const recentAudit = await query(
        `SELECT id, actor_email, action, object_type, object_id, created_at
         FROM audit_logs ORDER BY created_at DESC LIMIT 8`
      );
      const emptySectors = await query(
        `SELECT s.name, COUNT(c.id)::int AS total FROM sectors s
         LEFT JOIN company_sectors cs ON cs.sector_id = s.id
         LEFT JOIN companies c ON c.id = cs.company_id AND c.publication_status='published'
         GROUP BY s.name ORDER BY total ASC LIMIT 4`
      );
      return ok(res, { kpis, topCompanies, byCity, activity, recentAudit, emptySectors });
    }

    case "queue": {
      const rows = await query(
        `SELECT 'review' AS kind, r.id, r.title AS label, r.created_at, r.status,
                c.name AS company_name, c.slug AS company_slug, ci.name AS city_name, r.rating_overall AS score
         FROM reviews r JOIN companies c ON c.id = r.company_id
         LEFT JOIN cities ci ON ci.id = c.city_id
         WHERE r.status = 'pending'
         UNION ALL
         SELECT 'contribution', ct.id, COALESCE(ct.payload->>'name', c.name, 'Correction'), ct.created_at, ct.status,
                COALESCE(c.name, ct.payload->>'name', ''), c.slug, ct.payload->>'city', NULL::numeric
         FROM contributions ct LEFT JOIN companies c ON c.id = ct.company_id
         WHERE ct.status = 'pending'
         UNION ALL
         SELECT 'report', rp.id, rp.reason, rp.created_at, rp.status, c.name, c.slug, NULL, NULL::numeric
         FROM reports rp LEFT JOIN companies c ON c.id = rp.target_id AND rp.target_type = 'company'
         WHERE rp.status = 'open'
         UNION ALL
         SELECT 'claim', cl.id, cl.full_name || ' — ' || cl.role_title, cl.created_at, cl.status, c.name, c.slug, NULL, NULL::numeric
         FROM claim_requests cl JOIN companies c ON c.id = cl.company_id
         WHERE cl.status = 'pending'
         UNION ALL
         SELECT 'offer', o.id, o.title, o.created_at, o.status, c.name, c.slug, ci.name, NULL::numeric
         FROM job_offers o JOIN companies c ON c.id = o.company_id
         LEFT JOIN cities ci ON ci.id = o.city_id
         WHERE o.status = 'pending'
         ORDER BY created_at ASC LIMIT 60`
      );
      return ok(res, { items: rows });
    }

    case "reviews": {
      const status = ["pending", "published", "rejected", "hidden"].includes(req.query.status)
        ? req.query.status
        : "pending";
      const rows = await query(
        `SELECT r.id, r.title, r.pros, r.cons, r.advice, r.rating_overall, r.ratings, r.relationship,
                r.period_label, r.role_label, r.status, r.moderation_flags, r.verified_experience,
                r.helpful_count, r.created_at, r.published_at, r.decision_reason,
                c.name AS company_name, c.slug AS company_slug, ci.name AS city_name,
                u.email AS author_email, u.created_at AS author_created_at,
                (SELECT COUNT(*)::int FROM reviews rr WHERE rr.user_id = r.user_id) AS author_reviews
         FROM reviews r JOIN companies c ON c.id = r.company_id
         LEFT JOIN cities ci ON ci.id = c.city_id
         LEFT JOIN users u ON u.id = r.user_id
         WHERE r.status = $1 ORDER BY r.created_at ASC LIMIT 100`,
        [status]
      );
      const counts = await query(
        "SELECT status, COUNT(*)::int AS total FROM reviews GROUP BY status"
      );
      return ok(res, { items: rows, status, counts });
    }

    case "contributions": {
      const rows = await query(
        `SELECT ct.id, ct.kind, ct.payload, ct.status, ct.created_at, ct.decision_reason,
                c.name AS company_name, c.slug AS company_slug
         FROM contributions ct LEFT JOIN companies c ON c.id = ct.company_id
         ORDER BY CASE ct.status WHEN 'pending' THEN 0 ELSE 1 END, ct.created_at DESC LIMIT 60`
      );
      return ok(res, { items: rows });
    }

    case "reports": {
      const rows = await query(
        `SELECT rp.id, rp.target_type, rp.target_id, rp.reason, rp.details, rp.status, rp.created_at,
                c.name AS company_name, c.slug AS company_slug
         FROM reports rp
         LEFT JOIN companies c ON (rp.target_type='company' AND c.id = rp.target_id)
         ORDER BY CASE rp.status WHEN 'open' THEN 0 ELSE 1 END, rp.created_at DESC LIMIT 60`
      );
      return ok(res, { items: rows });
    }

    case "claims": {
      const rows = await query(
        `SELECT cl.id, cl.full_name, cl.role_title, cl.work_email, cl.phone, cl.proof_note,
                cl.status, cl.created_at, c.name AS company_name, c.slug AS company_slug
         FROM claim_requests cl JOIN companies c ON c.id = cl.company_id
         ORDER BY CASE cl.status WHEN 'pending' THEN 0 ELSE 1 END, cl.created_at DESC LIMIT 60`
      );
      return ok(res, { items: rows });
    }

    case "offers": {
      const status = ["pending", "published", "expired", "closed", "rejected", "draft"].includes(req.query.status)
        ? req.query.status
        : "published";
      const rows = await query(
        `SELECT o.id, o.slug, o.title, o.contract_type, o.status, o.published_at, o.deadline_at,
                o.salary_visible, o.salary_min, o.salary_max, o.scam_flags,
                c.name AS company_name, c.slug AS company_slug, c.verification_level,
                ci.name AS city_name
         FROM job_offers o JOIN companies c ON c.id = o.company_id
         LEFT JOIN cities ci ON ci.id = COALESCE(o.city_id, c.city_id)
         WHERE o.status = $1 ORDER BY o.published_at DESC LIMIT 80`,
        [status]
      );
      const counts = await query("SELECT status, COUNT(*)::int AS total FROM job_offers GROUP BY status");
      return ok(res, { items: rows, status, counts });
    }

    case "companies": {
      const filters = parseFilters(req.query);
      const status = req.query.status || "";
      const where = ["c.deleted_at IS NULL"];
      const params = [];
      if (status) {
        params.push(status);
        where.push(`c.publication_status = $${params.length}`);
      }
      if (filters.q) {
        params.push(`%${filters.q.toLowerCase()}%`);
        where.push(`(lower(c.name) LIKE $${params.length} OR c.slug LIKE $${params.length})`);
      }
      if (filters.cities.length) {
        params.push(filters.cities);
        where.push(`ci.slug = ANY($${params.length})`);
      }
      params.push(80);
      const rows = await query(
        `SELECT c.id, c.slug, c.name, c.publication_status, c.verification_level, c.provenance,
                c.rating_avg, c.rating_count, c.is_hiring, c.updated_at, c.created_at, c.view_count,
                ci.name AS city_name, s.name AS sector_name,
                (SELECT COUNT(*)::int FROM job_offers o WHERE o.company_id = c.id AND o.status='published') AS offers,
                (SELECT COUNT(*)::int FROM reviews r WHERE r.company_id = c.id) AS reviews
         FROM companies c
         LEFT JOIN cities ci ON ci.id = c.city_id
         LEFT JOIN company_sectors cs ON cs.company_id = c.id AND cs.is_primary = TRUE
         LEFT JOIN sectors s ON s.id = cs.sector_id
         WHERE ${where.join(" AND ")}
         ORDER BY c.updated_at DESC LIMIT $${params.length}`,
        params
      );
      return ok(res, { items: rows });
    }

    case "company": {
      const slug = String(req.query.slug || "");
      const company = await one(
        `SELECT c.*, ci.name AS city_name, ci.slug AS city_slug, n.name AS neighborhood_name,
                s.name AS sector_name, s.slug AS sector_slug
         FROM companies c
         LEFT JOIN cities ci ON ci.id = c.city_id
         LEFT JOIN neighborhoods n ON n.id = c.neighborhood_id
         LEFT JOIN company_sectors cs ON cs.company_id = c.id AND cs.is_primary = TRUE
         LEFT JOIN sectors s ON s.id = cs.sector_id
         WHERE c.slug = $1`,
        [slug]
      );
      if (!company) throw new HttpError(404, "Entreprise introuvable.");
      return ok(res, { company });
    }

    case "users": {
      const rows = await query(
        `SELECT u.id, u.email, u.role, u.status, u.first_name, u.last_name, u.created_at,
                u.last_login_at, u.points, u.email_verified_at,
                (SELECT COUNT(*)::int FROM reviews r WHERE r.user_id = u.id) AS reviews,
                (SELECT COUNT(*)::int FROM contributions c WHERE c.user_id = u.id) AS contributions
         FROM users u ORDER BY u.created_at DESC LIMIT 100`
      );
      const counts = await query("SELECT role, COUNT(*)::int AS total FROM users GROUP BY role");
      return ok(res, { items: rows, counts });
    }

    case "payments": {
      const rows = await query(
        `SELECT p.id, p.provider_ref, p.amount_xaf, p.channel, p.status, p.created_at,
                p.buyer_name, p.buyer_email, pl.name AS plan_name
         FROM payments p LEFT JOIN plans pl ON pl.id = p.plan_id
         ORDER BY p.created_at DESC LIMIT 60`
      );
      const totals = await one(
        `SELECT COUNT(*)::int AS total,
                COALESCE(SUM(CASE WHEN status='succeeded' THEN amount_xaf ELSE 0 END),0)::int AS revenue,
                COUNT(CASE WHEN status='pending' THEN 1 END)::int AS pending
         FROM payments`
      );
      return ok(res, { items: rows, totals, mode: "demo" });
    }

    case "settings": {
      const rows = await query("SELECT key, value, updated_at FROM settings ORDER BY key");
      return ok(res, { items: rows });
    }

    case "audit": {
      const rows = await query(
        `SELECT id, actor_email, action, object_type, object_id, before, after, ip_prefix, created_at
         FROM audit_logs ORDER BY created_at DESC LIMIT 100`
      );
      return ok(res, { items: rows });
    }

    case "messages": {
      const rows = await query(
        "SELECT id, name, email, subject, message, status, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 60"
      );
      return ok(res, { items: rows });
    }

    default:
      throw new HttpError(400, "Ressource inconnue.");
  }
});
