/**
 * POST /api/auth  { action: "login" | "register" | "logout" | "forgot" | "reset" }
 * GET  /api/auth  → session courante
 *
 * Une seule page de connexion (/login) pour tous les rôles. Le rôle décide de
 * la redirection ; le compte super administrateur vient de /credentials.js.
 */
import { createHash, randomBytes } from "node:crypto";
import { one, query } from "./_lib/db.js";
import {
  clearSessionCookie,
  constantDelay,
  getCurrentUser,
  isSuperAdminEmail,
  matchesSuperAdmin,
  publicUser,
  recentFailures,
  recordLoginAttempt,
  setSessionCookie,
  signToken,
  superAdminCredentials,
} from "./_lib/auth.js";
import { fail, getIp, handler, ok, readBody, requireMethod, enforceRateLimit, HttpError } from "./_lib/http.js";
import { hashPassword, verifyPassword } from "./_lib/password.js";
import { requireEmail, requireOneOf, requirePassword, requireString } from "./_lib/validate.js";
import { mailerConfigured, passwordResetMail, sendMail } from "./_lib/mailer.js";

const SESSION_SECONDS = 7 * 86400;
const ADMIN_SESSION_SECONDS = 8 * 3600;

function redirectFor(user, next) {
  if (!user) return "/";
  if (["super_admin", "admin", "moderator"].includes(user.role)) return "/admin";
  if (user.role === "company") return "/espace-entreprise";
  if (next && typeof next === "string" && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/compte";
}

async function login(req, res, body) {
  const startedAt = Date.now();
  const email = requireEmail(body.email, "L'adresse e-mail");
  const password = String(body.password || "");
  const ip = getIp(req);

  enforceRateLimit(`login:${ip}`, { max: 12, windowMs: 5 * 60_000 });
  const failures = await recentFailures(email, 15);
  if (failures >= 8) {
    await constantDelay(startedAt, 600);
    throw new HttpError(
      429,
      "Trop de tentatives pour ce compte. Réessayez dans quinze minutes ou contactez le support."
    );
  }

  // 1) Compte de secours super administrateur (credentials.js / variables d'env)
  if (matchesSuperAdmin(email, password)) {
    await recordLoginAttempt(req, email, true);
    const token = signToken({ sub: "super-admin", email, role: "super_admin" }, ADMIN_SESSION_SECONDS);
    setSessionCookie(res, token, "super_admin");
    await constantDelay(startedAt, 300);
    const credentials = superAdminCredentials();
    return ok(res, {
      user: {
        id: null,
        email,
        role: "super_admin",
        roleLabel: "Super administrateur",
        firstName: credentials.name,
        lastName: "",
        emailVerified: true,
        isCredentialAdmin: true,
      },
      redirect: "/admin",
      message: "Connexion administrateur réussie.",
    });
  }

  // 2) Comptes en base
  const user = await one(
    `SELECT id, email, password_hash, role, status, first_name, last_name, email_verified_at, points
     FROM users WHERE email = $1`,
    [email]
  );

  const passwordOk = user ? await verifyPassword(password, user.password_hash) : false;
  if (!user || !passwordOk) {
    await recordLoginAttempt(req, email, false);
    await constantDelay(startedAt, 400);
    // Message volontairement générique.
    throw new HttpError(401, "E-mail ou mot de passe incorrect.");
  }
  if (user.status !== "active") {
    await recordLoginAttempt(req, email, false);
    await constantDelay(startedAt, 400);
    throw new HttpError(
      403,
      "Ce compte n'est pas accessible. Écrivez-nous depuis la page Contact si vous pensez qu'il s'agit d'une erreur."
    );
  }

  await recordLoginAttempt(req, email, true);
  await query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);
  const seconds = ["super_admin", "admin", "moderator"].includes(user.role)
    ? ADMIN_SESSION_SECONDS
    : SESSION_SECONDS;
  setSessionCookie(res, signToken({ sub: user.id, role: user.role }, seconds), user.role);
  await constantDelay(startedAt, 300);

  return ok(res, {
    user: publicUser(user),
    redirect: redirectFor(user, body.next),
    message: `Bienvenue${user.first_name ? " " + user.first_name : ""}.`,
  });
}

async function register(req, res, body) {
  enforceRateLimit(`register:${getIp(req)}`, { max: 6, windowMs: 60 * 60_000 });

  const firstName = requireString(body.firstName, { min: 2, max: 60, label: "Le prénom" });
  const email = requireEmail(body.email, "L'adresse e-mail");
  const password = requirePassword(body.password);
  const accountType = requireOneOf(body.accountType || "user", ["user", "company"], "Le type de compte");
  if (!body.acceptTerms) {
    throw new HttpError(400, "Vous devez accepter les conditions d'utilisation et la politique de confidentialité.");
  }

  const existing = await one("SELECT id FROM users WHERE email = $1", [email]);
  if (existing) {
    throw new HttpError(409, "Un compte existe déjà avec cette adresse. Connectez-vous ou réinitialisez le mot de passe.");
  }
  // Le compte administrateur de secours ne peut pas être recréé en base.
  if (isSuperAdminEmail(email)) {
    throw new HttpError(409, "Cette adresse est réservée.");
  }

  const passwordHash = await hashPassword(password);
  const rows = await query(
    `INSERT INTO users (email, password_hash, role, status, first_name, last_name, email_verified_at, display_pseudonym)
     VALUES ($1,$2,$3,'active',$4,'',NOW(),$4)
     RETURNING id, email, role, first_name, last_name, email_verified_at, points`,
    [email, passwordHash, accountType === "company" ? "company" : "user", firstName]
  );
  const user = rows[0];
  setSessionCookie(res, signToken({ sub: user.id, role: user.role }, SESSION_SECONDS), user.role);
  return ok(
    res,
    {
      user: publicUser(user),
      redirect: accountType === "company" ? "/espace-entreprise" : "/compte",
      message: "Compte créé. Bienvenue sur CONGLOMERAT.",
      notice:
        "La vérification d'e-mail est désactivée sur cette installation : votre compte est immédiatement actif.",
    },
    201
  );
}

async function logout(req, res) {
  clearSessionCookie(res);
  return ok(res, { message: "Vous êtes déconnecté." });
}

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function forgot(req, res, body) {
  const email = requireEmail(body.email, "L'adresse e-mail");
  enforceRateLimit(`forgot:${getIp(req)}`, { max: 5, windowMs: 30 * 60_000 });
  const user = await one("SELECT id, email FROM users WHERE email = $1 AND status = 'active'", [email]);

  // Réponse identique dans tous les cas : pas d'énumération de comptes.
  if (user) {
    const token = randomBytes(32).toString("hex");
    await query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '60 minutes')`,
      [user.id, tokenHash(token)]
    );
    await sendMail(passwordResetMail({ email: user.email, token, minutes: 60 }));
    console.info(`[auth] réinitialisation préparée pour ${email.slice(0, 3)}***`);
  }

  return ok(res, {
    message: mailerConfigured()
      ? "Si un compte existe pour cette adresse, un e-mail contenant un lien de réinitialisation vient d'être envoyé. Le lien est valable une heure."
      : "Si un compte existe pour cette adresse, un lien de réinitialisation a été préparé. " +
        "L'envoi d'e-mails n'étant pas configuré sur cette installation (mode démonstration), " +
        "contactez l'administrateur pour obtenir le lien.",
  });
}

async function resetPassword(req, res, body) {
  const token = requireString(body.token, { min: 32, max: 128, label: "Le lien de réinitialisation" });
  const password = requirePassword(body.password);
  enforceRateLimit(`reset:${getIp(req)}`, { max: 8, windowMs: 30 * 60_000 });

  const record = await one(
    `SELECT pr.id, pr.user_id, u.email
     FROM password_resets pr JOIN users u ON u.id = pr.user_id
     WHERE pr.token_hash = $1 AND pr.used_at IS NULL AND pr.expires_at > NOW()`,
    [tokenHash(token)]
  );
  if (!record) {
    throw new HttpError(400, "Ce lien de réinitialisation est invalide ou expiré. Demandez-en un nouveau.");
  }

  const hash = await hashPassword(password);
  await query("UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1", [record.user_id, hash]);
  await query("UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL", [record.user_id]);
  await query(
    "DELETE FROM password_resets WHERE user_id = $1 AND (used_at IS NOT NULL OR expires_at < NOW())",
    [record.user_id]
  );

  return ok(res, {
    message: "Mot de passe modifié. Vous pouvez vous connecter avec votre nouveau mot de passe.",
  });
}

export default handler(async (req, res) => {
  if (req.method === "GET") {
    const user = await getCurrentUser(req);
    return ok(res, { user: publicUser(user) });
  }
  if (!requireMethod(req, res, "POST")) return;

  const body = await readBody(req);
  const action = String(body.action || "login");

  switch (action) {
    case "login":
      return login(req, res, body);
    case "register":
      return register(req, res, body);
    case "logout":
      return logout(req, res);
    case "forgot":
      return forgot(req, res, body);
    case "reset":
      return resetPassword(req, res, body);
    default:
      return fail(res, 400, "Action d'authentification inconnue.");
  }
});
