#!/usr/bin/env node
/**
 * Génère les déclinaisons du logo et l'image de partage.
 *
 *   npm run assets
 *
 * Produit :
 *   public/assets/img/icon-192.png         (manifeste PWA)
 *   public/assets/img/icon-512.png         (manifeste PWA)
 *   public/assets/img/icon-maskable-512.png
 *   public/assets/img/apple-touch-icon.png (180 px)
 *   public/assets/img/favicon-32.png
 *   public/assets/img/og-default.jpg       (1200 × 630, aperçu WhatsApp/LinkedIn)
 *
 * Le logo source (public/assets/img/logo-mark.svg) est vectoriel : il est déjà
 * minuscule et mis en forme à la main. Les PNG sont quantifiés et compressés,
 * l'image OG est en JPEG progressif (poids minimal pour un aperçu).
 *
 * Le texte de l'image OG est converti en courbes avec Manrope (via fonttools +
 * opentype.js). Sans ces outils, l'image est générée sans texte plutôt que
 * d'afficher une police de secours incohérente.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import opentype from "opentype.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMG = path.join(root, "public", "assets", "img");
const FONTS = path.join(root, "public", "assets", "fonts");
const SRC = path.join(IMG, "logo-mark.svg");
const TMP = "/tmp/conglomerat-assets";

const GREEN = "#22C07A";
const YELLOW = "#FFC83D";

function readLogo() {
  return fs.readFileSync(SRC, "utf8");
}

/** Réécrit les couleurs du SVG selon le fond (l'icône a besoin d'un fond plein). */
function themedMark({ background, size, padding = 0.09 }) {
  const inner = Math.round(size * (1 - padding * 2));
  const offset = Math.round((size - inner) / 2);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="${size}" y2="${size}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#101A15"/><stop offset="1" stop-color="#070B09"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.28" cy="0.2" r="0.85">
      <stop offset="0" stop-color="${GREEN}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${GREEN}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  <rect width="${size}" height="${size}" fill="url(#glow)"/>
  <g transform="translate(${offset} ${offset}) scale(${inner / 64})">
    <path d="M48.55 44.93A21 21 0 1 1 48.55 19.07" fill="none" stroke="url(#mark)" stroke-width="9" stroke-linecap="round"/>
    <defs>
      <linearGradient id="mark" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#3FE39A"/><stop offset=".55" stop-color="${GREEN}"/><stop offset="1" stop-color="#0B8F55"/>
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="6.6" fill="${YELLOW}"/>
  </g>
</svg>`);
}

async function iconPng({ size, background, out, padding, quality = 82 }) {
  const svg = background ? themedMark({ background, size, padding }) : await plainMark(size);
  const buffer = await sharp(svg, { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9, palette: true, quality, effort: 10 })
    .toBuffer();
  fs.writeFileSync(path.join(IMG, out), buffer);
  return buffer.length;
}

async function plainMark(size) {
  const svg = readLogo().replace('width="64" height="64"', `width="${size}" height="${size}"`);
  return Buffer.from(svg);
}

/* -------------------------------------------------------------------------- */
/*  Image de partage                                                          */
/* -------------------------------------------------------------------------- */
function findFontTools() {
  const candidates = ["/tmp/fv/bin/fonttools", "fonttools"];
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["--help"], { stdio: "ignore" });
      return candidate;
    } catch {
      /* suivant */
    }
  }
  return null;
}

/** Convertit le woff2 variable en TTF statique (une graisse). */
function buildStaticFont(weight, tool) {
  fs.mkdirSync(TMP, { recursive: true });
  const target = path.join(TMP, `manrope-${weight}.ttf`);
  if (fs.existsSync(target)) return target;
  const woff2 = path.join(FONTS, "manrope-latin.woff2");
  const varPath = path.join(TMP, "manrope-var.ttf");
  try {
    execFileSync("/tmp/fv/bin/python", [
      "-c",
      `from fontTools.ttLib import TTFont; f=TTFont(${JSON.stringify(woff2)}); f.flavor=None; f.save(${JSON.stringify(varPath)})`,
    ]);
    execFileSync(tool, ["varLib.instancer", "-o", target, varPath, `wght=${weight}`, "--quiet"]);
    return fs.existsSync(target) ? target : null;
  } catch (error) {
    console.warn(`  (police ${weight} indisponible : ${error.message.split("\n")[0]})`);
    return null;
  }
}

function textToPath(fontPath, text, { size, x, y, letterSpacing = 0 }) {
  if (!fontPath) return { path: "", width: 0 };
  const font = opentype.loadSync(fontPath);
  const pieces = [];
  let cursor = 0;
  for (const char of text) {
    const glyph = font.charToGlyph(char);
    const advance = (glyph.advanceWidth / font.unitsPerEm) * size;
    pieces.push(glyph.getPath(cursor, 0, size).toPathData(2));
    cursor += advance + letterSpacing;
  }
  return { path: pieces.join(" "), width: cursor };
}

async function buildOgImage() {
  const tool = findFontTools();
  let heavyFont = null;
  let mediumFont = null;
  if (tool) {
    heavyFont = buildStaticFont(800, tool);
    mediumFont = buildStaticFont(500, tool);
  }

  const W = 1200;
  const H = 630;
  const title = textToPath(heavyFont, "CONGLOMERAT", { size: 92, letterSpacing: 1 });
  const tagline = textToPath(mediumFont, "L'annuaire des entreprises du Cameroun", { size: 34 });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="${W}" y2="${H}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0A0E0C"/><stop offset="1" stop-color="#0D1712"/>
    </linearGradient>
    <radialGradient id="g1" cx="0.14" cy="0.08" r="0.7">
      <stop offset="0" stop-color="${GREEN}" stop-opacity="0.30"/><stop offset="1" stop-color="${GREEN}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g2" cx="0.92" cy="0.05" r="0.6">
      <stop offset="0" stop-color="${YELLOW}" stop-opacity="0.16"/><stop offset="1" stop-color="${YELLOW}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="mark" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3FE39A"/><stop offset=".55" stop-color="${GREEN}"/><stop offset="1" stop-color="#0B8F55"/>
    </linearGradient>
    <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse">
      <circle cx="1.4" cy="1.4" r="1.4" fill="#FFFFFF" fill-opacity="0.05"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#dots)"/>
  <rect width="${W}" height="${H}" fill="url(#g1)"/>
  <rect width="${W}" height="${H}" fill="url(#g2)"/>

  <g transform="translate(96 150) scale(2.1)">
    <path d="M48.55 44.93A21 21 0 1 1 48.55 19.07" fill="none" stroke="url(#mark)" stroke-width="9" stroke-linecap="round"/>
    <circle cx="32" cy="32" r="6.6" fill="${YELLOW}"/>
  </g>

  ${title.path ? `<g transform="translate(96 400)" fill="#F1F5F3"><path d="${title.path}"/></g>` : ""}
  ${tagline.path ? `<g transform="translate(96 448)" fill="#9AA9A2"><path d="${tagline.path}"/></g>` : ""}

  <g transform="translate(96 520)">
    <rect x="0" y="0" width="330" height="52" rx="26" fill="#22C07A" fill-opacity="0.14" stroke="${GREEN}" stroke-opacity="0.45"/>
    <circle cx="30" cy="26" r="6" fill="${GREEN}"/>
    ${tagline.path ? "" : ""}
    <text x="52" y="34" font-family="sans-serif" font-size="22" fill="#B9E9D2">Yaoundé · Douala · Bafoussam</text>
  </g>
  <rect x="0" y="${H - 6}" width="${W / 3}" height="6" fill="${GREEN}"/>
  <rect x="${W / 3}" y="${H - 6}" width="${W / 3}" height="6" fill="#F2574F"/>
  <rect x="${(2 * W) / 3}" y="${H - 6}" width="${W / 3}" height="6" fill="${YELLOW}"/>
</svg>`;

  const jpg = await sharp(Buffer.from(svg), { density: 144 })
    .resize(W, H)
    .jpeg({ quality: 82, progressive: true, chromaSubsampling: "4:2:0", mozjpeg: true })
    .toBuffer();
  fs.writeFileSync(path.join(IMG, "og-default.jpg"), jpg);
  return jpg.length;
}

/* -------------------------------------------------------------------------- */
/*  Exécution                                                                 */
/* -------------------------------------------------------------------------- */
console.log("→ génération des visuels…");
const results = [];
results.push(["icon-192.png", await iconPng({ size: 192, background: true, out: "icon-192.png", padding: 0.1, quality: 90 })]);
results.push(["icon-512.png", await iconPng({ size: 512, background: true, out: "icon-512.png", padding: 0.1, quality: 90 })]);
results.push([
  "icon-maskable-512.png",
  await iconPng({ size: 512, background: true, out: "icon-maskable-512.png", padding: 0.18, quality: 90 }),
]);
results.push([
  "apple-touch-icon.png",
  await iconPng({ size: 180, background: true, out: "apple-touch-icon.png", padding: 0.1, quality: 88 }),
]);
results.push(["favicon-32.png", await iconPng({ size: 32, background: false, out: "favicon-32.png", padding: 0 })]);
results.push(["og-default.jpg", await buildOgImage()]);

for (const [name, bytes] of results) {
  console.log(`  ${name.padEnd(24)} ${(bytes / 1024).toFixed(1)} Ko`);
}
const svgSize = fs.statSync(SRC).size;
console.log(`  ${"logo-mark.svg".padEnd(24)} ${(svgSize / 1024).toFixed(2)} Ko (source vectorielle)`);
console.log(`\n✓ Terminé. Poids total des visuels : ${(results.reduce((sum, [, bytes]) => sum + bytes, svgSize) / 1024).toFixed(1)} Ko`);
