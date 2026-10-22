import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authenticate, bearerToken } from '../src/server/janua.ts';
import { startTestIssuer, type TestIssuer } from '../test-support/janua-tokens.ts';

let issuer: TestIssuer;
before(async () => {
  issuer = await startTestIssuer();
});
after(async () => {
  await issuer.close();
});

test('a valid RS256 token of audience cv-api yields its sub', async () => {
  const r = await authenticate(`Bearer ${await issuer.token({ sub: 'janua|abc' })}`, issuer.config);
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.sub, 'janua|abc');
});

test('missing or malformed Authorization is 401', async () => {
  for (const h of [null, '', 'Bearer', 'Basic Zm9vOmJhcg==', 'Bearer not a token', 'Bearer abc.def.ghi']) {
    const r = await authenticate(h, issuer.config);
    assert.equal(r.ok, false, String(h));
    assert.equal(!r.ok && r.status, 401, String(h));
  }
  assert.equal(bearerToken('bearer x'), null);
});

test('HS256 (any secret) and alg none are 401, never accepted (R42)', async () => {
  for (const secret of ['a', 'y'.repeat(40), issuer.config.jwksUrl]) {
    const r = await authenticate(`Bearer ${await issuer.hs256Token('user-a', secret)}`, issuer.config);
    assert.deepEqual(r, { ok: false, status: 401, error: 'invalid_token' });
  }
  const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(
    JSON.stringify({ sub: 'user-a', iss: issuer.config.issuer, aud: 'cv-api', exp: Math.floor(Date.now() / 1000) + 60 }),
  ).toString('base64url')}.`;
  assert.deepEqual(await authenticate(`Bearer ${none}`, issuer.config), { ok: false, status: 401, error: 'invalid_token' });
});

test('wrong audience is 403; wrong issuer, expired, unknown key and no sub are 401', async () => {
  assert.deepEqual(await authenticate(`Bearer ${await issuer.token({ sub: 'a' }, { audience: 'voxa' })}`, issuer.config), {
    ok: false,
    status: 403,
    error: 'wrong_audience',
  });
  for (const token of [
    await issuer.token({ sub: 'a' }, { issuer: 'https://evil.example' }),
    await issuer.token({ sub: 'a' }, { expiresIn: '-2m' }),
    await issuer.foreignToken('a'),
    await issuer.token({}),
  ]) {
    const r = await authenticate(`Bearer ${token}`, issuer.config);
    assert.equal(!r.ok && r.status, 401);
  }
});

test('JWKS unreachable is 503 (fail closed), never anonymous', async () => {
  const token = await issuer.token({ sub: 'a' });
  const r = await authenticate(`Bearer ${token}`, { ...issuer.config, jwksUrl: 'http://127.0.0.1:9/.well-known/jwks.json' });
  assert.deepEqual(r, { ok: false, status: 503, error: 'jwks_unavailable' });
});
