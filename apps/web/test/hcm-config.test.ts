import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hcmConfig, missingHcmEnv } from '../src/server/hcm/config.ts';

const full = {
  HCM_API_URL: 'https://hcm-api.madfam.io/',
  HCM_CLIENT_ID: 'jnc_test',
  HCM_CLIENT_SECRET: 'test-only',
  AUTH_JANUA_ISSUER: 'https://auth.madfam.io',
};

test('dormant by default: no HCM settings, no client', () => {
  assert.equal(hcmConfig({}), null);
  assert.deepEqual(missingHcmEnv({}).slice(0, 3), ['HCM_API_URL', 'HCM_CLIENT_ID', 'HCM_CLIENT_SECRET']);
});

test('configured: trailing slash dropped, token URL from the issuer, default 3 s budget', () => {
  assert.deepEqual(hcmConfig(full), {
    apiUrl: 'https://hcm-api.madfam.io',
    tokenUrl: 'https://auth.madfam.io/api/v1/oauth/token',
    clientId: 'jnc_test',
    clientSecret: 'test-only',
    timeoutMs: 3000,
  });
  assert.deepEqual(missingHcmEnv(full), []);
});

test('each of the three values is required', () => {
  for (const key of ['HCM_API_URL', 'HCM_CLIENT_ID', 'HCM_CLIENT_SECRET'] as const) {
    assert.equal(hcmConfig({ ...full, [key]: ' ' }), null, key);
  }
  assert.equal(hcmConfig({ ...full, AUTH_JANUA_ISSUER: '' }), null, 'no token endpoint');
});

test('https only, except loopback http; no credentials, query or fragment in the URL', () => {
  for (const bad of ['http://hcm-api.madfam.io', 'ftp://x', 'https://u:p@hcm-api.madfam.io', 'https://hcm-api.madfam.io/?a=1', 'not a url']) {
    assert.equal(hcmConfig({ ...full, HCM_API_URL: bad }), null, bad);
  }
  assert.equal(hcmConfig({ ...full, HCM_API_URL: 'http://127.0.0.1:9999' })?.apiUrl, 'http://127.0.0.1:9999');
  assert.equal(hcmConfig({ ...full, HCM_TOKEN_URL: 'http://localhost:1/t' })?.tokenUrl, 'http://localhost:1/t');
});

test('timeout is bounded', () => {
  assert.equal(hcmConfig({ ...full, HCM_TIMEOUT_MS: '1500' })?.timeoutMs, 1500);
  assert.equal(hcmConfig({ ...full, HCM_TIMEOUT_MS: '60000' })?.timeoutMs, 3000);
  assert.equal(hcmConfig({ ...full, HCM_TIMEOUT_MS: 'x' })?.timeoutMs, 3000);
});
