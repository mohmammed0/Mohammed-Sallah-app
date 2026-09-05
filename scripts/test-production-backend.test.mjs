import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyProductionBackend } from './verify-production-backend.mjs';

const env = {
  SUPABASE_URL: 'https://fixture.supabase.co',
  SUPABASE_SECRET_KEY: 'synthetic-server-only-credential',
};
const ready = { ready: true, consentEnabled: true, missingDocuments: [], versionsAligned: true };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('preflight makes one bounded service-only read and requires the complete policy matrix', async () => {
  let calls = 0;
  const result = await verifyProductionBackend(env, async (url, init) => {
    calls += 1;
    assert.equal(url.pathname, '/rest/v1/rpc/get_legal_release_readiness');
    assert.equal(init.method, 'POST');
    assert.equal(init.body, '{}');
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
    return response(ready);
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.ok(!result.message.includes(env.SUPABASE_SECRET_KEY));
});

test('missing, disabled, unaligned and inconsistent policy evidence cannot pass', async () => {
  for (const state of [
    { ...ready, ready: false },
    { ...ready, consentEnabled: false },
    { ...ready, versionsAligned: false },
    { ...ready, missingDocuments: [{ locale: 'ur', documentType: 'terms' }] },
    { ready: true },
    { ...ready, rawSecret: 'synthetic-do-not-log' },
  ]) {
    const result = await verifyProductionBackend(env, async () => response(state));
    assert.equal(result.ok, false);
    assert.ok(!result.message.includes('synthetic-do-not-log'));
  }
});

test('HTTP, transport and parsing failures expose no raw backend or credential values', async () => {
  for (const request of [
    async () => response({ error: env.SUPABASE_SECRET_KEY }, 403),
    async () => {
      throw new Error(env.SUPABASE_SECRET_KEY);
    },
    async () => new Response('invalid-json-secret'),
  ]) {
    const result = await verifyProductionBackend(env, request);
    assert.equal(result.ok, false);
    assert.ok(!result.message.includes(env.SUPABASE_SECRET_KEY));
    assert.ok(!result.message.includes('invalid-json-secret'));
  }
});
