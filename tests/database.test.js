import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neonConfig } from '@neondatabase/serverless';
import { PGlite } from '@electric-sql/pglite';
import { schemaStatements } from '../db/statements.mjs';
import { SCHEMA_SQL } from '../db/schema.mjs';
import { databaseUrl, resolveDatabase, withNeonReadFallback } from '../server-api/_lib/database.js';
import app from '../server.js';

test('le script de migration applique toutes les tables, même après un commentaire', async () => {
  const pg = new PGlite();
  try {
    const statements = schemaStatements(SCHEMA_SQL);
    await pg.transaction(async (tx) => {
      for (const [text] of statements) await tx.query(text);
    });
    const { rows } = await pg.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    const expected = [...SCHEMA_SQL.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((match) => match[1]);
    assert.deepEqual(rows.map((row) => row.table_name).sort(), expected.sort());
  } finally {
    await pg.close();
  }
});

test('Render et Vercel : configuration, transport Neon et diagnostics sans fuite de secrets', async () => {
  assert.equal(resolveDatabase('postgresql://user:password@db-internal/app'), 'postgres');
  assert.equal(resolveDatabase('postgresql://user:password@ep-a.neon.tech/app', 'auto'), 'neon');
  assert.equal(resolveDatabase('postgresql://user:password@ep-a.neon.tech/app', 'tcp'), 'postgres');
  assert.throws(() => resolveDatabase('postgresql://user:password@ep-a.neon.tech/app', 'other'), { reason: 'invalid_transport' });
  assert.throws(() => resolveDatabase('https://example.org/app'), { reason: 'invalid_url' });
  const originalEnv = { ...process.env };
  const keys = ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_URL_NON_POOLING', 'DATABASE_TRANSPORT', 'DATABASE_REQUIRED', 'NODE_ENV', 'RENDER', 'VERCEL'];
  for (const name of keys) delete process.env[name];
  process.env.NODE_ENV = 'production';
  process.env.RENDER = 'true';
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(url + '/healthz')).status, 200);
    process.env.DATABASE_REQUIRED = 'true';
    const required = await fetch(url + '/api/health');
    assert.equal(required.status, 503);
    assert.equal((await required.json()).data.code, 'missing_url');
    delete process.env.DATABASE_REQUIRED;
    process.env.DATABASE_URL = 'https://bad.invalid/private-token';
    const invalid = await fetch(url + '/api/home');
    assert.equal(invalid.status, 503);
    const invalidBody = await invalid.json();
    assert.equal(invalidBody.details.reason, 'invalid_url');
    assert.ok(!JSON.stringify(invalidBody).includes('private-token'));
    delete process.env.RENDER;
    delete process.env.DATABASE_URL;
    process.env.VERCEL = '1';
    const missing = await fetch(url + '/api/health');
    assert.equal(missing.status, 503);
    const { code, demo } = (await missing.json()).data;
    assert.equal(code, 'missing_url');
    assert.equal(demo, false);
    process.env.DATABASE_URL = '""';
    process.env.POSTGRES_URL_NON_POOLING = '"postgresql://user:private-token@ep-fake.neon.tech/app"';
    assert.equal(databaseUrl(), 'postgresql://user:private-token@ep-fake.neon.tech/app');
    let simulate = 'timeout';
    let calls = 0;
    neonConfig.fetchFunction = async (endpoint, options) => {
      calls++;
      assert.ok(options.signal instanceof AbortSignal);
      assert.match(String(endpoint), /^https:\/\//);
      const body = JSON.parse(options.body);
      if (simulate === 'timeout') return Response.json({ code: '57014', message: 'private-token' }, { status: 400 });
      if (simulate === 'schema') return Response.json({ code: '42P01', message: 'private-token' }, { status: 400 });
      if (simulate === 'home') {
        if (body.queries) {
          assert.equal(body.queries.length, 8);
          assert.equal(options.headers['Neon-Batch-Read-Only'], 'true');
          return Response.json({ results: body.queries.map(() => ({ fields: [], rows: [] })) });
        }
        assert.match(body.query, /FROM settings/);
        return Response.json({ fields: [], rows: [] });
      }
      assert.match(body.query, /to_regclass/);
      return Response.json({ fields: [
        { name: 'companies', dataTypeID: 23 }, { name: 'ready', dataTypeID: 16 },
      ], rows: [['5', 't']] });
    };
    const timedOut = await fetch(url + '/api/home');
    assert.equal(timedOut.status, 503);
    assert.equal(timedOut.headers.get('retry-after'), null);
    assert.equal((await timedOut.json()).details.reason, 'query_timeout');
    simulate = 'healthy';
    const healthy = await fetch(url + '/api/health');
    assert.equal(healthy.status, 200);
    const report = (await healthy.json()).data;
    assert.equal(report.database, 'neon');
    assert.equal(report.transport, 'neon-http');
    assert.equal(report.companies, 5);
    simulate = 'schema';
    const missingTable = await fetch(url + '/api/home');
    assert.equal(missingTable.status, 503);
    const schemaError = await missingTable.json();
    assert.equal(schemaError.details.reason, 'schema_missing');
    assert.ok(!JSON.stringify(schemaError).includes('private-token'));
    simulate = 'home';
    const before = calls;
    assert.equal((await fetch(url + '/api/home')).status, 200);
    assert.equal(calls - before, 2);
  } finally {
    neonConfig.fetchFunction = undefined;
    for (const name of keys) {
      if (originalEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[name];
    }
    await new Promise((resolve) => server.close(resolve));
  }
});

test('un incident HTTP bascule les lectures sur TCP, sans rejouer les écritures', async () => {
  const httpError = new TypeError('Error connecting to database');
  const http = {
    transport: 'neon-http',
    read: async () => { throw httpError; },
    readBatch: async () => { throw httpError; },
    query: async () => { throw httpError; },
  };
  let probes = 0;
  let writes = 0;
  let openings = 0;
  let releaseProbe;
  const gate = new Promise((resolve) => { releaseProbe = resolve; });
  const driver = withNeonReadFallback(http, async () => {
    openings++;
    return {
      transport: 'postgres-tcp',
      read: async (text) => {
        if (text === 'SELECT 1') { probes++; await gate; }
        return [{ ok: true }];
      },
      readBatch: async () => [[{ ok: true }]],
      query: async () => { writes++; return []; },
      close: async () => {},
    };
  });
  await assert.rejects(driver.query('UPDATE settings'), httpError);
  assert.equal(openings, 0, 'une écriture ayant échoué ne doit pas être rejouée');
  const loads = [driver.read('SELECT settings'), driver.readBatch([['SELECT companies']]), driver.read('SELECT 2')];
  releaseProbe();
  assert.deepEqual(await Promise.all(loads), [[{ ok: true }], [[{ ok: true }]], [{ ok: true }]]);
  assert.equal(openings, 1);
  assert.equal(probes, 1);
  assert.equal(driver.transport, 'postgres-tcp');
  await driver.query('UPDATE settings');
  assert.equal(writes, 1);
  await driver.close();
});

test('un refus de connexion TCP ne multiplie pas les sondes', async () => {
  let probes = 0;
  const offline = async () => { throw new TypeError('Error connecting to database'); };
  const driver = withNeonReadFallback({ read: offline, transport: 'neon-http' }, async () => ({
    async read() { probes++; throw new Error('TCP inaccessible'); },
    async close() {},
  }));
  for (let i = 0; i < 2; i++) await assert.rejects(driver.read('SELECT 1'), { reason: 'connection', retryable: true });
  assert.equal(probes, 1);
  assert.equal(driver.transport, 'neon-http');
  await driver.close();
});
