import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { isApiV1Path, matchRoute } from '../src/lib/api-routes.ts';
import { handleApi } from '../src/server/api/handler.ts';
import { bearer, startTestIssuer, type TestIssuer } from '../test-support/janua-tokens.ts';

let issuer: TestIssuer;
before(async () => {
  issuer = await startTestIssuer();
});
after(async () => {
  await issuer.close();
});

const req = (method: string, headers: Record<string, string> = {}, body?: string) =>
  new Request('http://0.0.0.0:3000/api/v1/x', { method, headers, body });
const call = (segments: string[], r: Request, env: Record<string, string> = {}) => handleApi(r, segments, { env, getDb: () => null });

test('dormant: no issuer or no database is 503 not_configured, before any token is read', async () => {
  for (const [segs, env] of [
    [['me'], {}],
    [['profile'], issuer.env],
    [['jobs'], issuer.env],
    [['artifacts'], {}],
    [['public', 'a', 'mi-cv'], {}],
  ] as const) {
    const res = await call([...segs], req('GET'), { ...env });
    assert.equal(res.status, 503, segs.join('/'));
    assert.deepEqual(await res.json(), { error: 'not_configured' });
  }
});

test('/me: 401 without a token, 401 for HS256, 403 for another audience, 200 {sub}', async () => {
  const env = issuer.env;
  assert.equal((await call(['me'], req('GET'), env)).status, 401);
  assert.equal((await call(['me'], req('GET', bearer(await issuer.hs256Token('a'))), env)).status, 401);
  assert.equal((await call(['me'], req('GET', bearer(await issuer.token({ sub: 'a' }, { audience: 'other' }))), env)).status, 403);
  const ok = await call(['me'], req('GET', bearer(await issuer.token({ sub: 'janua|a' }))), env);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { sub: 'janua|a' });
});

test('unknown paths are 404, known paths with the wrong method are 405, ids must be UUIDs', async () => {
  assert.equal((await call(['nope'], req('GET'))).status, 404);
  assert.equal((await call(['jobs', '1'], req('GET'))).status, 404);
  assert.equal((await call(['jobs', 'not-a-uuid', 'match'], req('GET'))).status, 404);
  const r = await call(['me'], req('POST'));
  assert.equal(r.status, 405);
  assert.equal(r.headers.get('allow'), 'GET');
});

test('the route table is the proxy allow-list', () => {
  const id = '0b9d2c4e-6f1a-4b2c-9d3e-1f2a3b4c5d6e';
  for (const p of ['/api/v1/me', '/api/v1/profile', '/api/v1/profile/items', `/api/v1/profile/items/${id}`, '/api/v1/jobs', `/api/v1/jobs/${id}`, `/api/v1/jobs/${id}/match`, '/api/v1/artifacts', `/api/v1/artifacts/${id}`, `/api/v1/artifacts/${id}/publish`, `/api/v1/artifacts/${id}/unpublish`, '/api/v1/public/a/mi-cv', `/api/v1/public/s/${'A'.repeat(43)}`]) {
    assert.ok(isApiV1Path(p), p);
  }
  for (const p of ['/api/v1/meta', '/api/v1', '/api/v1/', '/api/v1/jobs/x', '/api/v1/public/a/A', '/api/v1/public/s/short', '/api/v1/me/extra', '/api/v2/me']) {
    assert.ok(!isApiV1Path(p), p);
  }
  assert.deepEqual(matchRoute(['public', 'a', 'mi-cv']), { kind: 'public-slug', slug: 'mi-cv' });
});

test('public slugs: the pattern, reserved words, no leading _ or .', async () => {
  const { isAllowedSlug, RESERVED_SLUGS } = await import('../src/lib/api-routes.ts');
  for (const ok of ['ana-cv', 'abc', 'a1b', `a${'b'.repeat(62)}c`]) assert.ok(isAllowedSlug(ok), ok);
  for (const bad of ['ab', 'Ana', '-ana', 'ana-', 'ana_cv', 'ana.cv', `a${'b'.repeat(63)}c`, '_next', '.env', ...RESERVED_SLUGS]) {
    assert.ok(!isAllowedSlug(bad), bad);
  }
  for (const word of ['health', 'ready', 'l', 'api', 'app', 'admin', 'auth', 'p', 's', 'robots.txt', 'sitemap.xml', 'favicon.ico', '_next', 'static', 'assets', 'www', 'madfam', 'legal', 'privacy', 'terms']) {
    assert.ok(RESERVED_SLUGS.has(word), word);
  }
  assert.equal(matchRoute(['public', 'a', 'admin']), null);
});
