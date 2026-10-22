/**
 * W4-S abuse ceilings over a REAL Postgres (as cv_app): per-owner row quotas on items, jobs and artifacts (single and
 * batch). The ceilings are lowered through `deps.quotas` so the test stays fast; the production values live in
 * src/server/api/limits.ts. Another owner is never affected by A's usage.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { DbHandle } from '../src/server/db/client.ts';
import { handleApi } from '../src/server/api/handler.ts';
import { OWNER_QUOTAS } from '../src/server/api/limits.ts';
import { bearer, startTestIssuer, type TestIssuer } from '../test-support/janua-tokens.ts';
import { A, B, appDb, resetAndMigrate } from './harness.ts';

let issuer: TestIssuer;
let h: DbHandle;
const QUOTAS = { items: 2, jobs: 2, artifacts: 3 };

before(async () => {
  await resetAndMigrate();
  issuer = await startTestIssuer();
  h = appDb();
});
after(async () => {
  await issuer.close();
  await h.sql.end();
});

async function api(sub: string, method: string, path: string, body?: unknown) {
  const req = new Request(`http://0.0.0.0:3000${path}`, { method, headers: bearer(await issuer.token({ sub })), body: body === undefined ? undefined : JSON.stringify(body) });
  const res = await handleApi(req, path.slice('/api/v1/'.length).split('/'), { env: issuer.env, getDb: () => h, quotas: QUOTAS });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : null };
}

const skill = (name: string) => ({ kind: 'skill', content: { name } });
const job = (title: string) => ({ title, sourceText: `Puesto de ${title}` });
const artifact = (title: string) => ({ kind: 'cv', title });

test('production ceilings exist and are sane (items match the reorder maximum)', () => {
  assert.deepEqual(OWNER_QUOTAS, { items: 500, jobs: 500, artifacts: 1000 });
});

test('items: the owner stops at the ceiling (429 quota_exceeded, nothing stored); another owner is unaffected', async () => {
  assert.equal((await api(A, 'POST', '/api/v1/profile/items', skill('SQL'))).status, 201);
  assert.equal((await api(A, 'POST', '/api/v1/profile/items', skill('Go'))).status, 201);
  const over = await api(A, 'POST', '/api/v1/profile/items', skill('Rust'));
  assert.equal(over.status, 429);
  assert.deepEqual(over.body, { error: 'quota_exceeded', resource: 'items', limit: 2 });
  const list = await api(A, 'GET', '/api/v1/profile/items');
  assert.equal((list.body?.items as unknown[]).length, 2, 'the refused item was not stored');
  assert.equal((await api(B, 'POST', '/api/v1/profile/items', skill('SQL'))).status, 201, 'B has its own quota');
  // Deleting frees room again.
  const first = (list.body?.items as { id: string }[])[0]!.id;
  assert.equal((await api(A, 'DELETE', `/api/v1/profile/items/${first}`)).status, 204);
  assert.equal((await api(A, 'POST', '/api/v1/profile/items', skill('Rust'))).status, 201);
});

test('jobs: the owner stops at the ceiling', async () => {
  assert.equal((await api(A, 'POST', '/api/v1/jobs', job('Uno'))).status, 201);
  assert.equal((await api(A, 'POST', '/api/v1/jobs', job('Dos'))).status, 201);
  const over = await api(A, 'POST', '/api/v1/jobs', job('Tres'));
  assert.equal(over.status, 429);
  assert.deepEqual(over.body, { error: 'quota_exceeded', resource: 'jobs', limit: 2 });
  assert.equal(((await api(A, 'GET', '/api/v1/jobs')).body?.jobs as unknown[]).length, 2);
});

test('artifacts: single creates and the batch both count; a batch that would cross the ceiling stores nothing', async () => {
  assert.equal((await api(A, 'POST', '/api/v1/artifacts', artifact('CV 1'))).status, 201);
  const batch = await api(A, 'POST', '/api/v1/artifacts/batch', { artifacts: [artifact('CV 2'), artifact('CV 3')] });
  assert.equal(batch.status, 201, JSON.stringify(batch.body));
  const over = await api(A, 'POST', '/api/v1/artifacts/batch', { artifacts: [artifact('CV 4')] });
  assert.equal(over.status, 429);
  assert.deepEqual(over.body, { error: 'quota_exceeded', resource: 'artifacts', limit: 3 });
  assert.equal((await api(A, 'POST', '/api/v1/artifacts', artifact('CV 5'))).status, 429);
  assert.equal(((await api(A, 'GET', '/api/v1/artifacts')).body?.artifacts as unknown[]).length, 3);
  assert.equal((await api(B, 'POST', '/api/v1/artifacts/batch', { artifacts: [artifact('a'), artifact('b'), artifact('c')] })).status, 201, 'B has its own quota');
});
