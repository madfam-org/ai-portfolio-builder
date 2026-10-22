import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BASELINE_HEADERS, LOCKED_CSP, htmlCsp, newNonce, robotsTag } from '../src/lib/headers.ts';
import { cfg } from './helpers.ts';

function directive(csp: string, name: string): string {
  const d = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${name} `));
  assert.ok(d, `${name} present`);
  return d;
}

test('HTML CSP: per-request nonce, strict-dynamic, no unsafe-inline or unsafe-eval in production', () => {
  const csp = htmlCsp('abc123==', false);
  const script = directive(csp, 'script-src');
  assert.match(script, /'nonce-abc123=='/);
  assert.match(script, /'strict-dynamic'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  assert.match(directive(csp, 'style-src'), /'nonce-abc123=='/);
  assert.equal(directive(csp, 'object-src'), "object-src 'none'");
  assert.equal(directive(csp, 'frame-ancestors'), "frame-ancestors 'none'");
});

test('development adds only unsafe-eval (React dev tooling), never unsafe-inline', () => {
  const csp = htmlCsp('n', true);
  assert.match(directive(csp, 'script-src'), /'unsafe-eval'/);
  assert.doesNotMatch(csp, /unsafe-inline/);
});

test('non-HTML responses get a locked policy', () => {
  assert.match(LOCKED_CSP, /default-src 'none'/);
  assert.match(LOCKED_CSP, /frame-ancestors 'none'/);
});

test('nonces are fresh and carry 128 bits', () => {
  const a = newNonce();
  const b = newNonce();
  assert.notEqual(a, b);
  assert.equal(Buffer.from(a, 'base64').length, 16);
});

test('baseline headers include the standard hardening set', () => {
  for (const h of ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy', 'Strict-Transport-Security']) {
    assert.ok(BASELINE_HEADERS[h], h);
  }
});

test('noindex flag: only the landing, and only with CV_INDEXABLE=true, drops noindex', () => {
  const off = cfg();
  const on = cfg({ CV_INDEXABLE: 'true' });
  assert.equal(robotsTag('landing', off), 'noindex, nofollow');
  assert.equal(robotsTag('landing', on), 'index, follow');
  for (const role of ['app', 'api', null] as const) {
    assert.equal(robotsTag(role, off), 'noindex, nofollow');
    assert.equal(robotsTag(role, on), 'noindex, nofollow');
  }
});
