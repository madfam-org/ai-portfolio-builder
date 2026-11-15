/** `GET`/`POST /api/v1/jobs/intake/ocr` (server/tlacuilo/route.ts) with an injected client: no network. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchRoute } from '../src/lib/api-routes.ts';
import { RateLimiter } from '../src/server/ingest/rate-limit.ts';
import type { OcrMediaType, OcrResult, TlacuiloOcrPort } from '../src/server/tlacuilo/client.ts';
import { OCR_MAX_BYTES, OCR_MAX_PAGES, ocrPage, ocrStatus, sniffImage } from '../src/server/tlacuilo/route.ts';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const page = { lines: ['Vacante: Asesora de ventas', 'Empresa: Boutique Ejemplo'], confidence: 0.9, verdict: 'good' as const, source: 'ocr' as const, truncated: false };

function fakeClient(result: OcrResult = { ok: true, page }) {
  const seen: { bytes: number; mediaType: OcrMediaType }[] = [];
  const client: TlacuiloOcrPort = {
    readPage: async (bytes, mediaType) => {
      seen.push({ bytes: bytes.byteLength, mediaType });
      return result;
    },
  };
  return { client, seen };
}
const post = (body: Uint8Array | string, type: string | null, extra: Record<string, string> = {}) =>
  new Request('https://cv-api.test/api/v1/jobs/intake/ocr', { method: 'POST', body: body as BodyInit, headers: { ...(type ? { 'Content-Type': type } : {}), ...extra } });
const quiet = { log: () => {} };

test('the route exists for GET and POST only, under the intake', () => {
  assert.deepEqual(matchRoute(['jobs', 'intake', 'ocr']), { kind: 'authed', name: 'job-intake-ocr', ids: [], methods: ['GET', 'POST'] });
  assert.equal(matchRoute(['jobs', 'intake', 'other']), null);
  assert.equal(matchRoute(['jobs', 'intake', 'ocr', 'x']), null);
});

test('status: off without settings, on with them; the limits the browser prepares pages for', async () => {
  const off = (await ocrStatus({}).json()) as { enabled: boolean };
  assert.equal(off.enabled, false);
  const on = (await ocrStatus({ TLACUILO_API_URL: 'http://tlacuilo.tlacuilo.svc', TLACUILO_CLIENT_ID: 'c', TLACUILO_CLIENT_SECRET: 's', AUTH_JANUA_ISSUER: 'https://auth.madfam.io' }).json()) as Record<string, unknown>;
  assert.deepEqual(on, { enabled: true, maxPages: OCR_MAX_PAGES, maxBytes: OCR_MAX_BYTES, mediaTypes: ['image/jpeg', 'image/png'] });
  assert.ok(OCR_MAX_BYTES < 512 * 1024, 'a page fits under the proxy buffer');
});

test('dormant: 503 not_configured, and nothing is read', async () => {
  const res = await ocrPage('owner', post(JPEG, 'image/jpeg'), {}, quiet);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'not_configured' });
});

test('a page image in, its lines out; the bytes reach the client untouched; no-store', async () => {
  const { client, seen } = fakeClient();
  const res = await ocrPage('owner', post(JPEG, 'image/jpeg'), {}, { client, ...quiet });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await res.json(), { page });
  assert.deepEqual(seen, [{ bytes: JPEG.byteLength, mediaType: 'image/jpeg' }]);
  const png = await ocrPage('owner', post(PNG, 'image/png; charset=binary'), {}, { client, ...quiet });
  assert.equal(png.status, 200);
  assert.equal(seen[1]!.mediaType, 'image/png');
});

test('refused before tlacuilo is asked: wrong type, a type that lies, an oversized body', async () => {
  const { client, seen } = fakeClient();
  const deps = { client, ...quiet };
  assert.equal((await ocrPage('o', post('{"a":1}', 'application/json'), {}, deps)).status, 415);
  assert.equal((await ocrPage('o', post(JPEG, null), {}, deps)).status, 415);
  assert.equal((await ocrPage('o', post(JPEG, 'application/pdf'), {}, deps)).status, 415);
  const lie = await ocrPage('o', post(PNG, 'image/jpeg'), {}, deps);
  assert.equal(lie.status, 400);
  assert.deepEqual(await lie.json(), { error: 'invalid_image' });
  assert.equal((await ocrPage('o', post(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), 'image/png'), {}, deps)).status, 400);
  const big = new Uint8Array(OCR_MAX_BYTES + 1);
  big.set(JPEG);
  const tooBig = await ocrPage('o', post(big, 'image/jpeg'), {}, deps);
  assert.equal(tooBig.status, 413);
  assert.equal(seen.length, 0, 'tlacuilo was never asked');
});

test('the per-owner ceiling: 429 with Retry-After, per person, and a rejected upload costs nothing', async () => {
  const { client, seen } = fakeClient();
  const limiter = new RateLimiter([{ max: 2, ms: 60_000 }]);
  const deps = { client, limiter, ...quiet };
  assert.equal((await ocrPage('a', post(PNG, 'image/jpeg'), {}, deps)).status, 400, 'a refused upload takes no slot');
  assert.equal((await ocrPage('a', post(JPEG, 'image/jpeg'), {}, deps)).status, 200);
  assert.equal((await ocrPage('a', post(JPEG, 'image/jpeg'), {}, deps)).status, 200);
  const limited = await ocrPage('a', post(JPEG, 'image/jpeg'), {}, deps);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) >= 1);
  assert.equal(((await limited.json()) as { error: string }).error, 'rate_limited');
  assert.equal((await ocrPage('b', post(JPEG, 'image/jpeg'), {}, deps)).status, 200, 'another person is unaffected');
  assert.equal(seen.length, 3);
});

test('failures keep their meaning: the page (422) or the service (503 with Retry-After)', async () => {
  const cases: [OcrResult & { ok: false }, number, string][] = [
    [{ ok: false, reason: 'unreadable' }, 422, 'ocr_unreadable'],
    [{ ok: false, reason: 'too_large' }, 422, 'ocr_too_large'],
    [{ ok: false, reason: 'busy' }, 503, 'ocr_busy'],
    [{ ok: false, reason: 'timeout' }, 503, 'ocr_timeout'],
    [{ ok: false, reason: 'unavailable' }, 503, 'ocr_unavailable'],
    [{ ok: false, reason: 'refused' }, 503, 'ocr_unavailable'],
    [{ ok: false, reason: 'invalid' }, 503, 'ocr_unavailable'],
  ];
  for (const [result, status, error] of cases) {
    const lines: Record<string, unknown>[] = [];
    const res = await ocrPage('o', post(JPEG, 'image/jpeg'), {}, { client: fakeClient(result).client, limiter: new RateLimiter([{ max: 99, ms: 1000 }]), log: (l) => lines.push(l) });
    assert.equal(res.status, status, result.reason);
    assert.equal(((await res.json()) as { error: string }).error, error);
    if (status === 503) assert.ok(res.headers.get('retry-after'));
    assert.deepEqual(Object.keys(lines[0]!).sort(), ['bytes', 'evt', 'ms', 'outcome'], 'the log carries no content');
  }
  assert.equal(cases.length, 7);
});

test('signatures: JPEG and PNG only', () => {
  assert.equal(sniffImage(JPEG), 'image/jpeg');
  assert.equal(sniffImage(PNG), 'image/png');
  assert.equal(sniffImage(new Uint8Array([0x25, 0x50, 0x44, 0x46])), null);
  assert.equal(sniffImage(new Uint8Array()), null);
});
