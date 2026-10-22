import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiErrorMessage, createApiClient, errorKind } from '../src/lib/client/api.ts';
import { APP_COPY } from '../src/lib/copy/app.ts';

function fake(status: number, body: unknown, calls: { url: string; init?: RequestInit }[] = []) {
  return createApiClient(async (url, init) => {
    calls.push({ url, init });
    return new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  });
}

test('same-origin calls: the path, the method, a JSON body, never cached', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const res = await fake(201, { job: { id: 'j' } }, calls).createJob({ title: 'Backend', sourceText: 'texto' });
  assert.equal(res.ok, true);
  assert.equal(calls[0]?.url, '/api/v1/jobs');
  assert.equal(calls[0]?.init?.method, 'POST');
  assert.equal(calls[0]?.init?.cache, 'no-store');
  assert.equal(calls[0]?.init?.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { title: 'Backend', sourceText: 'texto' });
  await fake(200, { artifacts: [] }, calls).listArtifacts({ jobId: 'abc', kind: 'cv' });
  assert.equal(calls[1]?.url, '/api/v1/artifacts?job_id=abc&kind=cv');
  await fake(200, { items: [] }, calls).reorderItems(['a', 'b']);
  assert.equal(calls[2]?.url, '/api/v1/profile/items/reorder');
  await fake(201, { artifacts: [] }, calls).createArtifactSet({ jobId: null, artifacts: [{ kind: 'cv', title: 'x' }] });
  assert.equal(calls[3]?.url, '/api/v1/artifacts/batch');
});

test('dormant: 503 not_configured is its own state, not an outage', async () => {
  const res = await fake(503, { error: 'not_configured' }).listJobs();
  assert.deepEqual(res, { ok: false, error: { kind: 'not_configured', status: 503, code: 'not_configured' } });
  const down = await fake(503, { error: 'database_unavailable' }).listJobs();
  assert.equal(!down.ok && down.error.kind, 'unavailable');
});

test('every failure maps to a page state, with issues and item ids kept', async () => {
  const invalid = await fake(400, { error: 'invalid_body', issues: [{ path: 'title', message: 'Required' }] }).createJob({ title: '', sourceText: '' });
  assert.ok(!invalid.ok);
  assert.equal(invalid.error.kind, 'invalid');
  assert.deepEqual(invalid.error.issues, [{ path: 'title', message: 'Required' }]);
  const foreign = await fake(422, { error: 'unknown_item_ids', itemIds: ['x'] }).reorderItems(['x']);
  assert.ok(!foreign.ok);
  assert.deepEqual(foreign.error.itemIds, ['x']);
  const cases: [number, string | null, string][] = [
    [401, 'not_signed_in', 'not_signed_in'],
    [403, 'cross_origin', 'forbidden'],
    [404, 'not_found', 'not_found'],
    [409, 'slug_taken', 'conflict'],
    [413, 'body_too_large', 'invalid'],
    [429, 'publish_limit', 'rate_limited'],
    [500, 'internal', 'unavailable'],
    [418, null, 'error'],
  ];
  for (const [status, code, kind] of cases) assert.equal(errorKind(status, code), kind, `${status}`);
  const offline = await createApiClient(async () => {
    throw new TypeError('fetch failed');
  }).me();
  assert.deepEqual(offline, { ok: false, error: { kind: 'network', status: 0, code: null } });
});

test('each state has es-MX and en copy', () => {
  for (const locale of ['es', 'en'] as const) {
    const msg = apiErrorMessage({ kind: 'not_configured', status: 503, code: 'not_configured' }, APP_COPY[locale].states);
    assert.equal(msg, APP_COPY[locale].states.notConfigured);
    assert.ok(msg.length > 10);
  }
});
