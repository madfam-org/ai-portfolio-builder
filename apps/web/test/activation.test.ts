/**
 * W6-A activation: the 7-day idle session, the job-link reader page (routing, sitemap, metrics template, copy parity,
 * the User-Agent that points at it) and the production manifests that turn the pages host on.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { SESSION_MAX_AGE_SECONDS, SESSION_OPTIONS } from '../src/lib/auth-env.ts';
import { READER_COPY, readerPath } from '../src/lib/copy/reader.ts';
import { robotsTxt, sitemapXml } from '../src/lib/robots.ts';
import { LANDING_PAGES, decide } from '../src/lib/routing.ts';
import { INTAKE_USER_AGENT, ROBOTS_TOKEN } from '../src/server/ingest/fetcher.ts';
import { routeLabels } from '../src/server/metrics-route.ts';
import { cfg } from './helpers.ts';

const root = join(import.meta.dirname, '..', '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

test('sessions expire after 7 days without use (Auth.js default: 30); JWT strategy; no updateAge', () => {
  assert.equal(SESSION_MAX_AGE_SECONDS, 604_800);
  assert.deepEqual(SESSION_OPTIONS, { strategy: 'jwt', maxAge: 604_800 });
  assert.equal('updateAge' in SESSION_OPTIONS, false, 'Auth.js ignores updateAge for JWT sessions; setting it would mislead');
  const auth = read('apps/web/src/auth.ts');
  assert.match(auth, /session: \{ \.\.\.SESSION_OPTIONS \}/, 'auth.ts hands Auth.js these options');
  assert.doesNotMatch(auth, /jwt: \{[^}]*maxAge/, 'no separate jwt.maxAge: it follows session.maxAge');
});

test('the reader page: /lector (es-MX) and /en/lector on the landing host only', () => {
  const c = cfg();
  assert.deepEqual(decide('cv.madfam.io', '/lector', c), { kind: 'rewrite', role: 'landing', to: '/h/landing/es/lector', html: true, locale: 'es' });
  assert.deepEqual(decide('cv.madfam.io', '/en/lector/', c), { kind: 'rewrite', role: 'landing', to: '/h/landing/en/lector', html: true, locale: 'en' });
  assert.equal(decide('cv-app.madfam.io', '/lector', c).kind, 'not-found');
  assert.equal(decide('cv-api.madfam.io', '/lector', c).kind, 'not-found');
  assert.equal(decide('cv.madfam.io', '/h/landing/es/lector', c).kind, 'not-found', 'internal routes stay internal');
  assert.equal(readerPath('es'), '/lector');
  assert.equal(readerPath('en'), '/en/lector');
  for (const path of Object.keys(LANDING_PAGES)) {
    assert.equal(routeLabels('cv.madfam.io', path, c).route, path, `metrics template ${path}`);
  }
});

test('the User-Agent points at the reader page, and the page names the same token', () => {
  assert.match(INTAKE_USER_AGENT, /^MADFAM-CV-Intake\/1\.0 \(\+https:\/\/cv\.madfam\.io\/lector; .*support@madfam\.io\)$/);
  const url = /\+(https:\/\/[^;]+);/.exec(INTAKE_USER_AGENT)![1]!;
  assert.ok(new URL(url).pathname in LANDING_PAGES, 'the +URL is a routed landing page');
  assert.equal(ROBOTS_TOKEN, 'madfam-cv');
  for (const t of Object.values(READER_COPY)) {
    assert.equal(t.optOut.example, `User-agent: ${ROBOTS_TOKEN}\nDisallow: /`);
    assert.match(t.optOut.contact, /support@madfam\.io/);
  }
});

test('reader copy: es and en have the same shape; no invented claims about other mailboxes or domains', () => {
  const es = READER_COPY.es;
  const en = READER_COPY.en;
  assert.deepEqual(
    es.sections.map((s) => [s.body.length, s.list?.length ?? 0]),
    en.sections.map((s) => [s.body.length, s.list?.length ?? 0]),
  );
  const all = JSON.stringify(READER_COPY);
  assert.doesNotMatch(all, /madfam\.com/i);
  for (const m of all.match(/[a-z]+@[a-z]+(?:\.[a-z]+)+/g) ?? []) assert.equal(m, 'support@madfam.io');
  // The limits the page states are the code's limits (server/ingest/fetcher.ts FETCH_LIMITS, rate-limit.ts).
  assert.match(es.sections.find((s) => s.id === 'limites')!.list!.join(' '), /3 redirecciones.*2 MB.*8 segundos.*20 enlaces cada 10 minutos y 100 al día/);
});

test('the sitemap lists the reader page with its alternates (only while the landing is indexable)', () => {
  const xml = sitemapXml(cfg({ CV_INDEXABLE: 'true' }));
  for (const loc of ['/', '/en', '/lector', '/en/lector']) assert.ok(xml.includes(`<loc>https://cv.madfam.io${loc}</loc>`), loc);
  assert.match(xml, /hreflang="en" href="https:\/\/cv\.madfam\.io\/en\/lector"/);
  assert.equal(decide('cv.madfam.io', '/sitemap.xml', cfg()).kind, 'not-found', 'no sitemap while noindex');
  assert.doesNotMatch(robotsTxt('landing', cfg()), /Disallow/, 'the landing stays crawlable (noindex rides the header)');
});

test('production turns the pages host on: CV_HOST_PAGES and the enclii domain, port 80', () => {
  const deployment = read('infra/k8s/production/deployment.yaml');
  assert.match(deployment, /- name: CV_HOST_PAGES\n\s+value: cv-p\.madfam\.io\n/);
  const enclii = read('enclii.yaml');
  assert.match(enclii, /- name: cv-p\.madfam\.io\n\s+environment: production\n\s+port: 80\n/);
  // The names agree with the host table's fallback (lib/config.ts).
  assert.equal(cfg({ CV_HOST_PAGES: 'cv-p.madfam.io' }).byHost.get('cv-p.madfam.io'), 'pages');
});
