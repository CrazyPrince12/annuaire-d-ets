/** Connexion distante ou démonstration ; PGlite différé et non tracé pour Vercel. */
import { SCHEMA_SQL } from "../../db/schema.mjs";
import { databaseUrl, resolveDatabase, createRemoteDriver, classifyDatabaseError, DatabaseUnavailableError } from "./database.js";

let driverPromise = null;
let demoSeedInfo = null;

const lazyImport = (specifier) => import(specifier);
const PGLITE_PACKAGE = ["@electric-sql", "pglite"].join("/");
const SEED_MODULE = new URL("../../db/load.mjs", import.meta.url).href;

export function databaseMode() {
  const url = databaseUrl();
  if (!url) {
    const persistenceRequired = /^(1|true)$/i.test(process.env.DATABASE_REQUIRED?.trim() || "");
    const canDemo = !process.env.VERCEL && !persistenceRequired &&
      (process.env.RENDER || process.env.NODE_ENV !== "production");
    return canDemo ? "demo" : "unconfigured";
  }
  try { return resolveDatabase(url); } catch { return "invalid"; }
}

export const isDemoDatabase = () => databaseMode() === "demo";
export const demoSeedReport = () => demoSeedInfo;

async function createDriver() {
  const url = databaseUrl();
  if (url) return createRemoteDriver(url);
  if (!isDemoDatabase()) throw new DatabaseUnavailableError("missing_url");
  const { PGlite } = await lazyImport(PGLITE_PACKAGE);
  const pg = new PGlite();
  const query = async (text, params = []) => (await pg.query(text, params)).rows;
  try {
    await pg.exec(SCHEMA_SQL);
    const { seedDatabase } = await lazyImport(SEED_MODULE);
    demoSeedInfo = await seedDatabase(query);
    console.info(`[db] Démonstration : ${demoSeedInfo.companies} entreprises chargées en mémoire.`);
    return { mode: "pglite", transport: "pglite", query, read: query };
  } catch (error) {
    await pg.close().catch(() => {});
    throw error;
  }
}

export async function getDriver() {
  driverPromise ??= createDriver().catch((error) => {
    driverPromise = null;
    throw error;
  });
  return driverPromise;
}

export async function query(text, params = []) {
  try {
    return await (await getDriver()).query(text, params);
  } catch (error) {
    throw classifyDatabaseError(error);
  }
}

/** Seules les lectures explicites peuvent être rejouées sur un autre transport. */
export async function read(text, params = []) {
  try {
    return await (await getDriver()).read(text, params);
  } catch (error) {
    throw classifyDatabaseError(error);
  }
}

export async function readBatch(statements) {
  try {
    const driver = await getDriver();
    if (driver.readBatch) return await driver.readBatch(statements);
    return await Promise.all(statements.map(([text, params]) => driver.read(text, params)));
  } catch (error) {
    throw classifyDatabaseError(error);
  }
}

export async function one(text, params = []) {
  return (await query(text, params))[0] ?? null;
}

export async function readOne(text, params = []) {
  return (await read(text, params))[0] ?? null;
}

let settingsCache = { at: 0, value: null, pending: null };

export async function getSettings() {
  const cache = settingsCache;
  if (cache.value && Date.now() - cache.at < 30_000) return cache.value;
  cache.pending ??= read("SELECT key, value FROM settings").then((rows) => {
    cache.value = Object.assign({
      site_name: "CONGLOMERAT", min_reviews_for_rating: 3,
      min_reviews_for_ranking: 5, payment_mode: "demo", features: {},
    }, Object.fromEntries(rows.map((row) => [row.key, row.value])));
    cache.at = Date.now();
    return cache.value;
  }).finally(() => { cache.pending = null; });
  return cache.pending;
}

export async function setSetting(key, value) {
  await query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, JSON.stringify(value)]
  );
  settingsCache = { at: 0, value: null, pending: null };
}

export async function healthCheck() {
  const mode = databaseMode();
  try {
    const row = await readOne(`SELECT (SELECT COUNT(*)::int FROM companies) AS companies,
      to_regclass('settings') IS NOT NULL AND to_regclass('company_events') IS NOT NULL
        AND to_regclass('job_offers') IS NOT NULL AND to_regclass('reviews') IS NOT NULL AS ready`);
    const { transport } = await getDriver();
    if (!row?.ready) return { ok: false, mode, transport, code: "schema_missing" };
    return { ok: true, mode, transport, companies: row.companies };
  } catch (error) {
    return { ok: false, mode, code: error.reason || "database_error", retryable: error.retryable === true };
  }
}
