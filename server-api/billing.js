/**
 * Paiement de démonstration — AUCUN DÉBIT RÉEL.
 *
 * Le parcours reproduit un paiement Mobile Money (MTN / Orange) de bout en bout,
 * mais la « confirmation opérateur » est simulée côté serveur : un code fixe
 * (123456) tient lieu de validation. Aucune clé d'API, aucun webhook, aucune
 * variable d'environnement n'est nécessaire.
 *
 * Pour brancher un vrai agrégateur : remplacer `confirm()` par la vérification
 * d'un webhook signé, et n'activer l'abonnement qu'après confirmation serveur.
 *
 * GET  /api/billing              → offres Premium + mes paiements
 * POST /api/billing {action}     → "checkout" puis "confirm"
 */
import { one, query } from "./_lib/db.js";
import { getCurrentUser, requireUser, logAudit } from "./_lib/auth.js";
import { enforceRateLimit, handler, ok, readBody, requireMethod, HttpError } from "./_lib/http.js";
import { optionalString, optionalPhone, requireOneOf, requireString } from "./_lib/validate.js";

const DEMO_PIN = "123456";
const PLAN_DAYS = { monthly: 30, quarterly: 90, yearly: 365 };

function demoReference() {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DEMO-${new Date().getFullYear()}-${random}`;
}

function plansList(rows) {
  return rows.map((plan) => ({
    slug: plan.slug,
    name: plan.name,
    period: plan.period,
    priceXaf: plan.price_xaf,
    features: plan.features || [],
  }));
}

export default handler(async (req, res) => {
  if (req.method === "GET") {
    const plans = await query("SELECT * FROM plans WHERE is_active = TRUE ORDER BY price_xaf");
    const user = await getCurrentUser(req);
    let payments = [];
    let subscription = null;
    if (user?.id) {
      payments = await query(
        `SELECT id, provider_ref, amount_xaf, channel, status, created_at, plan_id
         FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [user.id]
      );
      subscription = await one(
        `SELECT s.id, s.status, s.started_at, s.ends_at, p.name AS plan_name
         FROM subscriptions s JOIN plans p ON p.id = s.plan_id
         WHERE s.user_id = $1 AND s.status = 'active' AND (s.ends_at IS NULL OR s.ends_at > NOW())
         ORDER BY s.started_at DESC LIMIT 1`,
        [user.id]
      );
    }
    return ok(res, {
      mode: "demo",
      plans: plansList(plans),
      payments,
      subscription,
      disclaimer:
        "Paiement simulé : aucun montant n'est débité et aucun numéro n'est envoyé à un opérateur. " +
        "Le code de confirmation de démonstration est 123456.",
    });
  }

  if (!requireMethod(req, res, "POST")) return;
  const user = await requireUser(req);
  const body = await readBody(req);
  const action = String(body.action || "checkout");

  if (action === "checkout") {
    enforceRateLimit(`checkout:${user.id}`, { max: 10, windowMs: 3600_000 });
    const planSlug = requireString(body.planSlug, { max: 60, label: "La formule" });
    const plan = await one("SELECT * FROM plans WHERE slug = $1 AND is_active = TRUE", [planSlug]);
    if (!plan) throw new HttpError(404, "Cette formule n'existe pas.");
    const channel = requireOneOf(body.channel, ["mtn", "orange"], "Le mode de paiement");
    const buyerName = optionalString(body.buyerName, { max: 80 }) || user.first_name || "Client";
    const phone = optionalPhone(body.phone);

    const reference = demoReference();
    const rows = await query(
      `INSERT INTO payments (user_id, plan_id, provider, provider_ref, amount_xaf, channel, status,
                             buyer_name, buyer_email, raw_event)
       VALUES ($1,$2,'demo',$3,$4,$5,'pending',$6,$7,$8::jsonb)
       RETURNING id, provider_ref, amount_xaf`,
      [
        user.id,
        plan.id,
        reference,
        plan.price_xaf,
        channel,
        buyerName,
        user.email,
        JSON.stringify({ mode: "demo", phone: phone ? `${phone.slice(0, 5)}•••${phone.slice(-2)}` : null }),
      ]
    );
    await logAudit(req, user, "payment.created", {
      objectType: "payment",
      objectId: rows[0].id,
      after: { reference, amount: plan.price_xaf, channel },
    });

    return ok(
      res,
      {
        reference: rows[0].provider_ref,
        amountXaf: rows[0].amount_xaf,
        channel,
        status: "pending",
        message:
          "Paiement simulé initié. Confirmez avec le code de démonstration 123456 pour activer la formule.",
      },
      201
    );
  }

  if (action === "confirm") {
    enforceRateLimit(`confirm:${user.id}`, { max: 15, windowMs: 600_000 });
    const reference = requireString(body.reference, { max: 60, label: "La référence" });
    const pin = String(body.pin || "").trim();
    const payment = await one("SELECT * FROM payments WHERE provider_ref = $1 AND user_id = $2", [
      reference,
      user.id,
    ]);
    if (!payment) throw new HttpError(404, "Paiement introuvable.");
    if (payment.status === "succeeded") {
      throw new HttpError(409, "Ce paiement a déjà été confirmé.");
    }
    if (pin !== DEMO_PIN) {
      await query(
        `UPDATE payments SET raw_event = raw_event || $2::jsonb, updated_at = NOW() WHERE id = $1`,
        [payment.id, JSON.stringify({ last_error: "code_incorrect", at: new Date().toISOString() })]
      );
      throw new HttpError(400, "Code de confirmation incorrect. Code de démonstration : 123456.");
    }

    const plan = await one("SELECT * FROM plans WHERE id = $1", [payment.plan_id]);
    const days = PLAN_DAYS[plan?.period] || 30;
    const subscriptionRows = await query(
      `INSERT INTO subscriptions (user_id, plan_id, status, started_at, ends_at)
       VALUES ($1,$2,'active',NOW(), NOW() + ($3 || ' days')::interval) RETURNING id, ends_at`,
      [user.id, payment.plan_id, String(days)]
    );
    await query(
      `UPDATE payments SET status = 'succeeded', subscription_id = $2,
              raw_event = raw_event || $3::jsonb, updated_at = NOW()
       WHERE id = $1`,
      [
        payment.id,
        subscriptionRows[0].id,
        JSON.stringify({ confirmed_at: new Date().toISOString(), simulated: true }),
      ]
    );
    await logAudit(req, user, "payment.succeeded", {
      objectType: "payment",
      objectId: payment.id,
      after: { reference, amount: payment.amount_xaf },
    });

    return ok(res, {
      status: "succeeded",
      subscription: {
        plan: plan?.name,
        endsAt: subscriptionRows[0].ends_at,
      },
      message: `Paiement simulé confirmé. Formule « ${plan?.name} » active jusqu'au ${new Date(
        subscriptionRows[0].ends_at
      ).toLocaleDateString("fr-FR")}.`,
    });
  }

  throw new HttpError(400, "Action de paiement inconnue.");
});
