/**
 * Accès à la base de données.
 *
 * Deux modes, même code SQL :
 *   1. NEON (production) — dès que DATABASE_URL est définie : pool serverless
 *      HTTP de @neondatabase/serverless, compatible Vercel.
 *   2. DÉMONSTRATION (développement local, sans DATABASE_URL) — PostgreSQL
 *      embarqué (PGlite) en mémoire, amorcé avec /data/seed. Les écritures sont
 *      perdues à l'arrêt du processus.
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

export function databaseMode() {
  return process.env.DATABASE_URL ? "neon" : "demo";
}

export function isDemoDatabase() {
  return databaseMode() === "demo";
}

export function demoSeedReport() {
  return demoSeedInfo;
}

async function createDriver() {
  if (process.env.DATABASE_URL) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL);
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
  if (!driverPromise) driverPromise = createDriver();
  return driverPromise;
}

/** Renvoie un tableau de lignes. */
export async function query(text, params = []) {
  const driver = await getDriver();
  return driver.query(text, params);
}

/** Renvoie la première ligne ou null. */
export async function one(text, params = []) {
  const rows = await query(text, params);
  return rows.length ? rows[0] : null;
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

/** Utilisé par le script d'installation et les tests. */
export async function healthCheck() {
  try {
    const rows = await query("SELECT COUNT(*)::int AS companies FROM companies");
    return { ok: true, mode: databaseMode(), companies: rows[0]?.companies ?? 0 };
  } catch (error) {
    return {
      ok: false,
      mode: error?.code === "db_unavailable" ? "unconfigured" : databaseMode(),
      error: String(error?.message || error),
      code: error?.code || null,
    };
  }
}
