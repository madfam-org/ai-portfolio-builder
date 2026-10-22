/**
 * W4-S security review (2026-10-22): one regression test per hardening, each failing on the code before it.
 * - the proxy's request-body copy is capped (an unauthenticated memory exhaustion: next.config.ts);
 * - Auth.js session and sign-in flow cookies are `__Host-` on https (no sibling *.madfam.io host can plant them);
 * - every response carries Cross-Origin-Resource-Policy;
 * - the public /ready body never carries a driver error message;
 * - CSRF: a sibling host (the user-content pages host) is cross-origin for the cookie-authenticated routes.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import nextConfig from '../next.config.ts';
import { authCookies, sessionCookieName, type AuthCookie, type AuthCookieKey } from '../src/lib/auth-env.ts';
import { BASELINE_HEADERS } from '../src/lib/headers.ts';
import { readiness } from '../src/lib/meta.ts';
import { isSameOriginRequest } from '../src/lib/public-origin.ts';
import { MAX_BODY_BYTES } from '../src/server/api/limits.ts';
import { cfg } from './helpers.ts';

function bytes(size: string | number | undefined): number {
  if (typeof size === 'number') return size;
  const m = /^(\d+)(b|kb|mb)$/i.exec(size ?? '');
  assert.ok(m, `size ${String(size)} is set`);
  return Number(m[1]) * { b: 1, kb: 1024, mb: 1024 * 1024 }[m[2]!.toLowerCase() as 'b' | 'kb' | 'mb'];
}

test('the proxy copies at most 512 KiB of any request body (Next.js default: 10 MB per request, any Host)', () => {
  const cap = bytes(nextConfig.experimental?.proxyClientMaxBodySize as string | number | undefined);
  assert.ok(cap <= 512 * 1024, `cap ${cap} bytes`);
  // A truncated body must still be over the API's own limit, so it is a 413 and never a parse of a cut document.
  assert.ok(cap > MAX_BODY_BYTES, `cap ${cap} > MAX_BODY_BYTES ${MAX_BODY_BYTES}`);
});

test('https sign-in hosts: session and sign-in flow cookies are __Host- (Secure, Path=/, no Domain)', () => {
  const cookies: Record<AuthCookieKey, AuthCookie> | undefined = authCookies({});
  assert.ok(cookies, 'set for the production app host');
  const keys: AuthCookieKey[] = ['sessionToken', 'callbackUrl', 'pkceCodeVerifier', 'state', 'nonce'];
  for (const key of keys) {
    const c: AuthCookie = cookies[key];
    assert.match(c.name, /^__Host-authjs\./, key);
    assert.equal(c.options.secure, true, key);
    assert.equal(c.options.path, '/', key);
    assert.equal(c.options.httpOnly, true, key);
    assert.equal(c.options.sameSite, 'lax', key);
    assert.equal('domain' in c.options, false, key);
  }
  assert.equal(cookies.state.options.maxAge, 900);
  assert.equal(sessionCookieName({}), cookies.sessionToken.name);
  // Loopback development keeps Auth.js's plain defaults (browsers drop Secure cookies over http).
  assert.equal(authCookies({ AUTH_PUBLIC_HOSTS: 'cv-app.localhost' }), undefined);
  assert.equal(sessionCookieName({ AUTH_PUBLIC_HOSTS: 'cv-app.localhost' }), 'authjs.session-token');
});

test('every response carries Cross-Origin-Resource-Policy: same-origin', () => {
  assert.equal(BASELINE_HEADERS['Cross-Origin-Resource-Policy'], 'same-origin');
});

test('/ready (public, any Host) names the failed dependency but never the driver message', async () => {
  const errors: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void errors.push(args.join(' '));
  try {
    const down = await readiness(() => cfg(), {
      env: {},
      pingDatabase: async () => {
        throw new Error('getaddrinfo ENOTFOUND pgbouncer.data.svc.cluster.local');
      },
    });
    assert.equal(down.status, 503);
    assert.doesNotMatch(JSON.stringify(down.body), /pgbouncer|ENOTFOUND|svc/);
  } finally {
    console.error = original;
  }
  assert.match(String(errors[0]), /ENOTFOUND/, 'the reason is logged for operators');
});

test('CSRF: the pages host (same site, user content) and other sibling hosts are cross-origin for cv-app', () => {
  const post = (origin: string) => new Request('http://0.0.0.0:3000/api/v1/jobs', { method: 'POST', headers: { host: 'cv-app.madfam.io', origin } });
  for (const origin of ['https://cv-p.madfam.io', 'https://cv.madfam.io', 'https://cv-api.madfam.io', 'https://auth.madfam.io', 'http://cv-app.madfam.io.evil.example']) {
    assert.equal(isSameOriginRequest(post(origin), {}), false, origin);
  }
  assert.equal(isSameOriginRequest(post('https://cv-app.madfam.io'), {}), true);
});

test('a session sealed under the __Host- name is read back under sessionCookieName(); a __Secure- one is not a session', async () => {
  // The same getToken call the server makes (server/server-session.ts, documentos/load.ts): name and salt = sessionCookieName.
  const { encode, getToken } = await import('next-auth/jwt');
  // A throwaway key per run (never a literal: the gitleaks `auth-secret` rule would rightly flag one).
  const env = { AUTH_SECRET: randomBytes(32).toString('hex') };
  const name = sessionCookieName({});
  assert.equal(name, '__Host-authjs.session-token');
  const read = async (cookie: string) =>
    getToken({ req: { headers: new Headers({ cookie: `${cookie}=${await encode({ token: { sub: 'janua|w4' }, secret: env.AUTH_SECRET, salt: cookie, maxAge: 600 })}` }) }, secret: env.AUTH_SECRET, secureCookie: true, cookieName: name, salt: name });
  assert.equal((await read(name))?.sub, 'janua|w4');
  // A cookie under the old __Secure- name (which a sibling host could plant with Domain=.madfam.io) is ignored.
  assert.equal(await read('__Secure-authjs.session-token'), null);
});
