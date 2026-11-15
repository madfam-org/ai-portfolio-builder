/** The tlacuilo client against the SYNTHETIC fake (test-support/tlacuilo-fake.ts) and against injected failures. */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { FAILURE_THRESHOLD, OPEN_MS, PAGE_MAX_LINES, createTlacuiloClient } from '../src/server/tlacuilo/client.ts';
import { tlacuiloConfig, type TlacuiloConfig } from '../src/server/tlacuilo/config.ts';
import { FAKE_POSTING_LINES, fakeExtraction, startFakeTlacuilo, type FakeTlacuilo } from '../test-support/tlacuilo-fake.ts';

let fake: FakeTlacuilo;
let config: TlacuiloConfig;
before(async () => {
  fake = await startFakeTlacuilo();
  config = tlacuiloConfig(fake.env)!;
  assert.ok(config, 'fake tlacuilo env yields a configuration');
});
after(() => fake.close());

const jpeg = (marker = '') => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Buffer.from(`synthetic page ${marker}`)]);

test('a page: one token for many calls, the lane and the label sent, a neutral file name, clean lines back', async () => {
  const client = createTlacuiloClient(config);
  const first = await client.readPage(jpeg(), 'image/jpeg');
  assert.ok(first.ok);
  assert.deepEqual(first.page.lines, FAKE_POSTING_LINES, 'blank lines are dropped');
  assert.equal(first.page.verdict, 'good');
  assert.equal(first.page.source, 'ocr');
  assert.equal(first.page.confidence, 0.93);
  assert.equal(first.page.truncated, false);
  const second = await client.readPage(jpeg('FAKE-POOR'), 'image/png');
  assert.ok(second.ok);
  assert.equal(second.page.verdict, 'poor');
  assert.equal(fake.tokensIssued(), 1, 'the token is cached');
  const tokenCall = fake.requests.find((r) => r.path === '/api/v1/oauth/token')!;
  assert.equal(new URLSearchParams(tokenCall.body).get('scope'), 'tlacuilo:extract');
  const calls = fake.requests.filter((r) => r.path === '/v1/extractions');
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.documentType, 'text_document');
    assert.equal(call.mode, 'sync');
    assert.equal(call.headers['x-sensitivity'], 'restricted');
    assert.match(call.filename ?? '', /^page\.(jpg|png)$/, 'never the person\'s file name');
    assert.ok(call.bytes > 0);
  }
  assert.equal(calls[1]!.fileType, 'image/png');
});

test('a 401 from tlacuilo drops the token and retries once', async () => {
  const client = createTlacuiloClient(config);
  assert.ok((await client.readPage(jpeg(), 'image/jpeg')).ok);
  const issued = fake.tokensIssued();
  fake.revokeTokens();
  const again = await client.readPage(jpeg(), 'image/jpeg');
  assert.ok(again.ok, 'the retry with a fresh token succeeds');
  assert.equal(fake.tokensIssued(), 1, 'exactly one new token after the revoke');
  assert.ok(issued >= 1);
});

test('a page tlacuilo cannot read is about the page, and never opens the breaker', async () => {
  const client = createTlacuiloClient(config);
  for (let i = 0; i < FAILURE_THRESHOLD + 2; i += 1) {
    assert.deepEqual(await client.readPage(jpeg('FAKE-BLANK'), 'image/jpeg'), { ok: false, reason: 'unreadable' });
  }
  assert.deepEqual(await client.readPage(jpeg('FAKE-BUSY'), 'image/jpeg'), { ok: false, reason: 'busy' });
  assert.ok((await client.readPage(jpeg(), 'image/jpeg')).ok, 'the service is still asked');
});

test('service failures open the breaker; it answers at once, then lets one probe through', async () => {
  let clock = 1_000_000;
  let calls = 0;
  const realFetch: typeof fetch = (input, init) => {
    calls += 1;
    return fetch(input, init);
  };
  const client = createTlacuiloClient(config, { fetch: (i, init) => realFetch(i, init), now: () => clock });
  for (let i = 0; i < FAILURE_THRESHOLD; i += 1) assert.deepEqual(await client.readPage(jpeg('FAKE-DOWN'), 'image/jpeg'), { ok: false, reason: 'unavailable' });
  const settled = calls;
  assert.deepEqual(await client.readPage(jpeg(), 'image/jpeg'), { ok: false, reason: 'unavailable' });
  assert.equal(calls, settled, 'no call while the breaker is open');
  clock += OPEN_MS + 1;
  assert.ok((await client.readPage(jpeg(), 'image/jpeg')).ok, 'one probe after the pause');
});

test('an unexpected answer is never shown; a refused token is refused; a dead host is unavailable', async () => {
  const client = createTlacuiloClient(config);
  assert.deepEqual(await client.readPage(jpeg('FAKE-SHAPE'), 'image/jpeg'), { ok: false, reason: 'invalid' });
  const wrongSecret = createTlacuiloClient({ ...config, clientSecret: 'wrong' });
  assert.deepEqual(await wrongSecret.readPage(jpeg(), 'image/jpeg'), { ok: false, reason: 'refused' });
  const dead = createTlacuiloClient({ ...config, apiUrl: 'http://127.0.0.1:1', timeoutMs: 1000 });
  assert.deepEqual(await dead.readPage(jpeg(), 'image/jpeg'), { ok: false, reason: 'unavailable' });
});

test('a page is bounded: control characters removed, at most PAGE_MAX_LINES lines kept', async () => {
  const answer = fakeExtraction('') as { status: number; body: { text: { pages: { lines: { text: string; confidence: number; bbox: null }[] }[] } } };
  answer.body.text.pages[0]!.lines = Array.from({ length: PAGE_MAX_LINES + 50 }, (_, i) => ({ text: `linea\u0007 ${i}\u0000`, confidence: 0.9, bbox: null }));
  const stub: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/oauth/token')) return new Response(JSON.stringify({ access_token: 't'.repeat(40), expires_in: 600 }), { status: 200 });
    return new Response(JSON.stringify(answer.body), { status: 200 });
  };
  const client = createTlacuiloClient(config, { fetch: (i, init) => stub(i, init) });
  const out = await client.readPage(jpeg(), 'image/jpeg');
  assert.ok(out.ok);
  assert.equal(out.page.lines.length, PAGE_MAX_LINES);
  assert.equal(out.page.truncated, true);
  assert.equal(out.page.lines[0], 'linea 0');
});
