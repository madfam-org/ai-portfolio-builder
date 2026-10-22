/**
 * cv-api end to end over a REAL Postgres (as cv_app) with real RS256 tokens from a local JWKS: auth answers,
 * cross-owner 404 with an unchanged re-read, publish/public reads, the deterministic match.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { DbHandle } from '../src/server/db/client.ts';
import { handleApi } from '../src/server/api/handler.ts';
import { bearer, startTestIssuer, type TestIssuer } from '../test-support/janua-tokens.ts';
import { A, B, appDb, resetAndMigrate } from './harness.ts';

let issuer: TestIssuer;
let h: DbHandle;
let rowsRead = 0;

before(async () => {
  await resetAndMigrate();
  issuer = await startTestIssuer();
  h = appDb();
});
after(async () => {
  assert.ok(rowsRead > 0, `read ${rowsRead} rows`);
  await issuer.close();
  await h.sql.end();
});

async function api(method: string, path: string, opts: { sub?: string; token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = opts.token ? bearer(opts.token) : opts.sub ? bearer(await issuer.token({ sub: opts.sub, name: `Name ${opts.sub}` })) : {};
  const req = new Request(`http://0.0.0.0:3000${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const res = await handleApi(req, path.split('?')[0]!.slice('/api/v1/'.length).split('/'), { env: issuer.env, getDb: () => h });
  const text = await res.text();
  // Test-only: the assertions walk nested JSON response bodies.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, headers: res.headers, body: text ? (JSON.parse(text) as Record<string, any>) : null };
}

test('5. auth: 401 without a token, 403 for aud≠cv-api, 401 for HS256 with any secret', async () => {
  assert.equal((await api('GET', '/api/v1/jobs')).status, 401);
  assert.equal((await api('GET', '/api/v1/jobs', { token: await issuer.token({ sub: A }, { audience: 'voxa' }) })).status, 403);
  for (const secret of ['x', 'cv-api', 'z'.repeat(64)]) {
    assert.equal((await api('GET', '/api/v1/jobs', { token: await issuer.hs256Token(A, secret) })).status, 401);
  }
});

test('the full path: profile, items, job, tailored artifact, match, publish, public reads; B gets 404 everywhere', async () => {
  const profile = await api('PUT', '/api/v1/profile', { sub: A, body: { headline: 'Ingeniera backend', summary: 'Datos' } });
  assert.equal(profile.status, 200);
  assert.equal(profile.body?.profile.displayName, `Name ${A}`);
  assert.equal(profile.body?.profile.ownerSub, undefined, 'the owner key is never echoed');
  assert.equal((await api('PUT', '/api/v1/profile', { sub: A, body: { headline: 'x', ownerSub: B } })).status, 400, 'no mass assignment');

  const item = await api('POST', '/api/v1/profile/items', { sub: A, body: { kind: 'experience', content: { role: 'Backend', organization: 'Acme', employmentType: 'full_time', startDate: '2022-01', highlights: ['PostgreSQL a escala'] }, tags: ['PostgreSQL', 'TypeScript'] } });
  assert.equal(item.status, 201, JSON.stringify(item.body));
  assert.equal((await api('POST', '/api/v1/profile/items', { sub: A, body: { kind: 'project', content: { name: 'p', url: 'javascript:alert(1)' } } })).status, 400, 'http(s) URLs only');
  const itemId = item.body?.item.id as string;

  const job = await api('POST', '/api/v1/jobs', { sub: A, body: { title: 'Backend Engineer', company: 'X', sourceText: 'Buscamos experiencia con PostgreSQL y TypeScript.' } });
  assert.equal(job.status, 201);
  const jobId = job.body?.job.id as string;

  const match = await api('GET', `/api/v1/jobs/${jobId}/match`, { sub: A });
  assert.equal(match.status, 200);
  assert.equal(match.body?.items[0].itemId, itemId);
  assert.deepEqual(match.body?.items[0].matchedTags, ['PostgreSQL', 'TypeScript']);

  const art = await api('POST', '/api/v1/artifacts', { sub: A, body: { jobId, kind: 'cv', title: 'CV para X', content: { items: [{ itemId }] } } });
  assert.equal(art.status, 201, JSON.stringify(art.body));
  const artId = art.body?.artifact.id as string;
  const listed = await api('GET', `/api/v1/artifacts?job_id=${jobId}&kind=cv`, { sub: A });
  rowsRead += listed.body?.artifacts.length ?? 0;
  assert.equal(listed.body?.artifacts.length, 1);

  // B: every id of A is a 404 and A's rows are unchanged afterwards.
  const beforeJob = await api('GET', `/api/v1/jobs/${jobId}`, { sub: A });
  const beforeArt = await api('GET', `/api/v1/artifacts/${artId}`, { sub: A });
  for (const [method, path, body] of [
    ['GET', `/api/v1/jobs/${jobId}`],
    ['PATCH', `/api/v1/jobs/${jobId}`, { title: 'pwned' }],
    ['DELETE', `/api/v1/jobs/${jobId}`],
    ['GET', `/api/v1/jobs/${jobId}/match`],
    ['GET', `/api/v1/profile/items/${itemId}`],
    ['PATCH', `/api/v1/profile/items/${itemId}`, { tags: ['pwned'] }],
    ['DELETE', `/api/v1/profile/items/${itemId}`],
    ['GET', `/api/v1/artifacts/${artId}`],
    ['PATCH', `/api/v1/artifacts/${artId}`, { title: 'pwned' }],
    ['POST', `/api/v1/artifacts/${artId}/publish`, { visibility: 'link' }],
    ['POST', `/api/v1/artifacts/${artId}/unpublish`],
    ['DELETE', `/api/v1/artifacts/${artId}`],
    ['POST', '/api/v1/artifacts', { jobId, kind: 'cv', title: 'b' }],
  ] as const) {
    const r = await api(method, path, { sub: B, body });
    assert.equal(r.status, 404, `${method} ${path}`);
  }
  const bArt = await api('POST', '/api/v1/artifacts', { sub: B, body: { kind: 'cv', title: 'b', content: { items: [{ itemId }] } } });
  assert.equal(bArt.status, 422, 'B cannot reference A item ids');
  assert.deepEqual(await api('GET', `/api/v1/jobs/${jobId}`, { sub: A }), beforeJob);
  assert.deepEqual(await api('GET', `/api/v1/artifacts/${artId}`, { sub: A }), beforeArt);
  rowsRead += 2;

  // Draft: no public read. Reserved slugs refused. Then publish public (not indexable) and by link.
  assert.equal((await api('GET', '/api/v1/public/a/ana-cv')).status, 404);
  for (const slug of ['api', 'health', 'admin', '_x', 'ab', 'Ana']) {
    assert.equal((await api('POST', `/api/v1/artifacts/${artId}/publish`, { sub: A, body: { visibility: 'public', slug } })).status, 400, slug);
  }
  const pub = await api('POST', `/api/v1/artifacts/${artId}/publish`, { sub: A, body: { visibility: 'public', slug: 'ana-cv' } });
  assert.equal(pub.status, 200);
  const pubRead = await api('GET', '/api/v1/public/a/ana-cv');
  assert.equal(pubRead.status, 200);
  assert.equal(pubRead.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(pubRead.body?.items[0].id, itemId);
  const link = await api('POST', `/api/v1/artifacts/${artId}/publish`, { sub: A, body: { visibility: 'link' } });
  const token = link.body?.artifact.shareToken as string;
  assert.equal((await api('GET', '/api/v1/public/a/ana-cv')).status, 404, 'no longer public by slug');
  const linkRead = await api('GET', `/api/v1/public/s/${token}`);
  assert.equal(linkRead.status, 200);
  assert.equal(linkRead.headers.get('x-robots-tag'), 'noindex, nofollow');
  rowsRead += 2;

  assert.equal((await api('DELETE', `/api/v1/jobs/${jobId}`, { sub: A })).status, 409);
  assert.equal((await api('POST', `/api/v1/artifacts/${artId}/unpublish`, { sub: A })).status, 200);
  assert.equal((await api('GET', `/api/v1/public/s/${token}`)).status, 404);
});
