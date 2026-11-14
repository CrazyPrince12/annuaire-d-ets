/**
 * Authentification et permissions.
 *
 * - Session = JWT signé en HMAC-SHA256, stocké dans un cookie HttpOnly.
 * - Mots de passe en base : scrypt (voir password.js).
 * - Le compte super administrateur de secours vient de /credentials.js et
 *   fonctionne même si la base est vide ou indisponible.
 * - Chaque route serveur revérifie le rôle : masquer un bouton ne protège rien.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { query, one } from "./db.js";
import { HttpError, getIp, ipPrefix } from "./http.js";
import { safeEqual } from "./password.js";
import CREDENTIALS from "../../credentials.js";

const COOKIE_NAME = "conglomerat_session";
const SESSION_DAYS = 7;
const ADMIN_SESSION_HOURS = 8;

/* -------------------------------------------------------------------------- */
/*  JWT maison (aucune dépendance)                                            */
/* -------------------------------------------------------------------------- */
function secret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  // Repli de développement : la session reste signée, mais un secret partagé
  // par défaut n'est pas un secret de production. À définir sur Vercel.
  return `conglomerat-dev-${CREDENTIALS.superAdmin.password}-v1`;
}

const base64url = (input) =>
  Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromBase64url = (input) =>
  Buffer.from(String(input).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

export function signToken(payload, expiresInSeconds) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(
    JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + expiresInSeconds })
  );
  const signature = createHmac("sha256", secret()).update(`${header}.${body}`).digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expected = createHmac("sha256", secret()).update(`${header}.${body}`).digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromBase64url(body));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Cookies                                                                    */
/* -------------------------------------------------------------------------- */
export function setSessionCookie(res, token, role) {
  const maxAge = (isAdminRole(role) ? ADMIN_SESSION_HOURS * 3600 : SESSION_DAYS * 86400);
  const secure = process.env.VERCEL || process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function readSessionToken(req) {
  if (req.cookies && typeof req.cookies === "object") return req.cookies[COOKIE_NAME] || null;
  const raw = String(req.headers.cookie || "");
  const match = raw.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/* -------------------------------------------------------------------------- */
/*  Rôles et permissions                                                       */
/* -------------------------------------------------------------------------- */
export const ROLE_LABELS = {
  user: "Utilisateur",
  company: "Entreprise",
  moderator: "Modérateur",
  admin: "Administrateur",
  super_admin: "Super administrateur",
};

export function isAdminRole(role) {
  return ["moderator", "admin", "super_admin"].includes(role);
}

/** Matrice simplifiée : rôle → clés de permission (voir cahier §11.1). */
const ROLE_PERMISSIONS = {
  user: ["favorites.write", "reviews.write", "applications.write", "alerts.write", "contributions.write"],
  company: [
    "favorites.write",
    "reviews.write",
    "applications.write",
    "alerts.write",
    "contributions.write",
    "company.edit",
    "offers.write",
  ],
  moderator: [
    "reviews.moderate",
    "contributions.moderate",
    "reports.moderate",
    "offers.moderate",
    "companies.read",
    "media.moderate",
    "admin.access",
  ],
  admin: [
    "reviews.moderate",
    "contributions.moderate",
    "reports.moderate",
    "offers.moderate",
    "companies.read",
    "companies.edit",
    "companies.publish",
    "companies.verify",
    "users.manage",
    "content.write",
    "claims.manage",
    "payments.read",
    "settings.write",
    "audit.read",
    "admin.access",
    "media.moderate",
  ],
  super_admin: ["*"],
};

export function can(user, permission) {
  if (!user) return false;
  const permissions = ROLE_PERMISSIONS[user.role] || [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function requirePermission(user, permission) {
  if (!can(user, permission)) {
    throw new HttpError(403, "Vous n'avez pas les droits nécessaires pour cette action.");
  }
}

/* -------------------------------------------------------------------------- */
/*  Utilisateur courant                                                        */
/* -------------------------------------------------------------------------- */
const SUPER_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || CREDENTIALS.superAdmin.email).toLowerCase();
const SUPER_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || CREDENTIALS.superAdmin.password;

export function superAdminCredentials() {
  return {
    email: SUPER_ADMIN_EMAIL,
    password: SUPER_ADMIN_PASSWORD,
    name: CREDENTIALS.superAdmin.name,
  };
}

/** Cette adresse est-elle celle du compte administrateur de secours ? */
export function isSuperAdminEmail(email) {
  return String(email || "").trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

/** Vérifie les identifiants de secours (credentials.js / variables d'env). */
export function matchesSuperAdmin(email, password) {
  return (
    String(email || "").trim().toLowerCase() === SUPER_ADMIN_EMAIL &&
    safeEqual(String(password || ""), SUPER_ADMIN_PASSWORD)
  );
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role] || user.role,
    firstName: user.first_name || user.firstName || "",
    lastName: user.last_name || "",
    pseudonym: user.display_pseudonym || "",
    emailVerified: Boolean(user.email_verified_at ?? user.emailVerified),
    cityId: user.city_id || null,
    points: user.points ?? 0,
    isDemo: Boolean(user.isDemo),
    permissions: ROLE_PERMISSIONS[user.role] === undefined
      ? []
      : ROLE_PERMISSIONS[user.role][0] === "*"
        ? ["*"]
        : [...ROLE_PERMISSIONS[user.role]],
  };
}

const SELECT_USER = `SELECT id, email, role, status, first_name, last_name, display_pseudonym,
                            email_verified_at, city_id, points, avatar_url, education_level, field,
                            created_at
                     FROM users WHERE id = $1`;

export async function getCurrentUser(req) {
  const token = readSessionToken(req);
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;

  if (payload.sub === "super-admin") {
    return {
      id: null,
      email: SUPER_ADMIN_EMAIL,
      role: "super_admin",
      status: "active",
      first_name: CREDENTIALS.superAdmin.name,
      last_name: "",
      email_verified_at: new Date().toISOString(),
      points: 0,
      isCredentialAdmin: true,
    };
  }

  try {
    const user = await one(SELECT_USER, [payload.sub]);
    if (!user || user.status !== "active") return null;
    return user;
  } catch {
    return null;
  }
}

export async function requireUser(req) {
  const user = await getCurrentUser(req);
  if (!user) throw new HttpError(401, "Vous devez être connecté pour cette action.");
  return user;
}

/* -------------------------------------------------------------------------- */
/*  Tentatives de connexion                                                   */
/* -------------------------------------------------------------------------- */
export async function recordLoginAttempt(req, email, succeeded) {
  const ipHash = hashShort(getIp(req));
  const emailHash = hashShort(String(email || "").toLowerCase());
  try {
    await query(
      `INSERT INTO login_attempts (email_hash, ip_hash, succeeded) VALUES ($1,$2,$3)`,
      [emailHash, ipHash, succeeded]
    );
  } catch {
    /* la journalisation ne doit jamais bloquer une connexion */
  }
}

export async function recentFailures(email, minutes = 15) {
  const emailHash = hashShort(String(email || "").toLowerCase());
  try {
    const rows = await query(
      `SELECT COUNT(*)::int AS failures FROM login_attempts
       WHERE email_hash = $1 AND succeeded = FALSE
         AND created_at > NOW() - ($2 || ' minutes')::interval`,
      [emailHash, String(minutes)]
    );
    return rows[0]?.failures ?? 0;
  } catch {
    return 0;
  }
}

function hashShort(value) {
  return createHmac("sha256", secret()).update(String(value)).digest("hex").slice(0, 32);
}

/* -------------------------------------------------------------------------- */
/*  Journal d'audit                                                           */
/* -------------------------------------------------------------------------- */
export async function logAudit(req, actor, action, { objectType = "", objectId = "", before = null, after = null } = {}) {
  try {
    const ip = req ? getIp(req) : "";
    await query(
      `INSERT INTO audit_logs (actor_user_id, actor_email, action, object_type, object_id, before, after, ip_prefix)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        actor?.id || null,
        actor?.email || "système",
        action,
        objectType,
        String(objectId || ""),
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        ip ? ipPrefix(ip) : "",
      ]
    );
  } catch (error) {
    console.error("[audit] impossible d'écrire le journal", error);
  }
}

/** Délai artificiel constant pour lisser les réponses de connexion. */
export async function constantDelay(startedAt, minimumMs = 250) {
  const elapsed = Date.now() - startedAt;
  if (elapsed < minimumMs) await new Promise((resolve) => setTimeout(resolve, minimumMs - elapsed));
}

export { randomBytes };
