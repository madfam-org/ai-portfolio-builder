/**
 * «Cerrar sesión» revokes the Janua refresh token (RFC 7009) before it redirects, against a fake Janua on loopback
 * (`test-support/janua-revoke-fake.ts`): the form and client authentication Janua accepts, sign-out completing when
 * Janua is down, refusing or slow, the 3 s budget, the same-origin guard, and no token in any log line.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, test } from 'node:test';
import { januaEndpoints, revokeJanuaRefreshToken } from '../src/server/janua-oidc.ts';
import { signOut } from '../src/server/sign-out.ts';
import type { CvSessionToken } from '../src/server/session-token.ts';
import { FAKE_JANUA_CLIENT_ID, startFakeJanua, type FakeJanua } from '../test-support/janua-revoke-fake.ts';

const REFRESH = `rt-${randomBytes(16).toString('hex')}`;
const ID_TOKEN = `it-${randomBytes(16).toString('hex')}`;
const ACCESS = `at-${randomBytes(16).toString('hex')}`;
const COOKIE = '__Host-authjs.session-token';
const SESSION_KEY = randomBytes(32).toString('hex');

let janua: FakeJanua;
before(async () => {
  janua = await startFakeJanua();
});
after(async () => {
  await janua.close();
});

function envFor(issuer: string, secret = janua.clientSecret): Record<string, string> {
  return { AUTH_SECRET: SESSION_KEY, AUTH_JANUA_ISSUER: issuer, AUTH_JANUA_CLIENT_ID: FAKE_JANUA_CLIENT_ID, AUTH_JANUA_CLIENT_SECRET: secret };
}

function signOutRequest(origin = 'https://cv-app.madfam.io'): Request {
  return new Request('https://cv-app.madfam.io/auth/salir', {
    method: 'POST',
    headers: { host: 'cv-app.madfam.io', origin, cookie: `${COOKIE}=sealed-session; ${COOKIE}.1=sealed-chunk` },
  });
}

const session = (token: CvSessionToken | null) => async () => ({ token });
const signedIn = session({ sub: 'janua-sub-1', accessToken: ACCESS, refreshToken: REFRESH, idToken: ID_TOKEN });

function assertSignedOut(res: Response, endSessionPrefix: string): void {
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const location = new URL(res.headers.get('location') ?? '');
  assert.ok(location.toString().startsWith(endSessionPrefix), location.toString());
  assert.equal(location.searchParams.get('client_id'), FAKE_JANUA_CLIENT_ID);
  assert.equal(location.searchParams.get('post_logout_redirect_uri'), 'https://cv-app.madfam.io/');
  const cookies = res.headers.getSetCookie();
  assert.deepEqual(cookies.map((l) => l.split('=')[0]).sort(), [COOKIE, `${COOKIE}.1`]);
  for (const line of cookies) assert.match(line, /Max-Age=0; .*HttpOnly; SameSite=Lax; Secure$/);
}

function logsOf(): { lines: Record<string, unknown>[]; log: (line: Record<string, unknown>) => void } {
  const lines: Record<string, unknown>[] = [];
  return { lines, log: (line) => lines.push(line) };
}

test('discovery: the revocation endpoint comes from Janua discovery, else derived from the issuer', async () => {
  assert.equal((await januaEndpoints(janua.issuer)).revocationEndpoint, `${janua.issuer}/api/v1/oauth/revoke`);
  const down = await startFakeJanua();
  const issuer = down.issuer;
  await down.close();
  const fallback = await januaEndpoints(issuer);
  assert.equal(fallback.revocationEndpoint, `${issuer}/api/v1/oauth/revoke`);
  assert.equal(fallback.endSessionEndpoint, `${issuer}/logout`);
});

test('sign-out revokes the refresh token: form token + token_type_hint=refresh_token, client by HTTP Basic', async () => {
  janua.mode = 'ok';
  janua.revocations.length = 0;
  const { lines, log } = logsOf();
  const res = await signOut(signOutRequest(), envFor(janua.issuer), { readSession: signedIn, log });
  assertSignedOut(res, `${janua.issuer}/api/v1/oauth/logout?`);
  assert.equal(new URL(res.headers.get('location')!).searchParams.get('id_token_hint'), ID_TOKEN);
  assert.equal(janua.revocations.length, 1);
  const [sent] = janua.revocations;
  assert.equal(sent!.contentType, 'application/x-www-form-urlencoded');
  assert.equal(sent!.authorization, `Basic ${Buffer.from(`${FAKE_JANUA_CLIENT_ID}:${janua.clientSecret}`).toString('base64')}`);
  assert.deepEqual(sent!.form, { token: REFRESH, token_type_hint: 'refresh_token' }, 'no secret in the form body');
  assert.ok(janua.revoked.has(REFRESH));
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.evt, 'cv-signout');
  assert.equal(lines[0]!.revoke, 'revoked');
  assert.deepEqual(Object.keys(lines[0]!).sort(), ['evt', 'ms', 'revoke']);
});

test('sign-out completes when Janua is down: cookies expired, 303, outcome logged', async () => {
  const down = await startFakeJanua();
  const issuer = down.issuer;
  await down.close();
  const { lines, log } = logsOf();
  const res = await signOut(signOutRequest(), envFor(issuer), { readSession: signedIn, log });
  assertSignedOut(res, `${issuer}/logout?`);
  assert.deepEqual(lines.map((l) => l.revoke), ['unreachable']);
});

test('sign-out completes when Janua refuses: 503 and a wrong client secret are logged by status only', async () => {
  janua.mode = 'unavailable';
  const unavailable = logsOf();
  assertSignedOut(await signOut(signOutRequest(), envFor(janua.issuer), { readSession: signedIn, log: unavailable.log }), `${janua.issuer}/`);
  assert.deepEqual(unavailable.lines.map((l) => l.revoke), ['http_503']);

  janua.mode = 'ok';
  janua.revoked.clear();
  const refused = logsOf();
  assertSignedOut(await signOut(signOutRequest(), envFor(janua.issuer, 'wrong-secret'), { readSession: signedIn, log: refused.log }), `${janua.issuer}/`);
  assert.deepEqual(refused.lines.map((l) => l.revoke), ['http_401']);
  assert.equal(janua.revoked.size, 0);
});

test('sign-out completes when Janua is slow: it gives up at the budget and still redirects', async () => {
  janua.mode = 'slow';
  const { lines, log } = logsOf();
  const t0 = Date.now();
  const res = await signOut(signOutRequest(), envFor(janua.issuer), { readSession: signedIn, log, revokeBudgetMs: 250 });
  const elapsed = Date.now() - t0;
  assertSignedOut(res, `${janua.issuer}/`);
  assert.deepEqual(lines.map((l) => l.revoke), ['timeout']);
  assert.ok(elapsed < 2000, `took ${elapsed} ms`);
  janua.mode = 'ok';
});

test('the revocation budget is capped at 3 s, and a spent budget sends nothing', async () => {
  janua.mode = 'slow';
  janua.revocations.length = 0;
  const t0 = Date.now();
  const client = { issuer: janua.issuer, clientId: FAKE_JANUA_CLIENT_ID, clientSecret: janua.clientSecret };
  assert.equal(await revokeJanuaRefreshToken(REFRESH, client, `${janua.issuer}/api/v1/oauth/revoke`, { timeoutMs: 60_000 }), 'timeout');
  const elapsed = Date.now() - t0;
  assert.ok(elapsed >= 2900 && elapsed < 4500, `took ${elapsed} ms`);
  janua.mode = 'ok';
  janua.revocations.length = 0;
  assert.equal(await revokeJanuaRefreshToken(REFRESH, client, `${janua.issuer}/api/v1/oauth/revoke`, { timeoutMs: -5 }), 'timeout');
  assert.equal(janua.revocations.length, 0);
});

test('no session (or no refresh token): nothing is sent to Janua, nothing is logged, sign-out completes', async () => {
  janua.mode = 'ok';
  janua.revocations.length = 0;
  for (const readSession of [session(null), session({ sub: 'janua-sub-1', accessToken: 'a' }), async () => Promise.reject(new Error('boom'))]) {
    const { lines, log } = logsOf();
    const res = await signOut(signOutRequest(), envFor(janua.issuer), { readSession, log });
    assertSignedOut(res, `${janua.issuer}/`);
    assert.equal(new URL(res.headers.get('location')!).searchParams.get('id_token_hint'), null);
    assert.deepEqual(lines, []);
  }
  assert.equal(janua.revocations.length, 0);
});

test('the same-origin guard is unchanged: a cross-origin POST is 403 and revokes nothing', async () => {
  janua.revocations.length = 0;
  let read = 0;
  const res = await signOut(signOutRequest('https://evil.example'), envFor(janua.issuer), { readSession: async () => ((read += 1), { token: null }) });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: 'cross_origin' });
  assert.equal(read, 0);
  assert.equal(janua.revocations.length, 0);
  assert.equal((await signOut(signOutRequest(), {}, { readSession: signedIn })).status, 503, 'dormant without the AUTH_* settings');
});

test('no token reaches the log: the default logger writes only the outcome', async () => {
  janua.mode = 'unavailable';
  const written: string[] = [];
  const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
  // Every console method is captured (an alias, so the lint rule that keeps app code to warn/error does not apply).
  const out = console as unknown as Record<(typeof methods)[number], (...args: unknown[]) => void>;
  const saved = methods.map((m) => out[m]);
  for (const m of methods) out[m] = (...args: unknown[]) => void written.push(args.map(String).join(' '));
  try {
    assertSignedOut(await signOut(signOutRequest(), envFor(janua.issuer), { readSession: signedIn }), `${janua.issuer}/`);
  } finally {
    methods.forEach((m, i) => (out[m] = saved[i]!));
    janua.mode = 'ok';
  }
  assert.equal(written.length, 1, written.join('\n'));
  assert.deepEqual(Object.keys(JSON.parse(written[0]!)).sort(), ['evt', 'ms', 'revoke']);
  for (const secret of [REFRESH, ID_TOKEN, janua.clientSecret, SESSION_KEY, ACCESS, 'sealed-session']) {
    assert.ok(!written[0]!.includes(secret), 'no token or secret in the log line');
  }
});
