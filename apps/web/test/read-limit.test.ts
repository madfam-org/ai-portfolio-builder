/**
 * W6-A: the per-client token bucket on unauthenticated reads (src/server/read-limit.ts): which requests count, how the
 * client is keyed (CF-Connecting-IP only, never X-Forwarded-For), the bucket arithmetic, the memory bound, and the
 * configuration that sets it.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { ConfigError, DEFAULT_READ_LIMIT, loadConfig } from '../src/lib/config.ts';
import { decide } from '../src/lib/routing.ts';
import { TokenBuckets, UNATTRIBUTED, clientKey, readSurface, tooManyText } from '../src/server/read-limit.ts';
import { cfg } from './helpers.ts';

const on = cfg({ CV_HOST_PAGES: 'cv-p.madfam.io' });
const TOKEN = randomBytes(32).toString('base64url');
const h = (init: Record<string, string>) => new Headers(init);

test('only the unauthenticated reads count: user pages, the pages 404, cv-api public reads', () => {
  const surface = (host: string, path: string, c = on) => readSurface(decide(host, path, c));
  assert.equal(surface('cv-p.madfam.io', '/ana-cv'), 'pages');
  assert.equal(surface('cv-p.madfam.io', `/l/${TOKEN}`), 'pages');
  assert.equal(surface('cv-p.madfam.io', '/Not_A_Slug'), 'pages', 'the HTML 404 renders too');
  assert.equal(surface('cv-api.madfam.io', '/api/v1/public/a/ana-cv'), 'public-api');
  assert.equal(surface('cv-api.madfam.io', `/api/v1/public/s/${TOKEN}`), 'public-api');
  for (const [host, path] of [
    ['cv-p.madfam.io', '/robots.txt'],
    ['cv-p.madfam.io', '/_next/static/chunks/a.js'],
    ['cv-p.madfam.io', '/health'],
    ['cv-api.madfam.io', '/api/v1/jobs'],
    ['cv-api.madfam.io', '/api/v1/meta'],
    ['cv-api.madfam.io', '/api/v1/public/a/UPPER'],
    ['cv-app.madfam.io', '/api/v1/profile'],
    ['cv.madfam.io', '/'],
    ['cv.madfam.io', '/lector'],
    ['unknown.example', '/ana-cv'],
  ] as const) {
    assert.equal(surface(host, path), null, `${host}${path}`);
  }
  assert.equal(surface('cv-p.madfam.io', '/ana-cv', cfg()), null, 'inert pages host: an unknown host, not counted');
});

test('the client is CF-Connecting-IP only; X-Forwarded-For, X-Real-IP and True-Client-IP are never read', () => {
  assert.equal(clientKey(h({ 'cf-connecting-ip': '203.0.113.7' })), '203.0.113.7');
  assert.equal(clientKey(h({ 'cf-connecting-ip': ' 203.0.113.7 ' })), '203.0.113.7');
  assert.equal(clientKey(h({ 'x-forwarded-for': '198.51.100.1', 'x-real-ip': '198.51.100.2', 'true-client-ip': '198.51.100.3' })), UNATTRIBUTED);
  assert.equal(clientKey(h({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.1' })), '203.0.113.7');
  for (const bad of ['', 'unknown', '203.0.113.7, 198.51.100.1', '999.1.1.1', '203.0.113', 'localhost', '::g']) {
    assert.equal(clientKey(h({ 'cf-connecting-ip': bad })), UNATTRIBUTED, JSON.stringify(bad));
  }
});

test('IPv6 clients are counted per /64; an IPv4-mapped address is its IPv4', () => {
  const a = clientKey(h({ 'cf-connecting-ip': '2001:db8:1:2:aaaa::1' }));
  const b = clientKey(h({ 'cf-connecting-ip': '2001:0DB8:0001:0002:ffff:ffff:ffff:ffff' }));
  const other = clientKey(h({ 'cf-connecting-ip': '2001:db8:1:3::1' }));
  assert.equal(a, '2001:db8:1:2::/64');
  assert.equal(a, b, 'one /64, one bucket');
  assert.notEqual(a, other);
  assert.equal(clientKey(h({ 'cf-connecting-ip': '::1' })), '0:0:0:0::/64');
  assert.equal(clientKey(h({ 'cf-connecting-ip': 'fe80::1%eth0' })), 'fe80:0:0:0::/64');
  assert.equal(clientKey(h({ 'cf-connecting-ip': '::ffff:203.0.113.9' })), '203.0.113.9');
  assert.equal(clientKey(h({ 'cf-connecting-ip': '::ffff:cb00:7109' })), '203.0.113.9');
  assert.equal(clientKey(h({ 'cf-connecting-ip': '64:ff9b::203.0.113.9' })), '64:ff9b:0:0::/64');
});

test('token bucket: a burst, then 429 with the seconds until one token is back; refusals cost nothing', () => {
  let now = 1_000_000;
  const b = new TokenBuckets({ burst: 3, perMinute: 6 }, () => now);
  assert.deepEqual([b.take('x'), b.take('x'), b.take('x')], [0, 0, 0]);
  assert.equal(b.take('x'), 10, 'six a minute: one token every 10 s');
  now += 4_000;
  assert.equal(b.take('x'), 6, 'a refused request spends nothing; the refill keeps running');
  now += 6_000;
  assert.equal(b.take('x'), 0);
  assert.equal(b.take('x'), 10);
  assert.equal(b.take('y'), 0, 'another client has its own bucket');
  now += 10 * 60_000;
  assert.deepEqual([b.take('x'), b.take('x'), b.take('x'), b.take('x')], [0, 0, 0, 10], 'refills to the burst, never above');
});

test('Retry-After is a whole number of seconds, at least 1', () => {
  let now = 0;
  const b = new TokenBuckets({ burst: 1, perMinute: 100_000 }, () => now);
  assert.equal(b.take('x'), 0);
  assert.equal(b.take('x'), 1);
  now += 1;
  assert.equal(b.take('x'), 0);
});

test('memory is bounded: past MAX keys the least recently seen client is dropped (it starts again full)', () => {
  const b = new TokenBuckets({ burst: 1, perMinute: 1 }, () => 0, 3);
  for (const k of ['a', 'b', 'c']) assert.equal(b.take(k), 0);
  assert.equal(b.take('a'), 60, 'a is now the most recently seen');
  assert.equal(b.take('d'), 0);
  assert.equal(b.size, 3);
  assert.equal(b.take('b'), 0, 'b was the least recently seen: dropped, so full again');
  assert.equal(b.take('a'), 60, 'a was kept');
});

test('configuration: defaults 60 at once and 60 a minute; env overrides; anything else fails at boot', () => {
  assert.deepEqual(loadConfig({}).readLimit, DEFAULT_READ_LIMIT);
  assert.deepEqual(DEFAULT_READ_LIMIT, { burst: 60, perMinute: 60 });
  assert.deepEqual(loadConfig({ CV_READ_LIMIT_BURST: '120', CV_READ_LIMIT_PER_MINUTE: '30' }).readLimit, { burst: 120, perMinute: 30 });
  for (const bad of ['0', '-1', '1.5', 'ten', '100001', ' 5', '1e3']) {
    assert.throws(() => loadConfig({ CV_READ_LIMIT_BURST: bad }), ConfigError, bad);
    assert.throws(() => loadConfig({ CV_READ_LIMIT_PER_MINUTE: bad }), ConfigError, bad);
  }
});

test('the 429 text is es-MX first, then English, and names the wait', () => {
  const body = tooManyText(7);
  assert.match(body, /^Demasiadas solicitudes .* 7 s\.\nToo many requests .* 7 s\.\n$/);
});
