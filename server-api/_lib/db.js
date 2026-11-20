/**
 * Accès à la base de données.
 *
 * Deux modes, même code SQL :
 *   1. NEON (production) — dès que DATABASE_URL est définie : pool serverless
 *      HTTP de @neondatabase/serverless, compatible Vercel et Render.
 *   2. DÉMONSTRATION (développement local, sans DATABASE_URL) — PostgreSQL
 *      embarqué (PGlite) en mémoire, amorcé avec /data/seed. Les écritures sont
 *      perdues à l'arrêt du processus.
 *
 * Robustesse (mode Neon) :
 *   • l'URL est nettoyée (espaces, guillemets, préfixe « psql ») ;
 *   • chaque requête a un délai maximum et des nouvelles tentatives avec
 *     backoff sur les erreurs transitoires (réveil de Neon, réseau) ;
 *   • un échec de connexion n'est JAMAIS mémorisé : la requête suivante réessaie ;
 *   • base vide (tables absentes) → message actionnable (503) au lieu d'un 500
 *     opaque ; sur un serveur persistant (Render) le schéma est créé au démarrage ;
 *   • `warmUp()` réveille Neon au démarrage ; `startKeepAlive()` évite la mise en
 *     veille tant que le serveur reçoit du trafic.
 *
 * ⚠️ Pourquoi PGlite n'est PAS importé statiquement : le paquet embarque un
 * binaire WebAssembly de 13,5 Mo. Traçé par le bundler de Vercel, il était copié
 * dans **chacune** des ~40 fonctions serverless (≈ 540 Mo au total), ce qui fait
 * échouer le déploiement à l'étape « Deploying outputs… ». On le charge donc par
 * un spécificateur volontairement opaque, résolu à l'exécution : en local Node
 * le trouve dans node_modules, en production Vercel il est absent et l'on renvoie
 * une erreur explicite invitant à définir DATABASE_URL.
 */
import { SCHEMA_SQL } from "../../db/schema.mjs";

let driverPromise = null;
let demoSeedInfo = null;
let keepAliveTimer = null;
const bootstrap = { state: "idle", error: null };

/** Erreur renvoyée quand aucune base n'est joignable. */
export class DatabaseUnavailableError extends Error {
  constructor(message, { detail = "" } = {}) {
    super(message);
    this.name = "DatabaseUnavailableError";
    this.code = "db_unavailable";
    this.detail = detail;
  }
}

/**
 * `import()` volontairement non analysable : le bundler ne peut pas résoudre un
 * spécificateur calculé, donc il n'embarque pas le paquet (ni son wasm).
 */
function lazyImport(specifier) {
  return import(specifier);
}

const PGLITE_PACKAGE = ["@electric-sql", "pglite"].join("/");
const SEED_MODULE = new URL("../../db/load.mjs", import.meta.url).href;

/* -------------------------------------------------------------------------- */
/*  Configuration                                                              */
/* -------------------------------------------------------------------------- */

/** Nettoie les erreurs de copier-coller fréquentes dans les variables d'environnement. */
export function cleanDatabaseUrl(raw) {
  let url = String(raw ?? "").trim();
  url = url.replace(/^psql\s+/i, "").trim();
  url = url.replace(/^["']+|["']+$/g, "").trim();
  return url;
}

function databaseUrl() {
  return cleanDatabaseUrl(process.env.DATABASE_URL);
}

const SERVERLESS = Boolean(process.env.VERCEL);
// Budget global d'une requête SQL (Vercel Hobby coupe à 10 s) et délai par tentative.
const BUDGET_MS = Number(process.env.DB_BUDGET_MS) || (SERVERLESS ? 8500 : 30000);
const ATTEMPT_MS = Number(process.env.DB_ATTEMPT_MS) || (SERVERLESS ? 4500 : 12000);

export function databaseMode() {
  return databaseUrl() ? "neon" : "demo";
}

export function isDemoDatabase() {
  return databaseMode() === "demo";
}

export function demoSeedReport() {
  return demoSeedInfo;
}

export function bootstrapState() {
  return { ...bootstrap };
}

/* -------------------------------------------------------------------------- */
/*  Pilote                                                                     */
/* -------------------------------------------------------------------------- */

async function createDriver() {
  const url = databaseUrl();
  if (url) {
    let sql;
    try {
      const { neon, neonConfig } = await import("@neondatabase/serverless");
      try {
        neonConfig.fetchConnectionCache = true;
      } catch {
        /* option absente selon la version du pilote : sans importance */
      }
      sql = neon(url);
    } catch (error) {
      throw new DatabaseUnavailableError(
        "DATABASE_URL est invalide. Collez la chaîne de connexion Neon complète " +
          "(postgresql://…) sans guillemets ni espaces, puis redéployez.",
        { detail: String(error?.message || error) }
      );
    }
    return {
      mode: "neon",
      query: async (text, params = []) => {
        const rows = await sql.query(text, params);
        return Array.isArray(rows) ? rows : [];
      },
    };
  }

  // Mode démonstration : PostgreSQL compilé en WebAssembly, en mémoire.
  // Ce mode ne fonctionne qu'en local (le paquet n'est pas déployé).
  let PGlite;
  try {
    ({ PGlite } = await lazyImport(PGLITE_PACKAGE));
  } catch (error) {
    throw new DatabaseUnavailableError(
      "Aucune base de données n'est configurée. Définissez DATABASE_URL (Neon) " +
        "dans les variables d'environnement du projet, puis redéployez.",
      { detail: String(error?.message || error) }
    );
  }

  const pg = new PGlite();
  const query = async (text, params = []) => {
    const result = await pg.query(text, params);
    return result.rows || [];
  };
  await pg.exec(SCHEMA_SQL);
  // Le jeu de démonstration (~150 Ko) n'est chargé qu'ici, jamais en production.
  const { seedDatabase } = await lazyImport(SEED_MODULE);
  demoSeedInfo = await seedDatabase(query);
  console.info(
    `[db] Mode démonstration : ${demoSeedInfo.companies} entreprises, ${demoSeedInfo.reviews} avis, ` +
      `${demoSeedInfo.offers} offres chargés en mémoire. Définissez DATABASE_URL (Neon) pour la persistance.`
  );
  return { mode: "pglite", query };
}

export async function getDriver() {
  if (!driverPromise) {
    // Un échec n'est jamais mémorisé : sans cela, une erreur au réveil de Neon
    // rendrait l'instance inutilisable jusqu'au prochain déploiement.
    driverPromise = createDriver().catch((error) => {
      driverPromise = null;
      throw error;
    });
  }
  return driverPromise;
}

/* -------------------------------------------------------------------------- */
/*  Requêtes résilientes (Neon)                                                */
/* -------------------------------------------------------------------------- */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(Object.assign(new Error(`Délai dépassé (${ms} ms)`), { code: "DB_TIMEOUT" }));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const TRANSIENT_CODES = new Set([
  "DB_TIMEOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "57P01",
  "57P02",
  "57P03",
  "53300",
  "08000",
  "08001",
  "08003",
  "08006",
]);
const TRANSIENT_MESSAGE =
  /fetch failed|network|socket|timed? ?out|terminating connection|connection (?:terminated|closed|refused|reset)|ECONN|control plane|compute|temporarily unavailable|Error connecting to database/i;
// Erreurs survenues avant que la requête n'atteigne la base : sûres à rejouer même pour une écriture.
const CONNECT_PHASE = /^(ECONNREFUSED|ENOTFOUND|EAI_AGAIN|57P03)$/;

function errorCode(error) {
  return String(error?.code || error?.cause?.code || "");
}

function isTransient(error) {
  if (TRANSIENT_CODES.has(errorCode(error))) return true;
  return TRANSIENT_MESSAGE.test(String(error?.message || ""));
}

function isMissingSchema(error) {
  return errorCode(error) === "42P01" || /relation ".+" does not exist/i.test(String(error?.message || ""));
}

function schemaError(error) {
  const running = bootstrap.state === "running";
  return new DatabaseUnavailableError(
    running
      ? "La base de données s'initialise (première mise en route). Merci de réessayer dans une minute."
      : "La base de données est connectée mais vide. Lancez « npm run db:init » avec la même DATABASE_URL, puis rechargez la page.",
    { detail: running ? "bootstrap_running" : `schema_missing: ${String(error?.message || error)}` }
  );
}

async function runResilient(driver, text, params) {
  const idempotent = /^\s*(?:select|with|show|explain)\b/i.test(text);
  const deadline = Date.now() + BUDGET_MS;
  let attempt = 0;
  let lastError;

  for (;;) {
    attempt += 1;
    const remaining = deadline - Date.now();
    try {
      return await withTimeout(driver.query(text, params), Math.max(1000, Math.min(ATTEMPT_MS, remaining)));
    } catch (error) {
      lastError = error;
      if (isMissingSchema(error)) throw schemaError(error);
      const retryable = isTransient(error) && (idempotent || CONNECT_PHASE.test(errorCode(error)));
      const delay = 250 * 2 ** (attempt - 1);
      if (!retryable || attempt >= 4 || Date.now() + delay + 1000 > deadline) break;
      console.warn(`[db] tentative ${attempt} échouée (${error?.code || error?.message}), nouvel essai dans ${delay} ms`);
      await sleep(delay);
    }
  }

  if (isTransient(lastError)) {
    throw new DatabaseUnavailableError(
      "La base de données est momentanément lente ou injoignable. Merci de réessayer dans quelques secondes.",
      { detail: String(lastError?.message || lastError) }
    );
  }
  throw lastError;
}

/** Renvoie un tableau de lignes. */
export async function query(text, params = []) {
  const driver = await getDriver();
  if (driver.mode !== "neon") return driver.query(text, params);
  return runResilient(driver, text, params);
}

/** Renvoie la première ligne ou null. */
export async function one(text, params = []) {
  const rows = await query(text, params);
  return rows.length ? rows[0] : null;
}

/* -------------------------------------------------------------------------- */
/*  Démarrage : réveil de Neon, création du schéma si la base est vide         */
/* -------------------------------------------------------------------------- */

// Même découpage que scripts/db-init.mjs (compatible avec le pool HTTP).
function schemaStatements() {
  return SCHEMA_SQL.split(/;\s*\n/)
    .map((statement) => statement.trim())
    .filter((statement) => statement && !statement.startsWith("--"));
}

const ALREADY_EXISTS = new Set(["42P07", "42710", "42P06", "42P16"]);

async function runBootstrap(log) {
  bootstrap.state = "running";
  bootstrap.error = null;
  try {
    log.info?.("[db] base vide : création du schéma puis chargement des données…");
    for (const statement of schemaStatements()) {
      try {
        await query(statement);
      } catch (error) {
        if (!ALREADY_EXISTS.has(errorCode(error))) throw error;
      }
    }
    const { seedDatabase } = await lazyImport(SEED_MODULE);
    const report = await seedDatabase(query, { log: (message) => log.info?.(`[db] ${message}`) });
    bootstrap.state = "done";
    log.info?.(`[db] initialisation terminée : ${report.companies} entreprises, ${report.offers} offres.`);
  } catch (error) {
    bootstrap.state = "failed";
    bootstrap.error = String(error?.message || error);
    log.error?.("[db] initialisation automatique échouée :", bootstrap.error);
  }
}

/**
 * Réveille la base (Neon se met en veille après quelques minutes) et vérifie
 * que le schéma existe. Avec `bootstrap: true`, une base vide est initialisée
 * en arrière-plan (serveur persistant uniquement).
 */
export async function warmUp({ bootstrap: allowBootstrap = false, log = console } = {}) {
  if (databaseMode() !== "neon") return { ok: true, mode: databaseMode() };
  const started = Date.now();
  await query("SELECT 1 AS ok");
  const rows = await query("SELECT to_regclass('public.companies') IS NOT NULL AS ready");
  const ready = rows[0]?.ready === true || rows[0]?.ready === "t";
  if (ready) return { ok: true, mode: "neon", ready: true, ms: Date.now() - started };
  if (allowBootstrap && bootstrap.state === "idle") {
    void runBootstrap(log);
    return { ok: false, mode: "neon", ready: false, bootstrap: "running" };
  }
  return { ok: false, mode: "neon", ready: false, bootstrap: bootstrap.state };
}

/** Ping périodique : évite la mise en veille de Neon tant que le serveur est actif. */
export function startKeepAlive(intervalMs = 4 * 60_000) {
  if (keepAliveTimer || databaseMode() !== "neon") return;
  keepAliveTimer = setInterval(() => {
    query("SELECT 1").catch(() => null);
  }, intervalMs);
  keepAliveTimer.unref?.();
}

/* -------------------------------------------------------------------------- */
/*  Réglages du site (cache mémoire 30 s)                                      */
/* -------------------------------------------------------------------------- */
let settingsCache = { at: 0, value: null };

export async function getSettings({ force = false } = {}) {
  const now = Date.now();
  if (!force && settingsCache.value && now - settingsCache.at < 30000) {
    return settingsCache.value;
  }
  const rows = await query("SELECT key, value FROM settings");
  const value = {};
  for (const row of rows) value[row.key] = row.value;
  // Valeurs par défaut si la base a été vidée.
  value.site_name ||= "CONGLOMERAT";
  value.min_reviews_for_rating ||= 3;
  value.min_reviews_for_ranking ||= 5;
  value.payment_mode ||= "demo";
  value.features ||= {};
  settingsCache = { at: now, value };
  return value;
}

export async function setSetting(key, value) {
  await query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, JSON.stringify(value)]
  );
  settingsCache = { at: 0, value: null };
}

/** Utilisé par /api/health, le script d'installation et les tests. */
export async function healthCheck() {
  const started = Date.now();
  try {
    const rows = await query("SELECT COUNT(*)::int AS companies FROM companies");
    return {
      ok: true,
      mode: databaseMode(),
      companies: rows[0]?.companies ?? 0,
      latencyMs: Date.now() - started,
      bootstrap: bootstrap.state,
    };
  } catch (error) {
    return {
      ok: false,
      mode: error?.code === "db_unavailable" ? "unconfigured" : databaseMode(),
      error: String(error?.message || error),
      code: error?.code || null,
      latencyMs: Date.now() - started,
      bootstrap: bootstrap.state,
    };
  }
}
