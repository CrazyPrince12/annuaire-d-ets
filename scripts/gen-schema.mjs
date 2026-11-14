/**
 * Génère db/schema.mjs à partir de db/schema.sql.
 *
 * Pourquoi deux fichiers ? Le SQL lisible reste dans schema.sql (lisible par
 * psql et par un humain), et la fonction serverless embarque la version
 * JavaScript pour ne pas dépendre de la présence d'un fichier au runtime.
 *
 *   node scripts/gen-schema.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlPath = path.join(root, "db", "schema.sql");
const outPath = path.join(root, "db", "schema.mjs");

export function renderSchemaModule(sql) {
  if (sql.includes("`") || sql.includes("${")) {
    throw new Error("Le schéma contient un caractère incompatible avec un template literal.");
  }
  return `// GÉNÉRÉ AUTOMATIQUEMENT depuis db/schema.sql — ne pas modifier à la main.
// Regénérer : node scripts/gen-schema.mjs
export const SCHEMA_SQL = \`${sql}\`;

export default SCHEMA_SQL;
`;
}

export function generateSchemaModule({ silent = false } = {}) {
  const sql = fs.readFileSync(sqlPath, "utf8");
  const output = renderSchemaModule(sql);
  const previous = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : "";
  if (previous !== output) fs.writeFileSync(outPath, output);
  if (!silent) console.log(`db/schema.mjs ${previous === output ? "déjà à jour" : "régénéré"}`);
  return { changed: previous !== output, output, previous };
}

if (process.argv[1] && process.argv[1].endsWith("gen-schema.mjs")) {
  generateSchemaModule();
}
