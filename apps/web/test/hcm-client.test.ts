/** The HCM client against the SYNTHETIC fake HCM (test-support/hcm-fake.ts) and against injected failures. */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { CACHE_TTL_MS, FAILURE_THRESHOLD, OPEN_MS, createHcmClient } from '../src/server/hcm/client.ts';
import { hcmConfig, type HcmConfig } from '../src/server/hcm/config.ts';
import { startFakeHcm, type FakeHcm } from '../test-support/hcm-fake.ts';

let fake: FakeHcm;
let config: HcmConfig;
before(async () => {
  fake = await startFakeHcm();
  config = hcmConfig(fake.env)!;
  assert.ok(config, 'fake HCM env yields a configuration');
});
after(() => fake.close());

test('ok answer: one token for many calls, title and state only, the scope requested', async () => {
  const client = createHcmClient(config);
  const first = await client.benchmark({ title: 'Desarrolladora backend', state: 'MX-CMX' });
  assert.ok(first.ok);
  assert.equal(first.benchmark.status, 'ok');
  assert.equal(first.benchmark.income?.percentiles.p50, 14_950);
  await client.benchmark({ title: 'Contador', state: null });
  assert.equal(fake.tokensIssued(), 1, 'the token is cached');
  const tokenCall = fake.requests.find((r) => r.path === '/api/v1/oauth/token')!;
  assert.equal(new URLSearchParams(tokenCall.body).get('scope'), 'hcm-benchmarks:read');
  const calls = fake.requests.filter((r) => r.path === '/api/v1/market-benchmarks/');
  assert.ok(calls.length >= 2, `read ${calls.length} benchmark calls`);
  for (const call of calls) {
    assert.deepEqual(Object.keys(call.query).sort(), call.query.state ? ['state', 'title'] : ['title'], 'only title and state leave cv');
    assert.equal(call.headers.cookie, undefined);
  }
});

test('answers are cached per (title, state) and expire', async () => {
  let clock = 1_000_000;
  const client = createHcmClient(config, { now: () => clock });
  const before = fake.requests.length;
  assert.equal((await client.benchmark({ title: 'Desarrollador', state: null })).ok, true);
  const again = await client.benchmark({ title: 'desarrollador', state: null });
  assert.ok(again.ok && again.cached);
  clock += CACHE_TTL_MS + 1;
  const fresh = await client.benchmark({ title: 'Desarrollador', state: null });
  assert.ok(fresh.ok && !fresh.cached);
  assert.ok(fake.requests.length > before);
});

test('HCM 503 is unavailable; after the threshold the breaker answers at once, then probes again', async () => {
  let clock = 5_000_000;
  const client = createHcmClient(config, { now: () => clock });
  for (let i = 0; i < FAILURE_THRESHOLD; i++) {
    assert.deepEqual(await client.benchmark({ title: `falla ${i}`, state: null }), { ok: false, reason: 'unavailable' });
  }
  const count = fake.requests.length;
  assert.deepEqual(await client.benchmark({ title: 'Desarrollador', state: null }), { ok: false, reason: 'unavailable' });
  assert.equal(fake.requests.length, count, 'open breaker: no request sent');
  clock += OPEN_MS + 1;
  assert.equal((await client.benchmark({ title: 'Desarrollador', state: 'MX-JAL' })).ok, true, 'half-open probe succeeds');
});

test('a wrong secret is refused, never retried into an answer', async () => {
  const client = createHcmClient({ ...config, clientSecret: 'wrong' });
  assert.deepEqual(await client.benchmark({ title: 'Desarrollador', state: null }), { ok: false, reason: 'refused' });
});

test('a 401 from HCM drops the token and retries once', async () => {
  const seen: string[] = [];
  let first = true;
  const fetchImpl = async (input: string, init?: RequestInit) => {
    seen.push(String(input));
    if (String(input).includes('market-benchmarks') && first) {
      first = false;
      return new Response('{}', { status: 401 });
    }
    return fetch(input, init);
  };
  const client = createHcmClient(config, { fetch: fetchImpl });
  const res = await client.benchmark({ title: 'Desarrollador', state: null });
  assert.equal(res.ok, true);
  assert.equal(seen.filter((u) => u.includes('oauth/token')).length, 2, 'a second token after the 401');
});

test('timeout and network errors are unavailable; an unexpected shape is invalid, never shown', async () => {
  const slow = createHcmClient({ ...config, timeoutMs: 200 }, { fetch: (_i, init) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))) });
  assert.deepEqual(await slow.benchmark({ title: 'x y', state: null }), { ok: false, reason: 'unavailable' });
  const odd = createHcmClient(config, {
    fetch: async (input, init) =>
      String(input).includes('market-benchmarks') ? new Response(JSON.stringify({ status: 'ok', income: { p50: 'mucho' } }), { status: 200 }) : fetch(input, init),
  });
  assert.deepEqual(await odd.benchmark({ title: 'Desarrollador', state: null }), { ok: false, reason: 'invalid' });
});

test('a source that is not INEGI is rejected by the schema', async () => {
  const forged = createHcmClient(config, {
    fetch: async (input, init) => {
      if (!String(input).includes('market-benchmarks')) return fetch(input, init);
      const real = await fetch(input, init);
      const body = (await real.json()) as { source: { url: string } };
      body.source.url = 'https://example.org/encuesta.zip';
      return new Response(JSON.stringify(body), { status: 200 });
    },
  });
  assert.deepEqual(await forged.benchmark({ title: 'Desarrollador', state: null }), { ok: false, reason: 'invalid' });
});
