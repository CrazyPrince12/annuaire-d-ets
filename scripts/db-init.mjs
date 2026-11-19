#!/usr/bin/env node
/** Applique le schéma transactionnellement. Jeu de démo sur demande explicite. */
import fs from "node:fs";
import { SCHEMA_SQL } from "../db/schema.mjs";
import { schemaStatements } from "../db/statements.mjs";
import { seedDatabase } from "../db/load.mjs";
import { databaseUrl, createRemoteDriver, classifyDatabaseError } from "../server-api/_lib/database.js";

for (const name of [".env.local", ".env"]) {
  const file = new URL(`../${name}`, import.meta.url);
  if (fs.existsSync(file)) process.loadEnvFile(file);
}

let driver;
try {
  const url = databaseUrl();
  if (!url) throw new Error("missing_url");
  driver = await createRemoteDriver(url, { timeoutMs: 45_000 });
  if (!process.argv.includes("--seed-only")) {
    const statements = schemaStatements(SCHEMA_SQL);
    await driver.batch(statements);
    console.log(`✓ Schéma appliqué (${statements.length} instructions, ${driver.mode}).`);
  }
  if (process.argv.includes("--seed-only") || process.argv.includes("--seed")) {
    const report = await seedDatabase(driver.query, { log: (message) => console.log(`  ${message}`) });
    console.log(`✓ Démo : ${report.companies} entreprises, ${report.reviews} avis, ${report.offers} offres, ${report.users} comptes.`);
  }
} catch (error) {
  const safe = classifyDatabaseError(error);
  const reason = safe.reason || (safe.message === "missing_url" ? "missing_url" : null) ||
    (/^[0-9A-Z]{5}$/.test(safe.code || "") ? safe.code : "unexpected_error");
  console.error(`✗ Initialisation impossible (${reason}). Vérifiez DATABASE_URL, la base cible et les droits du rôle.`);
  process.exitCode = 1;
} finally {
  await driver?.close();
}
