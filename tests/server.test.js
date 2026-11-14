import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../server.js';
let server, base;
before(async () => {
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
