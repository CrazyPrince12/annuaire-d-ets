/**
 * Copie les dépendances navigateur dans `public/assets/vendor/`.
 *
 * Aucune étape de build n'est nécessaire au déploiement : ces fichiers sont
 * committés (comme le veut un site en HTML/CSS/JS simples). Relancer ce script
 * après une mise à jour de MapLibre GL :
 *
 *   npm run vendor
 */
import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public/assets/vendor");

const FILES = [
  ["node_modules/maplibre-gl/dist/maplibre-gl.js", "maplibre-gl.js"],
  ["node_modules/maplibre-gl/dist/maplibre-gl.css", "maplibre-gl.css"],
];

await mkdir(OUT, { recursive: true });
let total = 0;
for (const [from, to] of FILES) {
  await copyFile(path.join(ROOT, from), path.join(OUT, to));
  const info = await stat(path.join(OUT, to));
  total += info.size;
  console.log(`${to} — ${(info.size / 1024).toFixed(0)} Ko`);
}
console.log(`Total : ${(total / 1024).toFixed(0)} Ko`);
