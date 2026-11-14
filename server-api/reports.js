/**
 * POST /api/reports — signaler une fiche, un avis ou une offre.
 * Motifs fermés (voir la fiche entreprise) — un signalement ne supprime rien
 * automatiquement : un modérateur tranche.
 */
import { one, query } from "./_lib/db.js";
import { getCurrentUser } from "./_lib/auth.js";
import { enforceRateLimit, getIp, handler, ok, readBody, requireMethod, HttpError } from "./_lib/http.js";
import { optionalString, requireOneOf, requireString } from "./_lib/validate.js";

const REASONS = [
  "adresse_incorrecte",
  "numero_errone",
  "entreprise_inexistante",
  "entreprise_fermee",
  "usurpation_identite",
  "informations_trompeuses",
  "contenu_inapproprie",
  "doublon",
  "offre_suspecte",
  "autre",
];

export default handler(async (req, res) => {
  if (!requireMethod(req, res, "POST")) return;
  enforceRateLimit(`report:${getIp(req)}`, { max: 10, windowMs: 3600_000 });

  const body = await readBody(req);
  const targetType = requireOneOf(body.targetType, ["company", "review", "offer"], "La cible");
  const reason = requireOneOf(body.reason, REASONS, "Le motif");
  const details = optionalString(body.details, { max: 1000 });

  let targetId = null;
  if (targetType === "company" || targetType === "offer") {
    const slug = requireString(body.slug, { max: 90, label: "La cible" });
    const table = targetType === "company" ? "companies" : "job_offers";
    const row = await one(`SELECT id FROM ${table} WHERE slug = $1`, [slug]);
    if (!row) throw new HttpError(404, "Élément introuvable.");
    targetId = row.id;
  } else {
    targetId = String(body.id || "");
    if (!/^[0-9a-f-]{36}$/i.test(targetId)) throw new HttpError(400, "Avis invalide.");
  }

  const user = await getCurrentUser(req);
  await query(
    `INSERT INTO reports (target_type, target_id, reason, details, reporter_user_id)
     VALUES ($1,$2,$3,$4,$5)`,
    [targetType, targetId, reason, details, user?.id || null]
  );

  return ok(
    res,
    {
      message:
        "Signalement enregistré. L'équipe de modération le traite sous 48 heures ouvrées. " +
        "Rappel : un recruteur sérieux ne demande jamais d'argent.",
    },
    201
  );
});
