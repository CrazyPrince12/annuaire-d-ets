import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { Pool } from 'pg';

const run = promisify(execFile);
const project = new URL('../', import.meta.url);

// Aucune écriture sur DATABASE_URL ou POSTGRES_URL : le test utilise seulement
// un serveur local dédié et crée une base unique, détruite ensuite.
function testDatabaseUrl() {
  if (!process.env.TEST_POSTGRES_URL) {
    throw new Error('TEST_POSTGRES_URL doit pointer vers une instance PostgreSQL locale de test.');
  }
  const url = new URL(process.env.TEST_POSTGRES_URL);
  if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' ||
      url.pathname !== '/postgres' || url.search || url.hash || !url.username) {
    throw new Error('Format attendu : postgresql://utilisateur:mot_de_passe@127.0.0.1:port/postgres (sans options).');
  }
  return url;
}

test('PostgreSQL TCP : migration d’une base vide, reprise sans redémarrer et statistiques', { timeout: 60_000 }, async () => {
  const adminUrl = testDatabaseUrl();
  const name = `cg_test_${crypto.randomUUID().replaceAll('-', '')}`;
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const admin = new Pool({ connectionString: adminUrl.href, connectionTimeoutMillis: 3500 });
  // Nom généré uniquement depuis un UUID et jamais depuis l'environnement.
  const databaseName = `"${name}"`;
  let created = false;
  let server;
  let closeDriver;
  try {
    await admin.query(`CREATE DATABASE ${databaseName}`);
    created = true;
    process.env.DATABASE_URL = url.href;
    process.env.RENDER = 'true';
    delete process.env.VERCEL;
    const { default: app } = await import('../server.js');
    const { getDriver, one, query } = await import('../server-api/_lib/db.js');
    closeDriver = async () => (await getDriver()).close();
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const get = async (path, status = 200, options) => {
      const response = await fetch(base + path, { ...options, signal: AbortSignal.timeout(9_000) });
      assert.equal(response.status, status, `${path} (HTTP ${response.status})`);
      return response;
    };
    const data = async (...args) => (await (await get(...args)).json()).data;
    const post = (body) => data('/api/events', 200, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
      body: JSON.stringify(body),
    });
    const migrate = (...args) => run(process.execPath, ['scripts/db-init.mjs', ...args], {
      cwd: project, env: process.env, timeout: 20_000,
    });

    assert.deepEqual(await (await get('/healthz')).json(), { status: 'ok' });
    assert.equal((await data('/api/health', 503)).code, 'schema_missing');
    assert.equal((await (await get('/api/home', 503)).json()).details.retryable, false);
    await migrate();
    assert.equal((await data('/api/health')).companies, 0, 'la migration ne crée pas de données de démo');
    await migrate('--seed-only');
    const health = await data('/api/health');
    assert.equal(health.database, 'postgres');
    assert.equal(health.transport, 'postgres-tcp');
    assert.equal(health.demo, false);
    assert.ok(health.companies > 0);
    await migrate();
    assert.equal((await data('/api/health')).companies, health.companies);
    assert.equal((await data('/api/home')).counts.companies, health.companies);

    // Le batch PostgreSQL doit annuler toute la transaction si une instruction échoue.
    const driver = await getDriver();
    await assert.rejects(driver.batch([['CREATE TABLE cg_rollback (id int)'], ['SELECT id FROM cg_nonexistent']]), { code: '42P01' });
    assert.equal((await one("SELECT to_regclass('cg_rollback') AS name")).name, null);

    const company = await one(`SELECT c.slug, c.view_count FROM companies c
      JOIN company_members m ON c.id = m.company_id JOIN users u ON u.id = m.user_id
      WHERE u.email = $1 AND c.publication_status = 'published' LIMIT 1`, ['entrepriseconglomerat@conglomerat.cm']);
    assert.ok(company, 'la démo fournit une fiche publiée pour le compte entreprise');
    const before = await data(`/api/companies/${company.slug}`);
    assert.equal(before.company.viewCount, company.view_count);
    const event = { kind: 'view', companySlug: company.slug, eventId: crypto.randomUUID() };
    const simultaneous = await Promise.all([post(event), post(event), post(event), post(event)]);
    assert.equal(simultaneous.filter((result) => result.counted).length, 1);
    assert.deepEqual(await post(event), { counted: false, accepted: true });
    assert.equal((await data(`/api/companies/${company.slug}`)).company.viewCount, company.view_count + 1);
    assert.equal((await one('SELECT COUNT(*)::int AS count FROM company_events WHERE id = $1', [event.eventId])).count, 1);

    const click = { kind: 'phone_click', companySlug: company.slug, eventId: crypto.randomUUID() };
    await post(click);
    await query("UPDATE company_events SET created_at = NOW() - INTERVAL '31 days' WHERE id = $1", [click.eventId]);
    const login = await get('/api/auth', 200, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
      body: JSON.stringify({ action: 'login', email: 'entrepriseconglomerat@conglomerat.cm', password: 'Entreprise!2026' }),
    });
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);
    const account = await data('/api/enterprise', 200, { headers: { Cookie: cookie } });
    const stats = account.companies.find((entry) => entry.slug === company.slug);
    assert.equal(stats.views30d, 1);
    assert.equal(stats.phoneClicks, 0, 'une statistique de 31 jours est exclue');
  } finally {
    try {
      if (server) await new Promise((resolve) => server.close(resolve));
      await closeDriver?.();
      if (created) await admin.query(`DROP DATABASE ${databaseName} WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  }
});
