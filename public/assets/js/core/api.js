/**
 * Client HTTP des fonctions /api.
 *
 * • une seule enveloppe de réponse côté serveur : `{ ok, data }` / `{ ok, error }`
 * • délai maximum, nouvelle tentative unique sur les GET (réseau, 502/503/504), annulation
 * • les statistiques (/events) partent en `keepalive` et sont rejouées une fois
 * • cache mémoire court pour les appels de lecture (accueil, méta, filtres)
 * • erreurs typées (`ApiError`) avec `status`, message traduit côté appelant
 */

import { t } from "./i18n.js";

const BASE = "/api";
// Au-dessus du budget serveur (8,5 s sur Vercel, 30 s sur Render) pour laisser
// le temps à Neon de se réveiller au lieu d'abandonner trop tôt.
const DEFAULT_TIMEOUT = 20_000;
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const RETRY_DELAY_MS = 900;

export class ApiError extends Error {
  constructor(message, { status = 0, code = "error", details = null, offline = false } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.offline = offline || status === 0;
  }
}

/** Cache mémoire : chemin + query → { expires, value }. */
const cache = new Map();

export function invalidate(prefix = "") {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}

export function buildUrl(path, params) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  if (!params) return url;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    if (Array.isArray(value)) value.forEach((v) => v !== "" && search.append(key, v));
    else search.append(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * Requête JSON.
 * @param {string} path chemin relatif à /api (« /companies »)
 * @param {{method?:string, body?:any, params?:object, timeout?:number, cacheMs?:number,
 *          signal?:AbortSignal, retry?:boolean, keepalive?:boolean}} [options]
 */
export async function request(path, options = {}) {
  const {
    method = "GET",
    body,
    params,
    timeout = DEFAULT_TIMEOUT,
    cacheMs = 0,
    signal,
    retry = method === "GET" || path === "/events",
    keepalive = path === "/events",
  } = options;

  const url = buildUrl(path, params);
  const cacheKey = `${method} ${url}`;

  if (cacheMs > 0) {
    const hit = cache.get(cacheKey);
    if (hit && hit.expires > Date.now()) return hit.value;
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const hit = cache.get(cacheKey);
    if (hit) return hit.value;
    throw new ApiError(t("common.errorNetwork"), { code: "offline", offline: true });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), timeout);
  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: method === "GET" ? "no-cache" : "no-store",
      // Les statistiques survivent à un changement de page (clic sur « Appeler », etc.).
      keepalive: keepalive && method !== "GET",
    });
  } catch (err) {
    clearTimeout(timer);
    if (signal?.aborted) throw err;
    if (retry) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return request(path, { ...options, retry: false });
    }
    const aborted = err?.name === "AbortError" || err?.name === "TimeoutError";
    throw new ApiError(t(aborted ? "common.errorGeneric" : "common.errorNetwork"), {
      code: aborted ? "timeout" : "network",
    });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }

  // Base qui se réveille ou instance qui démarre : une seconde chance suffit presque toujours.
  if (retry && RETRYABLE_STATUS.has(response.status)) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return request(path, { ...options, retry: false });
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload || payload.ok === false) {
    const message = (payload && (payload.error || payload.message)) || `HTTP ${response.status}`;
    throw new ApiError(message, {
      status: response.status,
      code: payload?.code || payload?.details?.code || "server",
      details: payload?.details ?? null,
    });
  }

  const value = payload.data !== undefined ? payload.data : payload;
  if (cacheMs > 0) {
    cache.set(cacheKey, { expires: Date.now() + cacheMs, value });
    // On garde aussi une copie « hors ligne » plus longue (5 min).
    if (!cache.has(`${cacheKey}#offline`)) {
      cache.set(`${cacheKey}#offline`, { expires: Date.now() + 300_000, value });
    }
  }
  return value;
}

export const get = (path, options) => request(path, { ...options, method: "GET" });
export const post = (path, body, options) => request(path, { ...options, method: "POST", body });
export const patch = (path, body, options) => request(path, { ...options, method: "PATCH", body });
export const del = (path, body, options) => request(path, { ...options, method: "DELETE", body });

/* --------------------------------------------------------------- session */

let sessionPromise = null;

/** Session courante (mise en cache pour la durée de la page). */
export async function session({ force = false } = {}) {
  if (!sessionPromise || force) {
    sessionPromise = get("/auth", { cacheMs: 0 }).catch((err) => {
      sessionPromise = null;
      throw err;
    });
  }
  return sessionPromise;
}

export function clearSession() {
  sessionPromise = null;
}

export async function login(email, password) {
  const data = await post("/auth", { action: "login", email, password });
  clearSession();
  return data;
}

export async function register(payload) {
  const data = await post("/auth", { action: "register", ...payload });
  clearSession();
  return data;
}

export async function logout() {
  try {
    await post("/auth", { action: "logout" });
  } finally {
    clearSession();
    invalidate();
  }
}

/** `true` si l'utilisateur dispose de l'une des permissions demandées. */
export function can(user, permission) {
  if (!user) return false;
  const perms = user.permissions || [];
  if (perms.includes("*") || user.role === "super_admin") return true;
  return perms.includes(permission);
}

export default { request, get, post, patch, del, session, login, register, logout, invalidate, can, ApiError };
