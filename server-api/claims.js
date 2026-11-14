/**
 * POST /api/claims — revendiquer une fiche entreprise.
 * Le dossier part en examen (admin → Revendications). Aucune donnée n'est
 * publiée : seuls le nom, la fonction et l'e-mail professionnel sont conservés
 * pour le contrôle.
 */
import { getCurrentUser } from "./_lib/auth.js";
import { one, query } from "./_lib/db.js";
import { enforceRateLimit, getIp, handler, ok, readBody, requireMethod, HttpError } from "./_lib/http.js";
import { normalizeCameroonPhone } from "./_lib/text.js";
import { optionalString, requireEmail, requireString } from "./_lib/validate.js";

export default handler(async (req, res) => {
  if (!requireMethod(req, res, "POST")) return;
  enforceRateLimit(`claim:${getIp(req)}`, { max: 5, windowMs: 24 * 3600_000 });

  const body = await readBody(req);
  const companySlug = requireString(body.companySlug, { max: 90, label: "L'entreprise" });
  const company = await one("SELECT id, name FROM companies WHERE slug = $1", [companySlug]);
  if (!company) throw new HttpError(404, "Entreprise introuvable.");

  const fullName = requireString(body.fullName, { min: 3, max: 90, label: "Le nom et prénom" });
  const roleTitle = requireString(body.roleTitle, { min: 2, max: 90, label: "La fonction" });
  const workEmail = requireEmail(body.workEmail, "L'e-mail professionnel");
  const phone = body.phone ? normalizeCameroonPhone(body.phone) : "";
  if (body.phone && !phone) throw new HttpError(400, "Numéro de téléphone invalide.");

  const already = await one(
    "SELECT id FROM claim_requests WHERE company_id = $1 AND work_email = $2 AND status = 'pending'",
    [company.id, workEmail]
  );
  if (already) {
    return ok(res, { message: "Une demande est déjà en examen pour cette fiche et ce contact." });
  }

  const user = await getCurrentUser(req);
  await query(
    `INSERT INTO claim_requests (company_id, user_id, full_name, role_title, work_email, phone, proof_note)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [company.id, user?.id || null, fullName, roleTitle, workEmail, phone || "", optionalString(body.proofNote, { max: 800 })]
  );

  return ok(
    res,
    {
      message:
        `Dossier envoyé pour « ${company.name} ». ` +
        "Préparez un extrait RCCM, le NIU et une preuve de représentation : ils seront demandés avant validation.",
    },
    201
  );
});
