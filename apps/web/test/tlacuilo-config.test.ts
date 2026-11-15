import assert from 'node:assert/strict';
import { test } from 'node:test';
import { missingTlacuiloEnv, tlacuiloConfig } from '../src/server/tlacuilo/config.ts';

const full = {
  TLACUILO_API_URL: 'http://tlacuilo.tlacuilo.svc.cluster.local/',
  TLACUILO_CLIENT_ID: 'jnc_test',
  TLACUILO_CLIENT_SECRET: 'test-only',
  AUTH_JANUA_ISSUER: 'https://auth.madfam.io',
};

test('dormant by default: no tlacuilo settings, no client', () => {
  assert.equal(tlacuiloConfig({}), null);
  assert.deepEqual(missingTlacuiloEnv({}).slice(0, 3), ['TLACUILO_API_URL', 'TLACUILO_CLIENT_ID', 'TLACUILO_CLIENT_SECRET']);
});

test('configured: trailing slash dropped, token URL from the issuer, 45 s page budget', () => {
  assert.deepEqual(tlacuiloConfig(full), {
    apiUrl: 'http://tlacuilo.tlacuilo.svc.cluster.local',
    tokenUrl: 'https://auth.madfam.io/api/v1/oauth/token',
    clientId: 'jnc_test',
    clientSecret: 'test-only',
    timeoutMs: 45_000,
  });
  assert.deepEqual(missingTlacuiloEnv(full), []);
  assert.equal(tlacuiloConfig({ ...full, TLACUILO_TIMEOUT_MS: '20000' })?.timeoutMs, 20_000);
  assert.equal(tlacuiloConfig({ ...full, TLACUILO_TIMEOUT_MS: '5' })?.timeoutMs, 45_000, 'an absurd budget falls back');
});

test('each of the three values is required, and a token endpoint', () => {
  for (const key of ['TLACUILO_API_URL', 'TLACUILO_CLIENT_ID', 'TLACUILO_CLIENT_SECRET'] as const) {
    assert.equal(tlacuiloConfig({ ...full, [key]: ' ' }), null, key);
  }
  assert.equal(tlacuiloConfig({ ...full, AUTH_JANUA_ISSUER: '' }), null, 'no token endpoint');
});

test('the API address: https, loopback http, or http to a cluster Service; never a public http host', () => {
  const ok = ['https://tlacuilo.example.test', 'http://127.0.0.1:9999', 'http://localhost:1', 'http://tlacuilo.tlacuilo.svc', 'http://tlacuilo.tlacuilo.svc.cluster.local:80'];
  for (const url of ok) assert.ok(tlacuiloConfig({ ...full, TLACUILO_API_URL: url }), url);
  const bad = ['http://tlacuilo.madfam.io', 'http://svc.cluster.local.evil.example', 'http://evil.example/.svc', 'ftp://x', 'https://u:p@tlacuilo.example.test', 'https://tlacuilo.example.test/?a=1', 'not a url'];
  for (const url of bad) {
    assert.equal(tlacuiloConfig({ ...full, TLACUILO_API_URL: url }), null, url);
    assert.ok(missingTlacuiloEnv({ ...full, TLACUILO_API_URL: url }).length > 0, url);
  }
  assert.equal(tlacuiloConfig({ ...full, TLACUILO_TOKEN_URL: 'http://tlacuilo.tlacuilo.svc/t' }), null, 'the token endpoint is never plain http off loopback');
});
