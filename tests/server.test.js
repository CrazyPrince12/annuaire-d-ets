import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../server.js';
let server, base;
before(async () => {
  // Les tests écrivent des événements : ne jamais toucher la base de .env.local.
  for (const key of ["DATABASE_URL", "POSTGRES_URL", "POSTGRES_URL_NON_POOLING", "VERCEL", "DATABASE_REQUIRED"]) delete process.env[key];
  process.env.RENDER = "true";
  process.env.NODE_ENV = "production";
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));
for (const route of ['/', '/explorer', '/carte', '/entreprises', '/entreprises/exemple', '/secteurs/test', '/villes/test', '/offres/test', '/connexion', '/admin', '/admin/utilisateurs', '/hors-ligne', '/assets/js/core/app.js']) {
  test(`GET ${route}`, async () => {
    const res = await fetch(base + route);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    if (route.startsWith('/admin')) assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
  });
}
test('accueil : assets compressés, maquette non bloquante et recherche sans JavaScript', async () => {
  const res = await fetch(base + '/', { headers: { 'accept-encoding': 'gzip' } });
  assert.equal(res.headers.get('content-encoding'), 'gzip');
  assert.match(res.headers.get('vary'), /Accept-Encoding/i);
  const body = await res.text();
  assert.match(body, /<form[^>]+id="hero-search-form"[^>]+action="\/explorer"/);
  assert.match(body, /city-maquette-480\.avif/);
  assert.doesNotMatch(body, /(?:src|href)="[^"\n]*(?:three-city|lenis|scroll-trigger)\.[m]?js"/);
  const module = await fetch(base + '/assets/vendor/three-city.mjs');
  assert.equal(module.status, 200);
  assert.match(module.headers.get('content-type'), /javascript/);
});

test('redirections canoniques et filtres', async () => {
  for (const [route, location] of [['/index.html', '/'], ['/stages', '/offres?type=stage'], ['/inscription', '/login?mode=register']]) {
    const res = await fetch(base + route, { redirect: 'manual' });
    assert.equal(res.headers.get('location'), location);
  }
});
test('routes inconnues et fichiers privés inaccessibles', async () => {
  for (const route of ['/introuvable', '/server-api/auth.js', '/.env', '/package.json', '/api/_lib/db', '/api/inconnue']) {
    assert.equal((await fetch(base + route)).status, 404);
  }
});
test('API : méthode, JSON invalide, limite de taille', async () => {
  assert.equal((await fetch(base + '/api/companies/test', { method: 'POST' })).status, 405);
  assert.equal((await fetch(base + '/api/auth', { method: 'POST', headers: {'content-type':'application/json'}, body: '{' })).status, 400);
  assert.equal((await fetch(base + '/api/auth', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ x: 'x'.repeat(600000) }) })).status, 413);
});
test('paramètres dynamiques transmis aux handlers (prioritaires sur query)', async () => {
  const res = await fetch(base + '/api/companies/entreprise-inexistante?slug=autre');
  assert.equal(res.status, 404);
  assert.equal((await res.json()).ok, false);
});

test('Render sans DATABASE_URL : démo opérationnelle en NODE_ENV=production', async () => {
  const health = await fetch(base + '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  const report = (await health.json()).data;
  assert.equal(report.status, 'ok');
  assert.equal(report.transport, 'pglite');
  assert.equal(report.demo, true);
  const home = await fetch(base + '/api/home');
  assert.equal(home.status, 200);
  assert.match(home.headers.get('cache-control'), /s-maxage=120/);
  assert.ok((await home.json()).data.counts.companies > 0);
  const listing = await fetch(base + '/api/companies?q=orange');
  assert.equal(listing.status, 200);
  assert.ok((await listing.json()).data.items.some((company) => company.slug.includes('orange')));
});

test('une fiche ne bloque plus sur une écriture et une vue ne compte qu’une fois', async () => {
  const { one, query } = await import('../server-api/_lib/db.js');
  const company = await one("SELECT id, slug, view_count FROM companies WHERE publication_status = 'published' LIMIT 1");
  const detail = await fetch(`${base}/api/companies/${company.slug}`);
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).data.company.viewCount, company.view_count);
  assert.equal((await one('SELECT view_count FROM companies WHERE id = $1', [company.id])).view_count, company.view_count);

  const eventId = crypto.randomUUID();
  const postEvent = (body) => fetch(base + '/api/events', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ kind: 'view', companySlug: company.slug, ...body }),
  });
  const [primary, duplicate] = await Promise.all([postEvent({ eventId }), postEvent({ eventId })]);
  assert.equal(primary.status, 200);
  assert.equal(duplicate.status, 200);
  const responses = await Promise.all([primary.json(), duplicate.json()]);
  assert.equal(responses.filter((result) => result.data.counted).length, 1);
  assert.deepEqual((await (await postEvent({ eventId })).json()).data, { counted: false, accepted: true });
  assert.equal((await one('SELECT view_count FROM companies WHERE id = $1', [company.id])).view_count, company.view_count + 1);
  assert.equal((await one('SELECT count(*)::int AS n FROM company_events WHERE id = $1', [eventId])).n, 1);
  assert.equal((await postEvent({ kind: 'invented' })).status, 400);
  assert.deepEqual((await (await postEvent({ companySlug: 'slug-absent' })).json()).data, { counted: false, accepted: false });
  try {
    await query("UPDATE companies SET deleted_at = NOW() WHERE id = $1", [company.id]);
    assert.deepEqual((await (await postEvent({ kind: 'phone_click' })).json()).data, { counted: false, accepted: false });
  } finally {
    await query("UPDATE companies SET deleted_at = NULL WHERE id = $1", [company.id]);
  }
});
