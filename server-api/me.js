/**
 * GET   /api/me      → profil + tableau de bord du compte
 * PATCH /api/me      → mise à jour du profil
 * DELETE /api/me     → suppression du compte (anonymisation)
 */
import { one, query } from "./_lib/db.js";
import { getCurrentUser, publicUser, requireUser } from "./_lib/auth.js";
import { handler, ok, readBody, requireMethod, HttpError } from "./_lib/http.js";
import { hashPassword } from "./_lib/password.js";
import { optionalString, requireString } from "./_lib/validate.js";

export default handler(async (req, res) => {
  if (req.method === "GET") {
    const user = await getCurrentUser(req);
    if (!user) return ok(res, { user: null, overview: null });

    const counts = await one(
      `SELECT
         (SELECT COUNT(*)::int FROM favorites WHERE user_id = $1) AS favorites,
         (SELECT COUNT(*)::int FROM alerts WHERE user_id = $1 AND active = TRUE) AS alerts,
         (SELECT COUNT(*)::int FROM user_trackers WHERE user_id = $1) AS trackers,
         (SELECT COUNT(*)::int FROM reviews WHERE user_id = $1) AS reviews,
         (SELECT COUNT(*)::int FROM reviews WHERE user_id = $1 AND status = 'pending') AS reviews_pending,
         (SELECT COUNT(*)::int FROM applications WHERE user_id = $1) AS applications,
         (SELECT COUNT(*)::int FROM contributions WHERE user_id = $1) AS contributions,
         (SELECT COUNT(*)::int FROM subscriptions WHERE user_id = $1 AND status = 'active'
            AND (ends_at IS NULL OR ends_at > NOW())) AS subscriptions`,
      [user.id]
    );

    const applications = await query(
      `SELECT a.id, a.status, a.created_at, o.slug AS offer_slug, o.title, o.contract_type,
              c.name AS company_name, c.slug AS company_slug
       FROM applications a
       JOIN job_offers o ON o.id = a.job_offer_id
       JOIN companies c ON c.id = o.company_id
       WHERE a.user_id = $1 ORDER BY a.created_at DESC LIMIT 10`,
      [user.id]
    );

    const subscription = await one(
      `SELECT s.id, s.started_at, s.ends_at, p.name AS plan_name, p.price_xaf, p.period
       FROM subscriptions s JOIN plans p ON p.id = s.plan_id
       WHERE s.user_id = $1 AND s.status = 'active' AND (s.ends_at IS NULL OR s.ends_at > NOW())
       ORDER BY s.started_at DESC LIMIT 1`,
      [user.id]
    );

    return ok(res, {
      user: publicUser(user),
      overview: { counts, applications, subscription },
    });
  }

  if (req.method === "PATCH") {
    const user = await requireUser(req);
    const body = await readBody(req);
    const firstName = body.firstName
      ? requireString(body.firstName, { min: 2, max: 60, label: "Le prénom" })
      : user.first_name;
    const lastName = optionalString(body.lastName, { max: 60 });
    const pseudonym = optionalString(body.pseudonym, { max: 60 });
    const educationLevel = optionalString(body.educationLevel, { max: 80 });
    const field = optionalString(body.field, { max: 80 });
    const preferences =
      body.preferences && typeof body.preferences === "object"
        ? { ...(user.preferences || {}), ...body.preferences }
        : user.preferences || {};

    await query(
      `UPDATE users SET first_name = $2, last_name = $3, display_pseudonym = $4,
              education_level = $5, field = $6, preferences = $7::jsonb, updated_at = NOW()
       WHERE id = $1`,
      [user.id, firstName, lastName, pseudonym, educationLevel, field, JSON.stringify(preferences)]
    );
    const updated = await one(
      "SELECT id, email, role, first_name, last_name, display_pseudonym, email_verified_at, points FROM users WHERE id = $1",
      [user.id]
    );
    return ok(res, { user: publicUser(updated), message: "Profil mis à jour." });
  }

  if (req.method === "DELETE") {
    const user = await requireUser(req);
    const body = await readBody(req);
    if (body.confirm !== "SUPPRIMER") {
      throw new HttpError(400, "Saisissez SUPPRIMER pour confirmer la suppression du compte.");
    }
    if (user.isCredentialAdmin) {
      throw new HttpError(403, "Le compte administrateur de secours ne peut pas être supprimé.");
    }
    // Anonymisation : les contributions et avis restent mais ne sont plus reliés
    // à une identité (obligation de preuve côté plateforme en cas de litige,
    // l'identité n'est plus conservée qu'en cas de réquisition).
    const randomHash = await hashPassword(`deleted-${Math.random()}`);
    await query(
      `UPDATE users SET email = $2, password_hash = $3, status = 'deleted',
              first_name = 'Compte', last_name = 'supprimé', display_pseudonym = '',
              avatar_url = NULL, updated_at = NOW()
       WHERE id = $1`,
      [user.id, `supprime-${user.id}@conglomerat.invalid`, randomHash]
    );
    await query("DELETE FROM favorites WHERE user_id = $1", [user.id]);
    await query("DELETE FROM alerts WHERE user_id = $1", [user.id]);
    await query("DELETE FROM user_trackers WHERE user_id = $1", [user.id]);
    res.setHeader("Set-Cookie", "conglomerat_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    return ok(res, { message: "Compte supprimé. Vos données de navigation ont été effacées." });
  }

  if (!requireMethod(req, res, ["GET", "PATCH", "DELETE"])) return;
});
