/**
 * Copie les dépendances navigateur dans `public/assets/vendor/`.
 *
 * Aucune étape de build n'est nécessaire au déploiement : ces fichiers sont
 * committés (comme le veut un site en HTML/CSS/JS simples). Relancer ce script
 * après une mise à jour de MapLibre, GSAP, Three.js ou Lenis :
 *
 *   npm run vendor
 */
import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public/assets/vendor");

const FILES = [
  ["node_modules/gsap/dist/gsap.min.js", "gsap.min.js"],
  ["node_modules/gsap/dist/ScrollTrigger.min.js", "scroll-trigger.min.js"],
  ["node_modules/lenis/LICENSE", "lenis-LICENSE.txt"],
  ["node_modules/three/LICENSE", "three-LICENSE.txt"],
  ["node_modules/maplibre-gl/dist/maplibre-gl.mjs", "maplibre-gl.mjs"],
  ["node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "maplibre-gl-worker.mjs"],
  ["node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs", "maplibre-gl-shared.mjs"],
  ["node_modules/maplibre-gl/LICENSE.txt", "maplibre-LICENSE.txt"],
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
await build({
  absWorkingDir: ROOT, entryPoints: {
    "three-city": "scripts/three-exports.mjs",
    "lenis": "node_modules/lenis/dist/lenis.mjs",
  },
  minify: true, bundle: true, format: "esm", target: "es2022", outdir: OUT,
  outExtension: { ".js": ".mjs" },
});
for (const to of ["three-city.mjs", "lenis.mjs"]) {
  const { size } = await stat(path.join(OUT, to));
  total += size;
  console.log(`${to} — ${(size / 1024).toFixed(0)} Ko`);
}
console.log(`Total : ${(total / 1024).toFixed(0)} Ko`);
