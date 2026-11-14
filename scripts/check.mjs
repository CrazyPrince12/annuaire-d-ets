#!/usr/bin/env node
/**
 * `npm run check` — vérifications statiques du projet, sans réseau ni navigateur.
 *
 * Contrôles :
 *   1. JSON lisible (package.json, vercel.json, manifest).
 *   2. Syntaxe de tous les fichiers JS (`node --check`).
 *   3. Cohérence des réécritures : chaque destination existe.
 *   4. Chaque page HTML porte `data-page`, un module connu dans `app.js`, un titre,
 *      une description et les feuilles de style.
 *   5. Clés i18n : toutes utilisées existent en FR **et** en EN, sans doublon.
 *   6. Icônes utilisées présentes dans le jeu généré.
 *   7. Imports statiques : les chemins relatifs existent.
 *   8. Le schéma SQL généré (`db/schema.mjs`) contient toutes les tables du `.sql`.
 *   9. Aucun texte de remplissage (« lorem ipsum », « TODO », « à compléter »).
 *  10. Poids des fonctions : aucun paquet lourd (PGlite, sharp) importé
 *      statiquement depuis `api/`, sinon Vercel copie 13 Mo de wasm dans
 *      chaque fonction et le déploiement casse à « Deploying outputs… ».
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const SKIP_DIRS = new Set(["vendor", "fonts", "img", "node_modules"]);

const errors = [];
const warnings = [];
const checks = [];

function check(label, fn) {
  const before = errors.length;
  try {
    const detail = fn();
    checks.push({ label, ok: errors.length === before, detail });
  } catch (error) {
    errors.push(`${label} : ${error.message}`);
    checks.push({ label, ok: false, detail: null });
  }
}

function walk(dir, callback) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, callback);
    else callback(full);
  }
}

const rel = (file) => path.relative(ROOT, file);

/* --------------------------------------------------------------- 1. JSON */
check("JSON valide", () => {
  const files = ["package.json", "vercel.json", "public/manifest.webmanifest"];
  for (const file of files) {
    try {
      JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
    } catch (error) {
      errors.push(`${file} : JSON invalide (${error.message})`);
    }
  }
  return `${files.length} fichiers`;
});

/* ------------------------------------------------------------ 2. Syntaxe */
const jsFiles = [];
walk(PUBLIC, (file) => {
  if (file.endsWith(".js") && !file.endsWith("sw.js")) jsFiles.push(file);
});
walk(path.join(ROOT, "server-api"), (file) => {
  if (file.endsWith(".js")) jsFiles.push(file);
});
walk(path.join(ROOT, "scripts"), (file) => {
  if (file.endsWith(".js") || file.endsWith(".mjs")) jsFiles.push(file);
});
for (const file of [path.join(ROOT, "server.js"), path.join(ROOT, "credentials.js"), path.join(ROOT, "db/schema.mjs"), path.join(ROOT, "db/load.mjs")]) {
  if (fs.existsSync(file)) jsFiles.push(file);
}
check("Syntaxe JavaScript", () => {
  for (const file of jsFiles) {
    try {
      execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    } catch (error) {
      const stderr = String(error.stderr || "").split("\n").slice(0, 4).join(" ");
      errors.push(`${rel(file)} : ${stderr || "syntaxe invalide"}`);
    }
  }
  return `${jsFiles.length} fichiers`;
});

/* --------------------------------------------------------- 3. Réécritures */
check("Routage Express / Vercel", () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
  if (config.framework === "express") {
    if (fs.existsSync(path.join(ROOT, "api"))) errors.push("Le dossier api déploierait des fonctions supplémentaires.");
    if (config.outputDirectory) errors.push("Express ne doit pas définir outputDirectory.");
    return "application server.js ; pages et API testées par npm test";
  }
  let count = 0;
  for (const rule of config.rewrites || []) {
    const destination = rule.destination.split("?")[0];
    if (destination.startsWith("/api/")) {
      const base = destination.replace(/^\/api\//, "");
      const candidates = [
        path.join(ROOT, "server-api", `${base}.js`),
        path.join(ROOT, "server-api", base, "index.js"),
      ];
      if (!candidates.some((file) => fs.existsSync(file))) {
        errors.push(`réécriture ${rule.source} → ${rule.destination} : fonction absente`);
      }
    } else if (!fs.existsSync(path.join(PUBLIC, destination.replace(/^\//, "")))) {
      errors.push(`réécriture ${rule.source} → ${rule.destination} : fichier absent`);
    }
    count += 1;
  }
  // Les pages publiques (hors index) doivent être joignables par une réécriture.
  const sources = new Set((config.rewrites || []).map((rule) => rule.destination.split("?")[0]));
  for (const file of fs.readdirSync(PUBLIC).filter((name) => name.endsWith(".html"))) {
    if (["index.html", "404.html"].includes(file)) continue;
    if (!sources.has(`/${file}`)) warnings.push(`page sans réécriture : /${file}`);
  }
  return `${count} règles`;
});

/* --------------------------------------------------------------- 4. Pages */
const PAGES_SOURCE = fs.readFileSync(path.join(PUBLIC, "assets/js/core/app.js"), "utf8");
const pageKeys = new Set(
  [...PAGES_SOURCE.matchAll(/^\s{2}([a-zA-Z]+):\s*\(\)\s*=>\s*import\(/gm)].map((match) => match[1])
);

const htmlFiles = fs.readdirSync(PUBLIC).filter((name) => name.endsWith(".html"));
check("Coquilles HTML", () => {
  const LIGHT_PAGES = new Set(["404.html", "hors-ligne.html"]);
for (const name of htmlFiles) {
    const file = path.join(PUBLIC, name);
    const src = fs.readFileSync(file, "utf8");
    const page = (src.match(/data-page="([^"]*)"/) || [])[1];
    if (page === undefined) {
      errors.push(`${name} : attribut data-page manquant`);
      continue;
    }
    if (page && !pageKeys.has(page)) {
      errors.push(`${name} : data-page="${page}" absent de app.js`);
    }
    const required = LIGHT_PAGES.has(name)
      ? [/<title>[^<]{8,}<\/title>/, /name="description"[\s\S]{0,40}?content="[^"]{20,}"/]
      : [
      /<title>[^<]{8,}<\/title>/,
      /name="description"[\s\S]{0,40}?content="[^"]{40,}"/,
      /rel="canonical"/,
      /href="\/manifest\.webmanifest"/,
      /assets\/css\/pages\.css/,
      /cg\.theme/,
      /class="site-header"/,
      /class="site-footer"/,
      /assets\/js\/core\/app\.js/,
    ];
    for (const pattern of required) {
      if (!pattern.test(src)) errors.push(`${name} : motif manquant ${pattern}`);
    }
    if (page && !src.includes(`data-page="${page}"`)) errors.push(`${name} : module incohérent`);
  }
  return `${htmlFiles.length} pages`;
});

/* -------------------------------------------------------------- 6. Icônes */
check("Icônes", () => {
  const iconsSource = fs.readFileSync(path.join(PUBLIC, "assets/js/core/icons.js"), "utf8");
  const names = new Set([...iconsSource.matchAll(/^\s{2}([a-zA-Z0-9]+):/gm)].map((m) => m[1]));
  const used = new Map();
  walk(path.join(PUBLIC, "assets/js"), (file) => {
    if (file.includes("icons.js")) return;
    const src = fs.readFileSync(file, "utf8");
    for (const match of src.matchAll(/icon\(\s*"([a-zA-Z0-9-]+)"/g)) used.set(match[1], rel(file));
  });
  for (const file of htmlFiles) {
    const src = fs.readFileSync(path.join(PUBLIC, file), "utf8");
    for (const match of src.matchAll(/data-icon="([a-zA-Z0-9-]+)"/g)) used.set(match[1], file);
  }
  for (const [name, where] of used) {
    const key = name.replace(/-(.)/g, (_, c) => c.toUpperCase());
    if (!names.has(key)) errors.push(`icône inconnue « ${name} » (${where})`);
  }
  // La clé `x` doit rester la croix de fermeture de Lucide, pas le logo du
  // réseau social : sinon tous les boutons « quitter » affichent la marque.
  const xBlock = iconsSource.match(/^\s{2}x:\s*\n\s*'([^']+)'/m)?.[1] || "";
  if (!xBlock.includes("M18 6 6 18")) {
    errors.push("icons.js : la clé « x » n'est plus la croix de fermeture (marque X nommée xBrand ?)");
  }
  if (!iconsSource.includes("\n  xBrand:")) {
    errors.push("icons.js : clé « xBrand » absente — relancez `npm run icons`");
  }
  return `${used.size} icônes utilisées / ${names.size} disponibles`;
});

/* ------------------------------------------------------------ 7. Imports */
check("Imports relatifs", () => {
  let count = 0;
  walk(path.join(PUBLIC, "assets/js"), (file) => {
    if (!file.endsWith(".js")) return;
    const src = fs.readFileSync(file, "utf8");
    for (const match of src.matchAll(/from\s+"(\.[^"]+)"/g)) {
      const target = path.resolve(path.dirname(file), match[1]);
      if (!fs.existsSync(target)) errors.push(`${rel(file)} : import introuvable ${match[1]}`);
      count += 1;
    }
  });
  return `${count} imports`;
});

/* ------------------------------------------------------------ 8. Schéma */
check("Schéma SQL", () => {
  const sql = fs.readFileSync(path.join(ROOT, "db/schema.sql"), "utf8");
  const generated = fs.readFileSync(path.join(ROOT, "db/schema.mjs"), "utf8");
  const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
  for (const table of tables) {
    if (!generated.includes(table)) errors.push(`db/schema.mjs : table ${table} absente (relancer npm run db:schema ?)`);
  }
  if (generated.length < sql.length * 0.8) {
    errors.push("db/schema.mjs semble tronqué : relancez `node scripts/gen-schema.mjs`");
  }
  return `${tables.length} tables`;
});

/* ------------------------------------------------------- 9. Textes bidon */
check("Aucun texte de remplissage", () => {
  const banned = [/lorem ipsum/i, /\bTODO\b/, /\bFIXME\b/, /à compléter/i, /coming soon/i, /xxxx/i];
  for (const file of htmlFiles) {
    const src = fs.readFileSync(path.join(PUBLIC, file), "utf8");
    for (const pattern of banned) {
      if (pattern.test(src)) errors.push(`${file} : texte de remplissage (${pattern})`);
    }
  }
  return "ok";
});

/* --------------------------------------------------- Contrôle i18n détaillé */
const { MESSAGES } = await import(path.join(PUBLIC, "assets/js/core/i18n.js"));
const fr = MESSAGES.fr || {};
const en = MESSAGES.en || {};

function collectUsedKeys() {
  const used = new Map();
  const add = (key, where) => {
    if (!used.has(key)) used.set(key, new Set());
    used.get(key).add(where);
  };
  for (const file of htmlFiles) {
    const src = fs.readFileSync(path.join(PUBLIC, file), "utf8");
    for (const match of src.matchAll(/data-i18n(?:-placeholder|-title|-aria|-html)?="([^"]+)"/g)) {
      add(match[1], file);
    }
  }
  walk(path.join(PUBLIC, "assets/js"), (file) => {
    const src = fs.readFileSync(file, "utf8");
    for (const match of src.matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g)) add(match[1], rel(file));
  });
  return used;
}

const usedKeys = collectUsedKeys();
const dynamicFamilies = new Set();
walk(path.join(PUBLIC, "assets/js"), (file) => {
  const src = fs.readFileSync(file, "utf8");
  for (const match of src.matchAll(/\bt\(\s*`([a-zA-Z0-9_.]+)\.\$\{/g)) dynamicFamilies.add(match[1]);
});

check("Clés i18n (FR + EN)", () => {
  for (const [key, where] of usedKeys) {
    if (!(key in fr)) errors.push(`i18n FR manquante : ${key} (${[...where].join(", ")})`);
    if (!(key in en)) errors.push(`i18n EN manquante : ${key} (${[...where].join(", ")})`);
  }
  for (const family of dynamicFamilies) {
    const inFr = Object.keys(fr).filter((key) => key.startsWith(`${family}.`));
    if (!inFr.length) errors.push(`i18n : famille dynamique vide « ${family}.* »`);
    for (const key of inFr) {
      if (!(key in en)) errors.push(`i18n EN manquante : ${key}`);
    }
  }
  const missingFr = Object.keys(en).filter((key) => !(key in fr));
  for (const key of missingFr) warnings.push(`clé EN sans équivalent FR : ${key}`);
  return `${usedKeys.size} clés utilisées · ${Object.keys(fr).length} FR · ${Object.keys(en).length} EN`;
});

check("Doublons de clés i18n", () => {
  const source = fs.readFileSync(path.join(PUBLIC, "assets/js/core/i18n.js"), "utf8");
  const blocks = source.split(/\n  en: \{/);
  for (const [index, block] of blocks.entries()) {
    const seen = new Set();
    for (const match of block.matchAll(/^\s{4}"([a-zA-Z0-9_.]+)":/gm)) {
      if (seen.has(match[1])) errors.push(`clé dupliquée dans le bloc ${index === 0 ? "FR" : "EN"} : ${match[1]}`);
      seen.add(match[1]);
    }
  }
  return "ok";
});

/* ------------------------------------------- 10. Poids des fonctions */
check("Poids des fonctions serverless", () => {
  // PGlite embarque postgres.wasm (8 Mo) + postgres.data (5,4 Mo) et sharp des
  // binaires natifs : cités littéralement dans une fonction, le bundler les
  // recopie dans chaque fonction (≈ 540 Mo) et Vercel échoue à l'étape
  // « Deploying outputs… ». On les charge donc via un spécificateur calculé
  // (cf. api/_lib/db.js) : aucun littéral ne doit subsister dans api/.
  const heavy = ["@electric-sql/pglite", "sharp"];
  const files = [];
  const collect = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) collect(full);
      else if (entry.name.endsWith(".js")) files.push(full);
    }
  };
  collect(path.join(ROOT, "server-api"));
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    for (const name of heavy) {
      const quoted = [`"${name}"`, `'${name}'`];
      if (quoted.some((needle) => src.includes(needle))) {
        errors.push(`${rel(file)} : ${name} cité littéralement — utilisez un spécificateur calculé (cf. api/_lib/db.js)`);
      }
    }
  }
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
  for (const [pattern, options] of Object.entries(config.functions || {})) {
    if ((options.maxDuration || 0) > 10) {
      errors.push(`vercel.json : maxDuration ${options.maxDuration} pour ${pattern} dépasse la limite Hobby (10 s)`);
    }
  }
  return `${files.length} fichiers api/`;
});

/* -------------------------------------------------------------- Résultats */
const failed = checks.filter((item) => !item.ok);
console.log("\nCONGLOMERAT — vérifications\n");
for (const item of checks) {
  const status = item.ok ? "✓" : "✗";
  console.log(`  ${status} ${item.label}${item.detail ? ` — ${item.detail}` : ""}`);
}

if (warnings.length) {
  console.log(`\n  ${warnings.length} avertissement(s) :`);
  for (const warning of warnings.slice(0, 20)) console.log(`    · ${warning}`);
  if (warnings.length > 20) console.log(`    · … et ${warnings.length - 20} autres`);
}

if (errors.length) {
  console.log(`\n  ${errors.length} erreur(s) :`);
  for (const error of errors.slice(0, 60)) console.log(`    ✗ ${error}`);
  if (errors.length > 60) console.log(`    … et ${errors.length - 60} autres`);
  console.log("");
  process.exit(1);
}

console.log(`\n  Tout est cohérent (${checks.length - failed.length}/${checks.length} contrôles).\n`);
