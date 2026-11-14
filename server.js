/** Application Express commune à Vercel, Render et au développement local. */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
for (const name of ['.env.local', '.env']) {
  const file = path.join(root, name);
  if (fs.existsSync(file)) process.loadEnvFile(file);
}

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(self), camera=(), microphone=(self)',
  });
  if (/^\/admin(?:\/|\.html|$)/.test(req.path)) res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
});
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: false, limit: '512kb' }));

// Enregistrer les handlers existants, hors du dossier spécial /api de Vercel.
// Les imports restent littéraux pour que le bundler trace toutes les dépendances.
import handler0 from './server-api/admin/actions.js';
import handler1 from './server-api/admin/data.js';
import handler2 from './server-api/apply.js';
import handler3 from './server-api/auth.js';
import handler4 from './server-api/billing.js';
import handler5 from './server-api/claims.js';
import handler6 from './server-api/companies/[slug].js';
import handler7 from './server-api/companies.js';
import handler8 from './server-api/contact.js';
import handler9 from './server-api/contributions.js';
import handler10 from './server-api/enterprise.js';
import handler11 from './server-api/events.js';
import handler12 from './server-api/health.js';
import handler13 from './server-api/home.js';
import handler14 from './server-api/llms.js';
import handler15 from './server-api/map.js';
import handler16 from './server-api/me-alerts.js';
import handler17 from './server-api/me-favorites.js';
import handler18 from './server-api/me-reviews.js';
import handler19 from './server-api/me-trackers.js';
import handler20 from './server-api/me.js';
import handler21 from './server-api/meta.js';
import handler22 from './server-api/offers/[slug].js';
import handler23 from './server-api/offers.js';
import handler24 from './server-api/og.js';
import handler25 from './server-api/reports.js';
import handler26 from './server-api/reputation.js';
import handler27 from './server-api/reviews.js';
import handler28 from './server-api/sitemap.js';
import handler29 from './server-api/suggest.js';
import handler30 from './server-api/votes.js';

function endpoint(fn) {
  return async (req, res, next) => {
    // Express 5 expose query via un getter : conserver les paramètres dynamiques.
    Object.defineProperty(req, "query", { value: { ...req.query, ...req.params }, configurable: true });
    try { await fn(req, res); } catch (error) { next(error); }
  };
}
app.all('/api/admin/actions', endpoint(handler0));
app.all('/api/admin/data', endpoint(handler1));
app.all('/api/apply', endpoint(handler2));
app.all('/api/auth', endpoint(handler3));
app.all('/api/billing', endpoint(handler4));
app.all('/api/claims', endpoint(handler5));
app.all('/api/companies/:slug', endpoint(handler6));
app.all('/api/companies', endpoint(handler7));
app.all('/api/contact', endpoint(handler8));
app.all('/api/contributions', endpoint(handler9));
app.all('/api/enterprise', endpoint(handler10));
app.all('/api/events', endpoint(handler11));
app.all('/api/health', endpoint(handler12));
app.all('/api/home', endpoint(handler13));
app.all('/api/llms', endpoint(handler14));
app.all('/llms.txt', endpoint(handler14));
app.all('/api/map', endpoint(handler15));
app.all('/api/me-alerts', endpoint(handler16));
app.all('/api/me-favorites', endpoint(handler17));
app.all('/api/me-reviews', endpoint(handler18));
app.all('/api/me-trackers', endpoint(handler19));
app.all('/api/me', endpoint(handler20));
app.all('/api/meta', endpoint(handler21));
app.all('/api/offers/:slug', endpoint(handler22));
app.all('/api/offers', endpoint(handler23));
app.all('/api/og', endpoint(handler24));
app.all('/api/reports', endpoint(handler25));
app.all('/api/reputation', endpoint(handler26));
app.all('/api/reviews', endpoint(handler27));
app.all('/api/sitemap', endpoint(handler28));
app.all('/sitemap.xml', endpoint(handler28));
app.all('/api/suggest', endpoint(handler29));
app.all('/api/votes', endpoint(handler30));

app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'Route API inconnue.' }));
app.get('/index.html', (req, res) => res.redirect(308, '/'));
const publicDir = path.join(root, 'public');
const pages = {
  '/entreprises': 'explorer.html',
  '/entreprises/:slug': 'entreprise.html',
  '/secteurs/:slug': 'secteur.html',
  '/villes/:slug': 'ville.html',
  '/offres/:slug': 'offre.html',
  '/connexion': 'login.html',
  '/admin/{*rest}': 'admin.html',
};
for (const [route, file] of Object.entries(pages)) {
  app.get(route, (req, res) => res.sendFile(path.join(publicDir, file)));
}
// Ces pages lisent les filtres dans location.search côté navigateur.
app.get('/stages', (req, res) => res.redirect(302, '/offres?type=stage'));
app.get('/inscription', (req, res) => res.redirect(302, '/login?mode=register'));
app.use(express.static(publicDir, {
  extensions: ['html'],
  setHeaders(res) { res.setHeader('Cache-Control', 'no-cache'); },
}));
app.use((req, res) => res.status(404).sendFile(path.join(publicDir, '404.html')));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status >= 400 && error.status < 500 ? error.status : 500;
  if (status === 500) console.error('[server]', error);
  res.status(status).json({ ok: false, error: status === 500 ? 'Erreur interne du serveur.' : 'Requête invalide.' });
});

export default app;
// Vercel importe l'application ; Render et npm start lancent un serveur HTTP.
if (!process.env.VERCEL && process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => console.log(`CONGLOMERAT — Express sur le port ${port}`));
}
