/**
 * POST /api/apply  { offerSlug, coverLetter, cvName? }
 * Candidature interne (compte requis, e-mail vérifié).
 *
 * Aucun fichier n'est stocké ici : le dépôt de CV nécessite un espace de
 * stockage objet (voir DECISIONS.md). Le champ `cvName` permet d'indiquer le
 * nom du document que le candidat enverra ensuite par le canal indiqué.
 */
import { one, query } from "./_lib/db.js";
import { requireUser } from "./_lib/auth.js";
import { enforceRateLimit, handler, ok, readBody, requireMethod, HttpError } from "./_lib/http.js";
import { optionalString } from "./_lib/validate.js";

export default handler(async (req, res) => {
  if (!requireMethod(req, res, "POST")) return;
  const user = await requireUser(req);
  enforceRateLimit(`apply:${user.id}`, { max: 10, windowMs: 3600_000 });

  const body = await readBody(req);
  const offerSlug = String(body.offerSlug || "").trim();
  const offer = await one(
    `SELECT o.id, o.title, o.status, o.deadline_at, o.apply_mode, c.name AS company_name
     FROM job_offers o JOIN companies c ON c.id = o.company_id WHERE o.slug = $1`,
    [offerSlug]
  );
  if (!offer) throw new HttpError(404, "Offre introuvable.");
  if (offer.status !== "published") {
    throw new HttpError(409, "Cette offre n'est plus ouverte aux candidatures.");
  }
  if (offer.deadline_at && new Date(offer.deadline_at).getTime() < Date.now()) {
    throw new HttpError(409, "La date limite de candidature est dépassée.");
  }

  const existing = await one(
    "SELECT id FROM applications WHERE job_offer_id = $1 AND user_id = $2",
    [offer.id, user.id]
  );
  if (existing) {
    return ok(res, {
      already: true,
      message: `Vous avez déjà postulé à « ${offer.title} ». Suivez l'avancement dans Mon compte → Candidatures.`,
    });
  }

  const coverLetter = optionalString(body.coverLetter, { max: 1500 });
  const cvName = optionalString(body.cvName, { max: 180 });
  const rows = await query(
    `INSERT INTO applications (job_offer_id, user_id, cover_letter, cv_url, status)
     VALUES ($1,$2,$3,$4,'received') RETURNING id`,
    [offer.id, user.id, coverLetter, cvName]
  );

  return ok(
    res,
    {
      id: rows[0].id,
      message:
        `Candidature transmise à ${offer.company_name}. ` +
        (cvName
          ? "Envoyez votre CV au contact indiqué en rappelant la référence de l'offre."
          : "Pensez à joindre votre CV si l'entreprise le demande."),
    },
    201
  );
});
