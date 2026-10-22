import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PAGES_NOINDEX, pagesCsp, robotsTag, userPageHeaders } from '../src/lib/headers.ts';
import { robotsTxt } from '../src/lib/robots.ts';
import { decide } from '../src/lib/routing.ts';
import { gateUserPage } from '../src/server/pages-gate.ts';
import { reportHref } from '../src/lib/copy/pages.ts';
import { cfg } from './helpers.ts';

const off = cfg();
const on = cfg({ CV_HOST_PAGES: 'cv-p.madfam.io' });
const TOKEN = 'A'.repeat(20) + '_-' + 'b'.repeat(21); // 43 base64url characters

test('the pages host is inert until CV_HOST_PAGES names it: a plain unknown-host 404', () => {
  for (const path of ['/', '/ana-cv', `/l/${TOKEN}`, '/robots.txt']) {
    assert.deepEqual(decide('cv-p.madfam.io', path, off), { kind: 'not-found', role: null, format: 'text' }, path);
  }
});

test('pages host: /<slug> and /l/<token> are user pages; probes still answer first', () => {
  assert.deepEqual(decide('cv-p.madfam.io', '/ana-cv', on), { kind: 'user-page', role: 'pages', to: '/h/pages/s/ana-cv', share: 'public', key: 'ana-cv' });
  assert.deepEqual(decide('cv-p.madfam.io', `/l/${TOKEN}`, on), { kind: 'user-page', role: 'pages', to: `/h/pages/l/${TOKEN}`, share: 'link', key: TOKEN });
  assert.equal(decide('cv-p.madfam.io', '/ana-cv/', on).kind, 'user-page', 'one trailing slash tolerated');
  for (const path of ['/health', '/ready']) assert.equal(decide('cv-p.madfam.io', path, on).kind, 'probe');
  assert.deepEqual(decide('cv-p.madfam.io', '/robots.txt', on), { kind: 'rewrite', role: 'pages', to: '/h/robots/pages', html: false, locale: null });
  assert.equal(decide('cv-p.madfam.io', '/_next/static/chunks/a.js', on).kind, 'asset');
});

test('pages host: everything else is the HTML 404 (root, reserved and malformed slugs, internal paths, app paths)', () => {
  for (const path of ['/', '/en', '/l', '/l/short', `/l/${TOKEN}x`, `/x/${TOKEN}`, '/Ana-CV', '/ab', '/-ana', '/admin', '/api', '/entrar', '/h/pages/s/ana-cv', '/perfil/x', '/api/v1/meta', '/api/auth/session', '/auth/entrar']) {
    assert.deepEqual(decide('cv-p.madfam.io', path, on), { kind: 'not-found', role: 'pages', format: 'html' }, path);
  }
});

test('user pages are reachable on the pages host only', () => {
  for (const host of ['cv.madfam.io', 'cv-app.madfam.io']) assert.equal(decide(host, '/ana-cv', on).kind, 'not-found', host);
  assert.deepEqual(decide('cv-api.madfam.io', `/l/${TOKEN}`, on), { kind: 'not-found', role: 'api', format: 'json' });
});

test('pages CSP: strict, nonce only, no unsafe-*, no form target, no base', () => {
  const csp = pagesCsp('n0nce', false);
  assert.doesNotMatch(csp, /unsafe-/);
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'self' 'nonce-n0nce' 'strict-dynamic'/);
  assert.match(csp, /style-src 'self' 'nonce-n0nce'/);
  for (const d of ["form-action 'none'", "base-uri 'none'", "frame-ancestors 'none'", "object-src 'none'", "img-src 'self' data:", "connect-src 'self'"]) assert.ok(csp.includes(d), d);
});

test('user page headers: link pages never indexed, cached or referred; public pages indexed only by choice', () => {
  assert.deepEqual(userPageHeaders('link', true), { 'X-Robots-Tag': PAGES_NOINDEX, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' });
  assert.deepEqual(userPageHeaders('public', false), { 'X-Robots-Tag': 'noindex, nofollow, noai, noimageai', 'Cache-Control': 'no-store' });
  assert.deepEqual(userPageHeaders('public', true), { 'X-Robots-Tag': 'index, follow', 'Cache-Control': 'no-store' });
  assert.equal(robotsTag('pages', cfg({ CV_HOST_PAGES: 'cv-p.madfam.io', CV_INDEXABLE: 'true' })), PAGES_NOINDEX, 'the landing flag never indexes user pages');
});

test('pages robots.txt allows crawling (so per-page noindex is seen), names the R40 crawlers, no sitemap', () => {
  const txt = robotsTxt('pages', on);
  assert.match(txt, /User-agent: ClaudeBot/);
  assert.match(txt, /User-agent: \*\nAllow: \//);
  assert.doesNotMatch(txt, /Disallow|Sitemap/);
});

test('the gate: dormant → missing; found → its indexing and locale; a failing lookup → unavailable (fail closed)', async () => {
  assert.deepEqual(await gateUserPage('public', 'ana-cv', null), { status: 'missing' });
  assert.deepEqual(await gateUserPage('public', 'ana-cv', async () => null), { status: 'missing' });
  assert.deepEqual(await gateUserPage('public', 'ana-cv', async () => ({ indexable: true, locale: 'en' })), { status: 'found', indexable: true, locale: 'en' });
  assert.deepEqual(await gateUserPage('link', TOKEN, async () => ({ indexable: true, locale: 'es-MX' })), { status: 'found', indexable: false, locale: 'es' }, 'a link page is never indexable');
  const errors = console.error;
  console.error = () => undefined;
  try {
    assert.deepEqual(
      await gateUserPage('public', 'ana-cv', async () => {
        throw Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
      }),
      { status: 'unavailable' },
    );
  } finally {
    console.error = errors;
  }
});

test('the abuse report goes to legal@madfam.io; a link page never puts its token in the subject', () => {
  const pub = reportHref('es', { share: 'public', slug: 'ana-cv', host: 'cv-p.madfam.io' });
  assert.match(pub, /^mailto:legal@madfam\.io\?subject=/);
  assert.match(decodeURIComponent(pub), /https:\/\/cv-p\.madfam\.io\/ana-cv/);
  const link = reportHref('en', { share: 'link' });
  assert.match(link, /^mailto:legal@madfam\.io\?subject=/);
  assert.doesNotMatch(decodeURIComponent(link), /\/l\//);
});
