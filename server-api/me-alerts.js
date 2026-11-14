/**
 * Alertes de recherche.
 * GET / POST / PATCH (activer-désactiver) / DELETE sur /api/me-alerts
 *
 * L'envoi réel des alertes (e-mail, push) nécessite un fournisseur d'e-mail :
 * le réglage est décrit dans DECISIONS.md. La création et la gestion sont
 * fonctionnelles dès maintenant.
 */
import { query } from "./_lib/db.js";
import { requireUser } from "./_lib/auth.js";
import { handler, ok, readBody, requireMethod, HttpError } from "./_lib/http.js";
import { CONTRACT_TYPES } from "./_lib/validate.js";

export default handler(async (req, res) => {
  const user = await requireUser(req);

  if (req.method === "GET") {
    const rows = await query(
      `SELECT id, filters, frequency, channels, active, last_sent_at, created_at
       FROM alerts WHERE user_id = $1 ORDER BY created_at DESC`,
      [user.id]
    );
    return ok(res, { items: rows });
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    const filters = {
      q: String(body.q || "").slice(0, 120),
      cities: Array.isArray(body.cities) ? body.cities.slice(0, 5) : [],
      sectors: Array.isArray(body.sectors) ? body.sectors.slice(0, 5) : [],
      contracts: Array.isArray(body.contracts)
        ? body.contracts.filter((type) => CONTRACT_TYPES.includes(type)).slice(0, 8)
        : [],
      companies: Array.isArray(body.companies) ? body.companies.slice(0, 5) : [],
    };
    const isEmpty =
      !filters.q && !filters.cities.length && !filters.sectors.length && !filters.contracts.length;
    if (isEmpty) {
      throw new HttpError(400, "Choisissez au moins une ville, un secteur ou un mot-clé.");
    }
    const frequency = ["instant", "daily", "weekly"].includes(body.frequency) ? body.frequency : "weekly";
    const channels = Array.isArray(body.channels)
      ? body.channels.filter((channel) => ["site", "email"].includes(channel))
      : ["site", "email"];

    const existing = await query("SELECT COUNT(*)::int AS total FROM alerts WHERE user_id = $1", [user.id]);
    if (existing[0].total >= 20) throw new HttpError(400, "Vous avez atteint la limite de 20 alertes.");

    const rows = await query(
      `INSERT INTO alerts (user_id, filters, frequency, channels)
       VALUES ($1,$2::jsonb,$3,$4::jsonb) RETURNING id, created_at`,
      [user.id, JSON.stringify(filters), frequency, JSON.stringify(channels)]
    );
    return ok(
      res,
      {
        id: rows[0].id,
        message:
          "Alerte créée. Elle apparaîtra dans votre centre de notifications ; l'envoi par e-mail sera actif dès la configuration d'un service d'envoi.",
      },
      201
    );
  }

  if (req.method === "PATCH") {
    const body = await readBody(req);
    if (!body.id) throw new HttpError(400, "Identifiant manquant.");
    const rows = await query(
      "UPDATE alerts SET active = $3 WHERE id = $1 AND user_id = $2 RETURNING id, active",
      [body.id, user.id, Boolean(body.active)]
    );
    if (!rows.length) throw new HttpError(404, "Alerte introuvable.");
    return ok(res, rows[0]);
  }

  if (req.method === "DELETE") {
    const body = await readBody(req);
    if (!body.id) throw new HttpError(400, "Identifiant manquant.");
    await query("DELETE FROM alerts WHERE id = $1 AND user_id = $2", [body.id, user.id]);
    return ok(res, { message: "Alerte supprimée." });
  }

  if (!requireMethod(req, res, ["GET", "POST", "PATCH", "DELETE"])) return;
});
