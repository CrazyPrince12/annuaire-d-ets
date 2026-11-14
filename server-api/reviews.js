/**
 * POST /api/reviews  — dépôt d'un avis (compte requis).
 *
 * Règles appliquées côté serveur :
 *  - un seul avis actif par personne, entreprise et type d'expérience ;
 *  - impossibilité de noter sa propre entreprise ;
 *  - 3 avis maximum par jour et par compte ;
 *  - l'avis part en modération (statut "pending"), jamais publié d'office ;
 *  - les drapeaux automatiques servent au modérateur, ils ne refusent rien.
 */
import { one, query } from "./_lib/db.js";
import { requireUser } from "./_lib/auth.js";
import { enforceRateLimit, handler, ok, readBody, requireMethod, HttpError } from "./_lib/http.js";
import {
  CRITERIA,
  RELATIONSHIPS,
  moderationFlags,
  optionalString,
  parseRating,
  requireOneOf,
  requireString,
} from "./_lib/validate.js";

export default handler(async (req, res) => {
  if (!requireMethod(req, res, "POST")) return;
  const user = await requireUser(req);
  if (!user.email_verified_at && !user.emailVerified) {
    throw new HttpError(403, "Vérifiez votre adresse e-mail avant de publier un avis.");
  }
  enforceRateLimit(`review:${user.id}`, { max: 6, windowMs: 24 * 3600_000 });

  const body = await readBody(req);
  const companySlug = requireString(body.companySlug, { max: 90, label: "L'entreprise" });
  const relationship = requireOneOf(body.relationship, RELATIONSHIPS, "Le type d'expérience");

  const company = await one("SELECT id, name FROM companies WHERE slug = $1", [companySlug]);
  if (!company) throw new HttpError(404, "Entreprise introuvable.");

  // Un représentant ne peut pas noter sa propre entreprise.
  if (user.id) {
    const member = await one(
      "SELECT 1 AS found FROM company_members WHERE company_id = $1 AND user_id = $2",
      [company.id, user.id]
    );
    if (member) throw new HttpError(403, "Vous ne pouvez pas noter une entreprise que vous représentez.");
  }

  const existing = await one(
    `SELECT id FROM reviews
     WHERE company_id = $1 AND user_id = $2 AND relationship = $3
       AND status IN ('published', 'pending')`,
    [company.id, user.id, relationship]
  );
  if (existing) {
    throw new HttpError(
      409,
      "Vous avez déjà un avis actif sur cette entreprise pour ce type d'expérience. Modifiez-le depuis votre compte."
    );
  }

  const ratings = {};
  if (body.ratings && typeof body.ratings === "object") {
    for (const key of CRITERIA) {
      if (body.ratings[key]) ratings[key] = parseRating(body.ratings[key], `La note « ${key} »`);
    }
  }
  if (!Object.keys(ratings).length) {
    throw new HttpError(400, "Donnez au moins une note par critère.");
  }

  const title = requireString(body.title, { min: 5, max: 80, label: "Le titre" });
  const pros = requireString(body.pros, { min: 40, max: 1500, label: "Les points positifs" });
  const cons = requireString(body.cons, { min: 40, max: 1500, label: "Les points à améliorer" });
  const advice = optionalString(body.advice, { max: 1500 });
  const periodLabel = optionalString(body.period, { max: 40 });
  const roleLabel = optionalString(body.role, { max: 80 });

  const overall =
    Object.values(ratings).reduce((sum, value) => sum + value, 0) / Object.values(ratings).length;

  const flags = moderationFlags({ title, pros, cons, advice, relationship });
  if (pros.length + cons.length < 120) flags.push("experience_peu_detaillee");
  const accountAgeHours = user.created_at
    ? (Date.now() - new Date(user.created_at).getTime()) / 3600_000
    : 999;
  if (accountAgeHours < 24) flags.push("compte_recent");

  const rows = await query(
    `INSERT INTO reviews (
       company_id, user_id, relationship, period_label, role_label, rating_overall,
       ratings, title, pros, cons, advice, status, moderation_flags, salary
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,'pending',$12::jsonb,$13::jsonb)
     RETURNING id`,
    [
      company.id,
      user.id,
      relationship,
      periodLabel,
      roleLabel,
      Math.round(overall * 2) / 2,
      JSON.stringify(ratings),
      title,
      pros,
      cons,
      advice,
      JSON.stringify(flags),
      body.salary && typeof body.salary === "object" ? JSON.stringify(body.salary) : null,
    ]
  );

  return ok(
    res,
    {
      id: rows[0].id,
      status: "pending",
      message:
        "Merci. Votre avis est en cours de relecture, il sera publié sous 48 heures s'il respecte la charte.",
    },
    201
  );
});
