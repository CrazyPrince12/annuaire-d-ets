import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neonConfig } from '@neondatabase/serverless';
import { PGlite } from '@electric-sql/pglite';
import { schemaStatements } from '../db/statements.mjs';
import { SCHEMA_SQL } from '../db/schema.mjs';
import { resolveDatabase } from '../server-api/_lib/database.js';
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

test('production : choix du transport, configuration absente, réveil Neon puis erreur de schéma', async () => {
  assert.equal(resolveDatabase('postgresql://user:password@db-internal/app'), 'postgres');
  assert.equal(resolveDatabase('postgresql://user:password@ep-a.neon.tech/app'), 'neon');
  assert.throws(() => resolveDatabase('https://example.org/app'), { reason: 'invalid_url' });
  process.env.VERCEL = '1';
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(url + '/healthz')).status, 200);
    const missing = await fetch(url + '/api/health');
    assert.equal(missing.status, 503);
    assert.equal((await missing.json()).data.code, 'missing_url');
    process.env.DATABASE_URL = 'https://bad.invalid/private-token';
    const invalid = await fetch(url + '/api/home');
    assert.equal(invalid.status, 503);
    const invalidBody = await invalid.json();
    assert.equal(invalidBody.details.reason, 'invalid_url');
    assert.ok(!JSON.stringify(invalidBody).includes('private-token'));
    delete process.env.DATABASE_URL;
    process.env.POSTGRES_URL = 'postgresql://user:private-token@ep-fake.neon.tech/app';
    let simulate = 'cold';
    let calls = 0;
    neonConfig.fetchFunction = async (endpoint, options) => {
      calls++;
      assert.ok(options.signal instanceof AbortSignal);
      assert.match(String(endpoint), /^https:\/\//);
      const body = JSON.parse(options.body);
      if (simulate === 'cold') throw new TypeError('fetch failed');
      if (simulate === 'schema') return Response.json({ code: '42P01', message: 'private-token' }, { status: 400 });
      if (simulate === 'home') {
        if (body.queries) {
          assert.equal(body.queries.length, 8);
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
    const cold = await fetch(url + '/api/home');
    assert.equal(cold.status, 503);
    assert.equal(cold.headers.get('retry-after'), '1');
    assert.equal((await cold.json()).details.retryable, true);
    simulate = 'healthy';
    const healthy = await fetch(url + '/api/health');
    assert.equal(healthy.status, 200);
    const report = (await healthy.json()).data;
    assert.equal(report.database, 'neon');
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
    await new Promise((resolve) => server.close(resolve));
  }
});
