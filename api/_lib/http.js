/**
 * Helpers HTTP partagés par toutes les fonctions /api.
 * Compatible Vercel (runtime Node) et le serveur de développement local.
 */

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function ok(res, data, status = 200) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({ ok: true, data }));
}

export function fail(res, status, message, details) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({ ok: false, error: message, details: details ?? null }));
}

export function requireMethod(req, res, methods) {
  const allowed = Array.isArray(methods) ? methods : [methods];
  if (!allowed.includes(req.method)) {
    res.setHeader("Allow", allowed.join(", "));
    fail(res, 405, "Méthode non autorisée.");
    return false;
  }
  return true;
}

export async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      throw new HttpError(400, "Corps de requête JSON invalide.");
    }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  if (raw.length > 512 * 1024) throw new HttpError(413, "Requête trop volumineuse.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Corps de requête JSON invalide.");
  }
}

export function getIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded || "")
    .split(",")[0]
    .trim() || req.socket?.remoteAddress || "0.0.0.0";
  return ip;
}

/** Empreinte courte pour les journaux : jamais l'adresse complète. */
export function ipPrefix(ip) {
  const parts = String(ip).split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.x.x`;
  return String(ip).slice(0, 8);
}

/* -------------------------------------------------------------------------- */
/*  Limitation de débit en mémoire (par instance de fonction)                  */
/* -------------------------------------------------------------------------- */
const buckets = new Map();

export function rateLimit(key, { max = 30, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1 };
  }
  entry.count += 1;
  if (buckets.size > 5000) {
    for (const [bucketKey, value] of buckets) {
      if (value.resetAt < now) buckets.delete(bucketKey);
    }
  }
  return { allowed: entry.count <= max, remaining: Math.max(0, max - entry.count) };
}

export function enforceRateLimit(key, options) {
  const result = rateLimit(key, options);
  if (!result.allowed) {
    throw new HttpError(429, "Trop de requêtes. Merci de réessayer dans une minute.");
  }
  return result;
}

/**
 * Protection CSRF simple : pour toute écriture, l'origine (si présente) doit
 * correspondre à l'hôte de la requête. Les cookies sont déjà SameSite=Lax.
 */
export function checkSameOrigin(req) {
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) return;
  const origin = req.headers.origin;
  if (!origin) return; // Requêtes natives sans Origin (curl, tests) : acceptées.
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  try {
    const originHost = new URL(origin).host;
    if (host && originHost !== host) {
      throw new HttpError(403, "Origine non autorisée.");
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(403, "Origine invalide.");
  }
}

/** Wrapper : capture les erreurs et renvoie une réponse JSON propre. */
/**
 * Sur Vercel (runtime Node), `req.url` contient la requête complète mais
 * `req.query` n'existe pas. On le reconstruit ici pour que toutes les routes
 * puissent lire `req.query` de façon uniforme, comme en développement.
 */
function ensureQuery(req) {
  if (req.query && typeof req.query === "object") return;
  const host = req.headers?.host || "localhost";
  const url = new URL(req.url || "/", `http://${host}`);
  const query = {};
  for (const [key, value] of url.searchParams) {
    if (key in query) {
      query[key] = Array.isArray(query[key]) ? [...query[key], value] : [query[key], value];
    } else {
      query[key] = value;
    }
  }
  req.query = query;
}

export function handler(fn) {
  return async function wrapped(req, res) {
    try {
      ensureQuery(req);
      checkSameOrigin(req);
      await fn(req, res);
    } catch (error) {
      if (error instanceof HttpError) {
        fail(res, error.status, error.message, error.details);
        return;
      }
      console.error("[api] erreur inattendue", error);
      if (!res.headersSent) {
        fail(res, 500, "Une erreur est survenue de notre côté. Merci de réessayer.");
      } else {
        res.end();
      }
    }
  };
}

/** Parseur de paramètres d'URL (filtres de recherche partagés). */
export function parseFilters(query = {}) {
  const list = (value) =>
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  const bool = (value) => value === "1" || value === "true" || value === "on";
  return {
    q: String(query.q || "").trim().slice(0, 120),
    cities: list(query.ville || query.cities),
    neighborhoods: list(query.quartier || query.neighborhoods),
    sectors: list(query.secteur || query.sectors),
    sizes: list(query.taille || query.sizes),
    contracts: list(query.contrat || query.contracts),
    verification: String(query.verif || query.verification || ""),
    hiring: bool(query.recrute || query.hiring),
    internships: bool(query.stage || query.internships),
    openNow: bool(query.ouvert || query.openNow),
    minRating: Number(query.note || query.minRating || 0) || 0,
    addedDays: Number(query.ajout || query.addedDays || 0) || 0,
    language: String(query.langue || query.language || ""),
    sort: String(query.tri || query.sort || "pertinence"),
    view: String(query.vue || query.view || "grille"),
    lat: Number.isFinite(Number(query.lat)) ? Number(query.lat) : undefined,
    lng: Number.isFinite(Number(query.lng)) ? Number(query.lng) : undefined,
    page: Math.max(1, Number.parseInt(query.page || "1", 10) || 1),
    perPage: Math.min(48, Math.max(6, Number.parseInt(query.limite || query.perPage || "24", 10) || 24)),
  };
}

export function publicOrigin(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "conglomerat.cm";
  const proto = req.headers["x-forwarded-proto"] || (String(host).includes("localhost") ? "http" : "https");
  return process.env.SITE_URL || `${proto}://${host}`;
}
