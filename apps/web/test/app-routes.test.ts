import assert from 'node:assert/strict';
import { test } from 'node:test';
import { APP_NAV, APP_ROUTE_SEGMENTS, appPath, matchAppPath, navSection, type AppRouteName } from '../src/lib/app-routes.ts';
import { safeRedirectPath } from '../src/lib/public-origin.ts';
import { decide } from '../src/lib/routing.ts';
import { cfg } from './helpers.ts';

const ID = '0b6f3c1e-8a4d-4f7e-9c2a-1d5e6f7a8b9c';
const c = cfg();

test('every declared route builds and matches back, in both locales', () => {
  const names = Object.keys(APP_ROUTE_SEGMENTS) as AppRouteName[];
  assert.equal(names.length, 12); // W5-J added jobNew and jobCapture
  for (const name of names) {
    for (const locale of ['es', 'en'] as const) {
      const needsId = APP_ROUTE_SEGMENTS[name].includes(':id');
      const path = (appPath[name] as (l: 'es' | 'en', id: string) => string)(locale, ID);
      const m = matchAppPath(path);
      assert.ok(m, path);
      assert.equal(m.name, name);
      assert.equal(m.locale, locale);
      assert.equal(m.id, needsId ? ID : null);
      assert.ok(m.internal.startsWith(`/h/app/${locale}`));
    }
  }
});

test('the Spanish paths are the public contract', () => {
  assert.equal(appPath.home('es'), '/');
  assert.equal(appPath.home('en'), '/en');
  assert.equal(appPath.profile('es'), '/perfil');
  assert.equal(appPath.jobTailor('en', ID), `/en/empleos/${ID}/adaptar`);
  assert.equal(appPath.artifactPrint('es', ID), `/documentos/${ID}/imprimir`);
  assert.equal(appPath.settings('es'), '/ajustes');
  assert.throws(() => appPath.job('es', 'not-a-uuid'));
  assert.deepEqual(APP_NAV, ['home', 'profile', 'jobs', 'artifacts', 'settings']);
  assert.equal(navSection('jobTailor'), 'jobs');
  assert.equal(navSection('artifactPreview'), 'artifacts');
  // W5-J: fixed words under /empleos, never read as a job id.
  assert.equal(appPath.jobNew('es'), '/empleos/nuevo');
  assert.equal(appPath.jobCapture('en'), '/en/empleos/capturar');
  assert.equal(matchAppPath('/empleos/nuevo')?.name, 'jobNew');
  assert.equal(navSection('jobCapture'), 'jobs');
});

test('the app host rewrites every route to its internal page; ids must be UUIDs', () => {
  assert.deepEqual(decide('cv-app.madfam.io', '/perfil', c), { kind: 'rewrite', role: 'app', to: '/h/app/es/perfil', html: true, locale: 'es' });
  assert.deepEqual(decide('cv-app.madfam.io', `/en/empleos/${ID}/adaptar`, c), { kind: 'rewrite', role: 'app', to: `/h/app/en/empleos/${ID}/adaptar`, html: true, locale: 'en' });
  assert.deepEqual(decide('cv-app.madfam.io', `/documentos/${ID}/vista-previa/`, c), { kind: 'rewrite', role: 'app', to: `/h/app/es/documentos/${ID}/vista-previa`, html: true, locale: 'es' });
  for (const path of ['/empleos/123', `/empleos/${ID.toUpperCase()}`, '/perfil/x', '/es/perfil', '/en/en', '/Perfil', `/documentos/${ID}/otro`, '/h/app/es/perfil']) {
    assert.deepEqual(decide('cv-app.madfam.io', path, c), { kind: 'not-found', role: 'app', format: 'html' }, path);
  }
  for (const host of ['cv.madfam.io', 'cv-api.madfam.io']) assert.equal(decide(host, '/perfil', c).kind, 'not-found', host);
});

test('after sign-in, only an exact app page survives as the return path', () => {
  assert.equal(safeRedirectPath('/perfil'), '/perfil');
  assert.equal(safeRedirectPath(`/en/documentos/${ID}`), `/en/documentos/${ID}`);
  for (const bad of ['//evil.example/perfil', '/perfil?next=//x', '/perfil/', '/nope', 'https://evil.example', '/\\evil', `/empleos/${ID}x`, 42, null]) {
    assert.equal(safeRedirectPath(bad), '/', String(bad));
  }
});
