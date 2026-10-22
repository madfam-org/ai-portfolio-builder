import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  authPublicHosts,
  databasePoolMax,
  isSignInConfigured,
  januaClientConfig,
  migrationDatabaseUrl,
  missingSignInEnv,
  runtimeDatabaseUrl,
  secureAuthCookies,
  sessionCookieName,
  verifierConfig,
} from '../src/lib/auth-env.ts';
import { isSameOriginRequest, resolvePublicOrigin, safeRedirectPath } from '../src/lib/public-origin.ts';

const FULL = { AUTH_SECRET: 's', AUTH_JANUA_ISSUER: 'https://auth.madfam.io/', AUTH_JANUA_CLIENT_ID: 'id', AUTH_JANUA_CLIENT_SECRET: 'cs' };

test('sign-in is dormant unless every AUTH_* value is set', () => {
  assert.equal(isSignInConfigured({}), false);
  assert.deepEqual(missingSignInEnv({}), ['AUTH_SECRET', 'AUTH_JANUA_ISSUER', 'AUTH_JANUA_CLIENT_ID', 'AUTH_JANUA_CLIENT_SECRET']);
  for (const key of Object.keys(FULL)) {
    const env: Record<string, string> = { ...FULL, [key]: ' ' };
    assert.equal(isSignInConfigured(env), false, key);
    assert.equal(januaClientConfig(env), null, key);
  }
  assert.equal(isSignInConfigured(FULL), true);
  assert.deepEqual(januaClientConfig(FULL), { issuer: 'https://auth.madfam.io', clientId: 'id', clientSecret: 'cs' });
});

test('the API verifier needs only the issuer; audience cv-api and the JWKS default from it', () => {
  assert.equal(verifierConfig({}), null);
  assert.equal(verifierConfig({ AUTH_JANUA_ISSUER: 'http://auth.madfam.io' }), null, 'plain http is refused off loopback');
  assert.deepEqual(verifierConfig({ AUTH_JANUA_ISSUER: 'https://auth.madfam.io' }), {
    issuer: 'https://auth.madfam.io',
    audience: 'cv-api',
    jwksUrl: 'https://auth.madfam.io/.well-known/jwks.json',
  });
});

test('runtime uses APP_DATABASE_URL; DATABASE_URL (the owner) only in development/test; migrations use the owner', () => {
  assert.equal(runtimeDatabaseUrl({}), null);
  assert.equal(runtimeDatabaseUrl({ DATABASE_URL: 'postgres://owner', NODE_ENV: 'production' }), null);
  assert.equal(runtimeDatabaseUrl({ DATABASE_URL: 'postgres://owner', NODE_ENV: 'test' }), 'postgres://owner');
  assert.equal(runtimeDatabaseUrl({ APP_DATABASE_URL: 'postgres://app', DATABASE_URL: 'postgres://owner' }), 'postgres://app');
  assert.equal(migrationDatabaseUrl({ APP_DATABASE_URL: 'postgres://app' }), null);
  assert.equal(migrationDatabaseUrl({ DATABASE_URL: 'postgres://owner' }), 'postgres://owner');
  assert.equal(migrationDatabaseUrl({ DATABASE_URL: 'postgres://owner', DIRECT_DATABASE_URL: 'postgres://direct' }), 'postgres://direct');
  assert.equal(databasePoolMax({}), 3);
  assert.equal(databasePoolMax({ DATABASE_POOL_MAX: '5' }), 5);
  assert.throws(() => databasePoolMax({ DATABASE_POOL_MAX: '0' }));
});

test('sign-in answers on the app host only; host-only __Host- cookie in production', () => {
  assert.deepEqual(authPublicHosts({}), ['cv-app.madfam.io']);
  assert.deepEqual(authPublicHosts({ CV_HOST_APP: 'cv-app.localhost' }), ['cv-app.localhost']);
  assert.equal(secureAuthCookies({}), true);
  assert.equal(sessionCookieName({}), '__Host-authjs.session-token');
  assert.equal(sessionCookieName({ AUTH_PUBLIC_HOSTS: 'cv-app.localhost' }), 'authjs.session-token');
});

test('public origin: allow-listed Host only; a differing X-Forwarded-Host is refused', () => {
  const h = (o: Record<string, string>) => new Headers(o);
  assert.deepEqual(resolvePublicOrigin(h({ host: 'cv-app.madfam.io' }), {}), { ok: true, origin: 'https://cv-app.madfam.io', host: 'cv-app.madfam.io' });
  for (const host of ['cv.madfam.io', 'cv-api.madfam.io', 'evil.example', '0.0.0.0:3000']) {
    assert.equal(resolvePublicOrigin(h({ host }), {}).ok, false, host);
  }
  assert.equal(resolvePublicOrigin(h({ host: 'cv-app.madfam.io', 'x-forwarded-host': 'evil.example' }), {}).ok, false);
  assert.deepEqual(resolvePublicOrigin(h({ host: 'cv-app.madfam.io', 'x-forwarded-proto': 'http' }), {}), { ok: true, origin: 'https://cv-app.madfam.io', host: 'cv-app.madfam.io' });
  assert.deepEqual(resolvePublicOrigin(h({ host: 'cv-app.localhost:3000' }), { CV_HOST_APP: 'cv-app.localhost' }), { ok: true, origin: 'http://cv-app.localhost:3000', host: 'cv-app.localhost:3000' });
  const post = (headers: Record<string, string>) => new Request('http://0.0.0.0:3000/auth/salir', { method: 'POST', headers });
  assert.equal(isSameOriginRequest(post({ host: 'cv-app.madfam.io', origin: 'https://cv-app.madfam.io' }), {}), true);
  assert.equal(isSameOriginRequest(post({ host: 'cv-app.madfam.io', origin: 'https://evil.example' }), {}), false);
  assert.equal(isSameOriginRequest(post({ host: 'cv-app.madfam.io', origin: 'null' }), {}), false);
  assert.equal(isSameOriginRequest(post({ host: 'cv-app.madfam.io' }), {}), false);
  assert.equal(isSameOriginRequest(post({ host: 'cv-app.madfam.io', 'sec-fetch-site': 'same-origin' }), {}), true);
  assert.equal(safeRedirectPath('//evil.example'), '/');
  assert.equal(safeRedirectPath('https://evil.example'), '/');
  assert.equal(safeRedirectPath('/en'), '/en');
});
