import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { APP_ROUTE_SEGMENTS } from '../src/lib/app-routes.ts';
import { NO_ROLE, UNMATCHED, apiTemplate, appTemplate, routeLabels } from '../src/server/metrics-route.ts';
import { cfg } from './helpers.ts';

const c = cfg({ CV_HOST_PAGES: 'cv-p.madfam.io' });
const id = randomUUID();
const token = randomBytes(32).toString('base64url');

test('probes are counted on any Host; an unknown Host is host_role none', () => {
  assert.deepEqual(routeLabels('10.0.0.1:3000', '/ready', c), { hostRole: NO_ROLE, route: '/ready', quiet: true });
  assert.deepEqual(routeLabels('cv-api.madfam.io', '/health/', c), { hostRole: 'api', route: '/health', quiet: true });
  assert.deepEqual(routeLabels('evil.example', '/wp-login.php?x=1', c), { hostRole: NO_ROLE, route: UNMATCHED, quiet: false });
  assert.deepEqual(routeLabels(undefined, '/', c), { hostRole: NO_ROLE, route: UNMATCHED, quiet: false });
});

test('landing, app, api and pages routes become templates, never raw ids, slugs or tokens', () => {
  const cases: [string, string, string, string][] = [
    ['cv.madfam.io', '/', 'landing', '/'],
    ['cv.madfam.io', '/en/', 'landing', '/en'],
    ['cv.madfam.io', '/robots.txt', 'landing', '/robots.txt'],
    ['cv.madfam.io', '/_next/static/chunks/main.js', 'landing', '/_next/*'],
    ['cv.madfam.io', '/nope', 'landing', UNMATCHED],
    ['cv-app.madfam.io', '/', 'app', '/'],
    ['cv-app.madfam.io', '/en', 'app', '/en'],
    ['cv-app.madfam.io', `/empleos/${id}/adaptar`, 'app', '/empleos/:id/adaptar'],
    ['cv-app.madfam.io', `/en/documentos/${id}/vista-previa`, 'app', '/en/documentos/:id/vista-previa'],
    ['cv-app.madfam.io', '/auth/entrar', 'app', '/auth/entrar'],
    ['cv-app.madfam.io', '/api/auth/callback/janua?code=secret&state=x', 'app', '/api/auth/*'],
    ['cv-app.madfam.io', `/api/v1/jobs/${id}/match`, 'app', '/api/v1/jobs/:id/match'],
    ['cv-app.madfam.io', '/empleos/not-a-uuid', 'app', UNMATCHED],
    ['cv-api.madfam.io', '/api/v1/meta', 'api', '/api/v1/meta'],
    ['cv-api.madfam.io', `/api/v1/profile/items/${id}`, 'api', '/api/v1/profile/items/:id'],
    ['cv-api.madfam.io', '/api/v1/profile/items/reorder', 'api', '/api/v1/profile/items/reorder'],
    ['cv-api.madfam.io', `/api/v1/artifacts/${id}/publish`, 'api', '/api/v1/artifacts/:id/publish'],
    ['cv-api.madfam.io', '/api/v1/public/a/ana-garcia', 'api', '/api/v1/public/a/:slug'],
    ['cv-api.madfam.io', `/api/v1/public/s/${token}`, 'api', '/api/v1/public/s/:token'],
    ['cv-api.madfam.io', '/api/v1/unknown/thing', 'api', UNMATCHED],
    ['cv-p.madfam.io', '/ana-garcia', 'pages', '/:slug'],
    ['cv-p.madfam.io', `/l/${token}`, 'pages', '/l/:token'],
    ['cv-p.madfam.io', '/metrics', 'pages', UNMATCHED],
    ['cv-p.madfam.io', '/', 'pages', UNMATCHED],
  ];
  for (const [host, path, role, route] of cases) {
    const got = routeLabels(host, path, c);
    assert.equal(got.hostRole, role, `${host}${path}`);
    assert.equal(got.route, route, `${host}${path}`);
    assert.ok(!got.route.includes(id) && !got.route.includes(token) && !got.route.includes('ana-garcia') && !got.route.includes('?'), got.route);
  }
});

test('/metrics on the app port is the router 404 on every public host', () => {
  for (const host of ['cv.madfam.io', 'cv-app.madfam.io', 'cv-api.madfam.io', 'cv-p.madfam.io', '10.0.0.1']) {
    assert.equal(routeLabels(host, '/metrics', c).route, UNMATCHED, host);
  }
});

test('every app route and the API shapes map to a finite template set', () => {
  for (const [name, segments] of Object.entries(APP_ROUTE_SEGMENTS)) {
    const concrete = `/${segments.map((s) => (s === ':id' ? id : s)).join('/')}`.replace(/\/$/, '') || '/';
    const expected = `/${segments.join('/')}`.replace(/\/$/, '') || '/';
    assert.equal(appTemplate(concrete), expected, name);
    assert.equal(appTemplate(concrete === '/' ? '/en' : `/en${concrete}`), expected === '/' ? '/en' : `/en${expected}`, name);
  }
  assert.equal(apiTemplate('/api/v1/artifacts/batch'), '/api/v1/artifacts/batch');
  assert.equal(apiTemplate(`/api/v1/artifacts/${id}/delete`), null);
  assert.equal(apiTemplate('/elsewhere'), null);
});

test('random paths never produce a label outside the template alphabet', () => {
  const allowed = /^(unmatched|\/[a-z0-9.:*/_-]*)$/;
  const hosts = ['cv.madfam.io', 'cv-app.madfam.io', 'cv-api.madfam.io', 'cv-p.madfam.io', 'x.example'];
  for (let i = 0; i < 400; i += 1) {
    const segs = Array.from({ length: 1 + (i % 4) }, () => randomBytes(1 + (i % 9)).toString('base64url'));
    const path = `/${segs.join('/')}`;
    for (const host of hosts) {
      const { route } = routeLabels(host, path, c);
      assert.match(route, allowed, `${host}${path} -> ${route}`);
      for (const s of segs) if (s.length > 6) assert.ok(!route.includes(s), `${host}${path} leaked ${s}`);
    }
  }
});

test('without a configuration every request is host_role none and unmatched (probes keep their path)', () => {
  assert.deepEqual(routeLabels('cv.madfam.io', '/', null), { hostRole: NO_ROLE, route: UNMATCHED, quiet: false });
  assert.deepEqual(routeLabels('cv.madfam.io', '/ready', null), { hostRole: NO_ROLE, route: '/ready', quiet: true });
});
