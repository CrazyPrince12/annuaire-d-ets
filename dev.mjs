/**
 * Serveur de développement local — reproduit le comportement de Vercel :
 *   - fichiers statiques de /public (index.html servi sur /)
 *   - les réécritures déclarées dans vercel.json
 *   - les fonctions de /api (y compris les routes dynamiques [param])
 *
 * Aucune dépendance : `node dev.mjs` puis http://localhost:3000
 * Le même code tourne en production sur Vercel, il n'y a pas de build.
 */
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 3000);

/* -------------------------------------------------------------------------- */
/*  .env.local minimaliste                                                    */
/* -------------------------------------------------------------------------- */
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env"));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".map": "application/json; charset=utf-8",
};

/* -------------------------------------------------------------------------- */
/*  Réécritures : on lit vercel.json pour rester identique à la production     */
/* -------------------------------------------------------------------------- */
const vercelConfig = JSON.parse(
  fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8")
);

const STAR = "\u0000star\u0000";
const PARAM = "\u0000param\u0000";

const rewrites = (vercelConfig.rewrites || []).map((rule) => {
  const keys = [];
  // 1. On isole les motifs dynamiques (`:slug`, `(.*)`) derrière des jetons,
  //    2. on échappe le reste, 3. on restaure les motifs en groupes de capture.
  const pattern = rule.source
    .replace(/\(\.\*\)/g, STAR)
    .replace(/:(\w+)/g, (_, key) => {
      keys.push(key);
      return PARAM;
    })
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .split(STAR)
    .join("(.*)")
    .split(PARAM)
    .join("([^/]+)");
  return { regex: new RegExp(`^${pattern}/?$`), keys, destination: rule.destination };
});

function applyRewrites(pathname, search) {
  for (const rule of rewrites) {
    const match = pathname.match(rule.regex);
    if (!match) continue;
    const params = {};
    rule.keys.forEach((key, i) => {
      params[key] = decodeURIComponent(match[i + 1] || "");
    });
    const [destPath, destQuery] = rule.destination.split("?");
    const query = new URLSearchParams(destQuery || "");
    for (const [key, value] of query) query.set(key, value);
    return { pathname: destPath, search: search || (query.toString() ? `?${query}` : "") };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Résolution des fonctions API                                              */
/* -------------------------------------------------------------------------- */
const API_DIR = path.join(ROOT, "api");

function resolveApiFile(pathname) {
  const rel = pathname.replace(/^\/api\/?/, "");
  if (!rel) return null;
  const segments = rel.split("/").filter(Boolean).map(decodeURIComponent);
  const candidates = [path.join(API_DIR, ...segments) + ".js"];
  // api/admin/stats -> api/admin/stats.js ; api/companies/slug -> api/companies/[slug].js
  if (segments.length >= 2) {
    const head = segments.slice(0, -1);
    candidates.push(path.join(API_DIR, ...head, "[id].js"));
    candidates.push(path.join(API_DIR, ...head, "[slug].js"));
  }
  if (segments.length >= 3) {
    candidates.push(
      path.join(API_DIR, segments[0], "[slug]", segments[2] + ".js")
    );
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return { file: candidate, segments };
    }
  }
  // Fallback : dossier index.js
  const indexCandidate = path.join(API_DIR, ...segments, "index.js");
  if (fs.existsSync(indexCandidate)) {
    return { file: indexCandidate, segments };
  }
  return null;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8");
  const type = String(req.headers["content-type"] || "");
  if (type.includes("application/json")) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  if (type.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  return raw;
}

function enhanceResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    if (!res.headersSent) res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
    return res;
  };
  res.send = (payload) => {
    if (typeof payload === "object" && payload !== null) return res.json(payload);
    if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(String(payload ?? ""));
    return res;
  };
  return res;
}

async function handleApi(req, res, url) {
  const resolved = resolveApiFile(url.pathname);
  if (!resolved) {
    return res.status(404).json({ ok: false, error: "Route API inconnue." });
  }
  const dynamic = {};
  const rel = url.pathname.replace(/^\/api\/?/, "");
  const segments = rel.split("/").filter(Boolean);
  const head = segments.slice(0, -1);
  const tail = segments[segments.length - 1];
  // Remplit [slug] / [id] à partir du dernier segment
  if (segments.length >= 2) {
    const folder = path.basename(path.dirname(resolved.file));
    if (folder === "[slug]") dynamic.slug = tail;
    else if (folder === "[id]") dynamic.id = tail;
  }
  if (segments.length >= 3 && resolved.file.includes("[slug]")) {
    dynamic.slug = segments[1];
    dynamic.action = segments[2];
  }

  req.query = Object.fromEntries(url.searchParams.entries());
  Object.assign(req.query, dynamic);
  if (!req.query.action && segments.length >= 2 && resolved.file.endsWith("[slug].js")) {
    req.query.slug = tail;
  }
  req.body = await readBody(req);
  req.cookies = Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter((pair) => pair.length === 2)
      .map(([k, v]) => [k, decodeURIComponent(v)])
  );
  enhanceResponse(res);

  try {
    const module = await import(pathToFileURL(resolved.file).href + `?t=${Date.now() % 100000}`);
    const handler = module.default || module.handler;
    if (typeof handler !== "function") {
      return res.status(500).json({ ok: false, error: "Fonction API invalide." });
    }
    await handler(req, res);
    if (!res.writableEnded) res.end();
  } catch (error) {
    console.error(`[api] ${req.method} ${url.pathname} —`, error);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: "Erreur interne du serveur." });
    } else {
      res.end();
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Statiques                                                                 */
/* -------------------------------------------------------------------------- */
async function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, decodeURIComponent(pathname));
  // Empêche la sortie du dossier public
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.statusCode = 403;
    return res.end("Accès refusé");
  }
  let stat = null;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    stat = null;
  }
  if (stat && stat.isDirectory()) {
    filePath = path.join(filePath, "index.html");
    try {
      stat = await fsp.stat(filePath);
    } catch {
      stat = null;
    }
  }
  if (!stat) {
    // /explorer -> /explorer.html
    if (!path.extname(filePath)) {
      const withHtml = filePath + ".html";
      if (fs.existsSync(withHtml)) return serveFile(req, res, withHtml);
    }
    const notFoundPage = path.join(PUBLIC_DIR, "404.html");
    if (fs.existsSync(notFoundPage)) return serveFile(req, res, notFoundPage, 404);
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("Page introuvable");
  }
  return serveFile(req, res, filePath, 200);
}

async function serveFile(req, res, filePath, status = 200) {
  const ext = path.extname(filePath).toLowerCase();
  const data = await fsp.readFile(filePath);
  res.statusCode = status;
  res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
  res.setHeader("Cache-Control", "no-cache");
  if (req.method === "HEAD") return res.end();
  res.end(data);
}

/* -------------------------------------------------------------------------- */
/*  Serveur                                                                   */
/* -------------------------------------------------------------------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const started = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - started;
    if (!url.pathname.startsWith("/assets/") || res.statusCode >= 400) {
      console.log(`${req.method} ${url.pathname}${url.search} → ${res.statusCode} (${ms} ms)`);
    }
  });

  try {
    if (url.pathname.startsWith("/api/")) {
      return await handleApi(req, res, url);
    }
    const rewritten = applyRewrites(url.pathname, url.search);
    if (rewritten) {
      if (rewritten.pathname.startsWith("/api/")) {
        const target = new URL(rewritten.pathname + (rewritten.search || ""), "http://local");
        return await handleApi(req, res, target);
      }
      return await serveStatic(req, res, rewritten.pathname);
    }
    return await serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error("[server]", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Erreur serveur");
    } else {
      res.end();
    }
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  CONGLOMERAT — développement`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  Base : ${process.env.DATABASE_URL ? "Neon (DATABASE_URL)" : "démo en mémoire (PGlite)"}\n`);
});
