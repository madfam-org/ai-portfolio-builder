import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide, hostname } from '../src/lib/routing.ts';
import { cfg } from './helpers.ts';

const c = cfg();

test('hostname() strips the port and IPv6 brackets and lowercases', () => {
  assert.equal(hostname('CV.MADFAM.IO:443'), 'cv.madfam.io');
  assert.equal(hostname('10.0.0.1:3000'), '10.0.0.1');
  assert.equal(hostname('[fd00::1]:3000'), 'fd00::1');
  assert.equal(hostname(''), null);
  assert.equal(hostname(null), null);
});

test('/health and /ready answer on ANY Host, before host routing', () => {
  for (const host of ['cv.madfam.io', 'cv-app.madfam.io', 'cv-api.madfam.io', '10.0.0.1:3000', '[fd00::1]:3000', 'evil.example', null]) {
    for (const path of ['/health', '/ready', '/health/']) {
      assert.equal(decide(host, path, c).kind, 'probe', `${host} ${path}`);
    }
  }
});

test('an unknown or missing Host is a plain-text 404 on every other path', () => {
  for (const host of ['10.0.0.1', 'madfam.io', 'cv.madfam.io.evil.example', 'www.cv.madfam.io', 'api.cv.madfam.io', null]) {
    for (const path of ['/', '/en', '/robots.txt', '/_next/static/chunks/a.js', '/api/v1/meta', '/icon.svg']) {
      assert.deepEqual(decide(host, path, c), { kind: 'not-found', role: null, format: 'text' }, `${host} ${path}`);
    }
  }
});

test('landing host: es at /, en at /en, robots, assets; everything else is the HTML 404', () => {
  assert.deepEqual(decide('cv.madfam.io', '/', c), { kind: 'rewrite', role: 'landing', to: '/h/landing/es', html: true, locale: 'es' });
  assert.deepEqual(decide('cv.madfam.io', '/en', c), { kind: 'rewrite', role: 'landing', to: '/h/landing/en', html: true, locale: 'en' });
  assert.deepEqual(decide('cv.madfam.io', '/en/', c), { kind: 'rewrite', role: 'landing', to: '/h/landing/en', html: true, locale: 'en' });
  assert.equal(decide('cv.madfam.io', '/robots.txt', c).kind, 'rewrite');
  assert.equal(decide('cv.madfam.io', '/_next/static/css/x.css', c).kind, 'asset');
  assert.equal(decide('cv.madfam.io', '/icon.svg', c).kind, 'asset');
  for (const path of ['/es', '/app', '/api/v1/meta', '/h/landing/es', '/h/api/v1/meta', '/sitemap.xml', '/admin']) {
    assert.deepEqual(decide('cv.madfam.io', path, c), { kind: 'not-found', role: 'landing', format: 'html' }, path);
  }
});

test('the sitemap exists only while the landing is indexable', () => {
  assert.equal(decide('cv.madfam.io', '/sitemap.xml', c).kind, 'not-found');
  assert.deepEqual(decide('cv.madfam.io', '/sitemap.xml', cfg({ CV_INDEXABLE: 'true' })), {
    kind: 'rewrite',
    role: 'landing',
    to: '/h/sitemap',
    html: false,
    locale: null,
  });
  assert.equal(decide('cv-app.madfam.io', '/sitemap.xml', cfg({ CV_INDEXABLE: 'true' })).kind, 'not-found');
});

test('app host: the pre-launch shell, robots and assets; /api/auth is not claimed yet', () => {
  assert.deepEqual(decide('cv-app.madfam.io', '/', c), { kind: 'rewrite', role: 'app', to: '/h/app/es', html: true, locale: 'es' });
  assert.equal(decide('cv-app.madfam.io', '/robots.txt', c).kind, 'rewrite');
  assert.equal(decide('cv-app.madfam.io', '/_next/static/chunks/a.js', c).kind, 'asset');
  assert.deepEqual(decide('cv-app.madfam.io', '/api/auth/callback/janua', c), { kind: 'not-found', role: 'app', format: 'html' });
});

test('api host: meta and robots; JSON 404 elsewhere, including / and build assets', () => {
  assert.deepEqual(decide('cv-api.madfam.io', '/api/v1/meta', c), {
    kind: 'rewrite',
    role: 'api',
    to: '/h/api/v1/meta',
    html: false,
    locale: null,
  });
  assert.deepEqual(decide('cv-api.madfam.io', '/robots.txt', c), { kind: 'rewrite', role: 'api', to: '/h/robots/api', html: false, locale: null });
  for (const path of ['/', '/en', '/api/v1', '/api/v1/other', '/_next/static/chunks/a.js', '/icon.svg', '/h/api/v1/meta']) {
    assert.deepEqual(decide('cv-api.madfam.io', path, c), { kind: 'not-found', role: 'api', format: 'json' }, path);
  }
});

test('the Host match is exact (case-insensitive, port ignored), driven by the table', () => {
  assert.equal(decide('CV.madfam.io:443', '/', c).kind, 'rewrite');
  const local = cfg({ CV_HOST_LANDING: 'cv.localhost' });
  assert.equal(decide('cv.localhost:3000', '/', local).kind, 'rewrite');
  assert.equal(decide('cv.madfam.io', '/', local).kind, 'not-found');
});
