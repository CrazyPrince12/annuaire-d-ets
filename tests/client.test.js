import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, post } from '../public/assets/js/core/api.js';

const response = (status, payload) => Response.json(payload, { status });

test('le client retente une lecture transitoire, mais pas une erreur de configuration', async (ctx) => {
  const fetch = ctx.mock.method(globalThis, 'fetch', async () => response(503, { ok: false, details: { retryable: true } }));
  fetch.mock.mockImplementationOnce(async () => response(200, { ok: true, data: { companies: 3 } }), 1);
  assert.deepEqual(await get('/home'), { companies: 3 });
  assert.equal(fetch.mock.callCount(), 2);

  fetch.mock.mockImplementation(async () => response(503, { ok: false, details: { retryable: false, reason: 'schema_missing' } }));
  await assert.rejects(get('/home'), { status: 503 });
  assert.equal(fetch.mock.callCount(), 3);
});

test('un POST n’est pas rejoué par défaut et les clics peuvent survivre à la navigation', async (ctx) => {
  const fetch = ctx.mock.method(globalThis, 'fetch', async () => response(503, { ok: false }));
  await assert.rejects(post('/events', { kind: 'phone_click' }, { keepalive: true }), { status: 503 });
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(fetch.mock.calls[0].arguments[1].keepalive, true);
});

test('une requête annulée ne peut pas déclencher de deuxième appel', async (ctx) => {
  const controller = new AbortController();
  const fetch = ctx.mock.method(globalThis, 'fetch', async () => {
    controller.abort();
    return response(503, { ok: false });
  });
  await assert.rejects(get('/companies', { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(fetch.mock.callCount(), 1);
});
