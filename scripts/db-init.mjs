#!/usr/bin/env node
/**
 * Installation de la base Neon : schéma + données.
 *   npm run db:init            → crée/met à jour les tables puis charge les données
 *   npm run db:init --seed-only → recharge seulement les données
 *
 * Nécessite DATABASE_URL (Neon). Sans DATABASE_URL, le script explique la
 * marche à suivre et s'arrête proprement.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA_SQL } from "../db/schema.mjs";
import { seedDatabase } from "../db/load.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!process.env[key.trim()]) {
      process.env[key.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv(path.join(root, ".env.local"));
loadEnv(path.join(root, ".env"));

const seedOnly = process.argv.includes("--seed-only");

if (!process.env.DATABASE_URL) {
  console.error(`
Aucune base configurée.

1. Créez un projet sur https://neon.tech (offre gratuite suffisante).
2. Copiez la chaîne de connexion « Pooled connection ».
3. Ajoutez-la dans .env.local puis sur Vercel :
     DATABASE_URL=postgresql://…?sslmode=require
4. Relancez : npm run db:init

Sans DATABASE_URL, le site démarre en mode démonstration (base en mémoire) :
pratique pour tester, mais rien n'est conservé entre deux démarrages.
`);
  process.exit(1);
}

const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const query = async (text, params = []) => {
  const rows = await sql.query(text, params);
  return Array.isArray(rows) ? rows : [];
};

console.log("→ connexion à Neon…");
const version = await query("SELECT version() AS version");
console.log(`  ${String(version[0].version).split(",")[0]}`);

if (!seedOnly) {
  console.log("→ application du schéma (db/schema.sql)…");
  // On exécute le SQL par instructions pour rester compatible avec le pool HTTP.
  const statements = SCHEMA_SQL.split(/;\s*\n/)
    .map((statement) => statement.trim())
    .filter((statement) => statement && !statement.startsWith("--"));
  let applied = 0;
  for (const statement of statements) {
    try {
      await sql.query(statement);
      applied += 1;
    } catch (error) {
      console.error("\n✗ Échec sur :", statement.slice(0, 120), "\n ", error.message);
      process.exit(1);
    }
  }
  console.log(`  ${applied} instructions appliquées.`);
}

console.log("→ chargement des données…");
const report = await seedDatabase(query, { log: (message) => console.log(`  ${message}`) });
console.log(`\n✓ Terminé : ${report.companies} entreprises, ${report.reviews} avis, ${report.offers} offres, ${report.users} comptes.`);
console.log(`
Comptes de démonstration :
  utilisateur : demo@conglomerat.cm / Demo!2026conglomerat
  entreprise  : entrepriseconglomerat@conglomerat.cm / Entreprise!2026
  modérateur  : moderateur@conglomerat.cm / Moderateur!2026
  administrateur : voir credentials.js (page /login)
`);
