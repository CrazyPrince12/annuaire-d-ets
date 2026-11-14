/**
 * POST /api/contributions — proposer une entreprise ou une correction.
 * Ouvert aux visiteurs (limitation de débit par IP), compte facultatif.
 * Rien n'est publié directement : tout passe par la modération.
 */
import { getCurrentUser } from "./_lib/auth.js";
import { query } from "./_lib/db.js";
import { enforceRateLimit, getIp, handler, ok, readBody, requireMethod, HttpError } from "./_lib/http.js";
import { normalizeCameroonPhone } from "./_lib/text.js";
import { contributionReceipt, sendMail, staffNotice } from "./_lib/mailer.js";
import {
  optionalString,
  requireOneOf,
  requireString,
  sanitizePayload,
} from "./_lib/validate.js";

export default handler(async (req, res) => {
  if (!requireMethod(req, res, "POST")) return;
  enforceRateLimit(`contribution:${getIp(req)}`, { max: 8, windowMs: 3600_000 });

  const body = await readBody(req);
  const kind = requireOneOf(body.kind, ["new_company", "edit_company"], "Le type de contribution");
  const user = await getCurrentUser(req);

  let payload;
  let companyId = null;

  if (kind === "new_company") {
    const name = requireString(body.name, { min: 2, max: 120, label: "Le nom de l'entreprise" });
    const sector = requireString(body.sector, { max: 60, label: "Le secteur" });
    const city = requireString(body.city, { max: 60, label: "La ville" });
    const phone = body.phone ? normalizeCameroonPhone(body.phone) : "";
    if (body.phone && !phone) {
      throw new HttpError(400, "Le numéro de téléphone n'est pas au format camerounais.");
    }
    payload = sanitizePayload({
      name,
      sector,
      city,
      neighborhood: optionalString(body.neighborhood, { max: 80 }),
      address: optionalString(body.address, { max: 200 }),
      landmark: optionalString(body.landmark, { max: 160 }),
      description: optionalString(body.description, { max: 600 }),
      phone: phone || "",
      whatsapp: optionalString(body.whatsapp, { max: 40 }),
      email: optionalString(body.email, { max: 120 }),
      website: optionalString(body.website, { max: 200 }),
      foundedYear: Number(body.foundedYear) || null,
      notes: optionalString(body.notes, { max: 600 }),
      submitterEmail: optionalString(body.submitterEmail, { max: 120 }),
      submittedBy: user ? user.first_name || "Compte connecté" : "Visiteur anonyme",
    });
  } else {
    const companySlug = requireString(body.companySlug, { max: 90, label: "L'entreprise" });
    const rows = await query("SELECT id, name FROM companies WHERE slug = $1", [companySlug]);
    if (!rows.length) throw new HttpError(404, "Entreprise introuvable.");
    companyId = rows[0].id;
    const changes = sanitizePayload(body.changes || {});
    if (!changes || !Object.keys(changes).length) {
      throw new HttpError(400, "Indiquez au moins un champ à corriger.");
    }
    payload = sanitizePayload({
      fields: changes,
      submittedBy: user ? user.first_name || "Compte connecté" : "Visiteur anonyme",
    });
  }

  const id = `contrib-${Date.now().toString(36)}`;
  const rows = await query(
    `INSERT INTO contributions (kind, company_id, user_id, payload, status)
     VALUES ($1,$2,$3,$4::jsonb,'pending') RETURNING id`,
    [kind, companyId, user?.id || null, JSON.stringify(payload)]
  );

  // Accusé de réception (facultatif : seulement si l'adresse est fournie) et
  // notification interne. Un échec d'envoi ne remet pas en cause la contribution.
  if (kind === "new_company") {
    const receipt = payload.submitterEmail ? contributionReceipt({ email: payload.submitterEmail, name: payload.name }) : null;
    if (receipt) await sendMail(receipt);
    await sendMail(
      staffNotice({
        subject: `Nouvelle fiche à vérifier : ${payload.name || ""}`,
        text: `${payload.name || "Fiche"} (${payload.sector || "?"} · ${payload.city || "?"}) proposée par ${
          payload.submittedBy || "un visiteur"
        }.`,
        href: "/admin#contributions",
      })
    );
  }

  return ok(
    res,
    {
      id: rows[0].id,
      tracking: id,
      message:
        "Merci. Une personne de l'équipe vérifie la proposition avant publication (objectif : 48 heures).",
    },
    201
  );
});
