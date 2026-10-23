/**
 * W7 (B3): the career systems the luxury houses use, on SYNTHETIC pages (test/fixtures/ingest/luxury) modeled on their
 * markup: SuccessFactors microdata with a Java-style `datePosted`, Workday JSON-LD with escaped names, an Oracle
 * Recruiting Cloud shell (Open Graph only), closed postings (Workday `postingAvailable: false`, a filled SuccessFactors
 * page) that must never become a draft, robots.txt checked with and without a locale segment, and LVMH capture-only.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { captureOnlyBoard } from '../src/server/ingest/boards.ts';
import { closedPosting } from '../src/server/ingest/closed.ts';
import { draftFromHtml } from '../src/server/ingest/extract.ts';
import type { Resolver, Transport, TransportRequest } from '../src/server/ingest/fetcher.ts';
import { isoDate } from '../src/server/ingest/fields.ts';
import { pageParts } from '../src/server/ingest/html.ts';
import { runIntake, type IntakeDeps } from '../src/server/ingest/intake.ts';
import { RateLimiter } from '../src/server/ingest/rate-limit.ts';
import { clearRobotsCache, parseRobots, robotsAllows, robotsPaths } from '../src/server/ingest/robots.ts';
import type { DraftFields } from '../src/server/ingest/types.ts';

const FIX = join(import.meta.dirname, 'fixtures', 'ingest', 'luxury');
const read = (name: string) => readFileSync(join(FIX, name), 'utf8');
const values = (f: DraftFields) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v!.value]));

test('dates: ISO as before, plus the Java Date.toString() form SuccessFactors writes; impossible dates stay null', () => {
  assert.equal(isoDate('2026-10-14T08:00:00Z'), '2026-10-14');
  assert.equal(isoDate('Wed Oct 14 00:00:00 UTC 2026'), '2026-10-14');
  assert.equal(isoDate('Mon Mar 2 09:30:00 CET 2026'), '2026-03-02');
  assert.equal(isoDate('Fri Feb 30 00:00:00 UTC 2026'), null);
  assert.equal(isoDate('Wed Foo 14 00:00:00 UTC 2026'), null);
  assert.equal(isoDate('14/10/2026'), null);
});

test('SuccessFactors job page: microdata (http://schema.org) with every stated field, the date read', () => {
  const d = draftFromHtml(read('successfactors-microdata.html'), new URL('https://empleos.maison-ejemplo.example/job/Ciudad-de-Mexico-Client-Advisor-Boutique-Polanco/1100000001/'), 'url')!;
  assert.deepEqual(values(d.fields), {
    title: 'Client Advisor - Boutique Polanco',
    company: 'Maison Ejemplo',
    location: 'Ciudad de México, CDMX, MX',
    countryCode: 'MX',
    stateCode: 'MX-CMX',
    datePosted: '2026-10-14',
  });
  assert.ok(Object.values(d.fields).every((f) => f!.from === 'microdata'));
  assert.equal(d.sourceTextFrom, 'microdata');
  assert.match(d.sourceText, /• Cumplir y superar las metas individuales de venta/);
  assert.ok(!d.sourceText.includes('Únete a nuestra comunidad'), 'the posting text, not the navigation');
  assert.deepEqual(d.notes, []);
});

test('Workday job page: JSON-LD with an entity-escaped title; an empty hiringOrganization leaves the company empty', () => {
  const d = draftFromHtml(read('workday-jsonld.html'), new URL('https://ejemplo.wd3.myworkdayjobs.com/en-US/EjemploCareers/job/Ciudad-de-Mexico/Client-Advisor_JOBREQ00000001'), 'url')!;
  const v = values(d.fields);
  assert.equal(v.title, 'Client Advisor - Watches & Jewelry - Masaryk');
  assert.equal(v.company, undefined);
  assert.deepEqual([v.countryCode, v.stateCode, v.employmentType, v.datePosted], ['MX', 'MX-CMX', 'full_time', '2026-10-20']);
  assert.match(d.sourceText, /build long-term relationships with clients/);
});

test('Oracle Recruiting Cloud shell: the Open Graph title and description are what a server can read', () => {
  const d = draftFromHtml(read('oracle-og.html'), new URL('https://careers.casa-ficticia.example/es/sites/CX/job/1001'), 'url')!;
  assert.deepEqual(values(d.fields), { title: 'Sales Associate, Boutique Santa Fe' });
  assert.equal(d.sourceTextFrom, 'open-graph');
  assert.match(d.sourceText, /^Como Sales Associate serás responsable/);
  assert.ok(d.notes.includes('no_structured_data'));
});

test('closed postings: Workday postingAvailable:false and a filled SuccessFactors page; a live posting never is', () => {
  const closed = (name: string, live = false) => {
    const html = read(name);
    return closedPosting(html, pageParts(html), live);
  };
  assert.equal(closed('workday-closed.html'), true);
  assert.equal(closed('successfactors-filled.html'), true);
  assert.equal(closed('workday-jsonld.html'), false, 'postingAvailable: true');
  assert.equal(closed('successfactors-microdata.html'), false);
  assert.equal(closed('successfactors-filled.html', true), false, 'a live JobPosting wins over any sentence');
  const es = '<html><body><main><h1>Asesora de ventas</h1><p>Lo sentimos, esta vacante ya no está disponible.</p></main></body></html>';
  assert.equal(closedPosting(es, pageParts(es), false), true);
  const fine = '<html><body><main><p>Si la vacante no está disponible en tu ciudad, revisa otras.</p></main></body></html>';
  assert.equal(closedPosting(fine, pageParts(fine), false), false);
});

test('robots.txt with a locale segment: /en-US/Brand/… is refused when /Brand/ is; never allows more', () => {
  const tenant = parseRobots('User-agent: *\nDisallow: /Ejemplo/\nDisallow: /refreshFacet/\n');
  const allowedEverywhere = (p: string) => robotsPaths(p).every((x) => robotsAllows(tenant, x));
  assert.deepEqual(robotsPaths('/en-US/Ejemplo/job/1'), ['/en-US/Ejemplo/job/1', '/Ejemplo/job/1']);
  assert.deepEqual(robotsPaths('/es_MX/x'), ['/es_MX/x', '/x']);
  assert.deepEqual(robotsPaths('/job/1'), ['/job/1']);
  assert.deepEqual(robotsPaths('/esp/job/1'), ['/esp/job/1'], 'three letters is not a locale segment');
  assert.equal(robotsAllows(tenant, '/en-US/Ejemplo/job/1'), true, 'RFC 9309 literally allows it…');
  assert.equal(allowedEverywhere('/en-US/Ejemplo/job/1'), false, '…cv refuses it');
  assert.equal(allowedEverywhere('/Ejemplo/job/1'), false);
  const open = parseRobots('User-agent: *\nAllow: /EjemploCareers/\nDisallow: /refreshFacet/\n');
  assert.equal(robotsPaths('/en-US/EjemploCareers/job/1').every((x) => robotsAllows(open, x)), true);
  const onlyLocale = parseRobots('User-agent: *\nDisallow: /en-US/\n');
  assert.equal(robotsPaths('/en-US/job/1').every((x) => robotsAllows(onlyLocale, x)), false, 'the literal path still counts');
});

test('LVMH is capture-only (its terms reserve the content for personal use); the career systems are not boards', () => {
  for (const h of ['www.lvmh.com', 'lvmh.com']) assert.equal(captureOnlyBoard(h)?.name, 'LVMH', h);
  for (const h of ['lvmh.com.example.org', 'notlvmh.com', 'ejemplo.wd3.myworkdayjobs.com', 'jobs.example.com']) assert.equal(captureOnlyBoard(h), null, h);
});

function net(replies: Record<string, { status: number; type?: string; body?: string }>) {
  const seen: TransportRequest[] = [];
  const resolver: Resolver = async () => [{ address: '93.184.215.14', family: 4 }];
  const transport: Transport = async (req) => {
    seen.push(req);
    const r = replies[`${req.hostname}${req.path}`] ?? { status: 404 };
    return { status: r.status, headers: r.type ? { 'content-type': r.type } : {}, body: Readable.from(r.body ? [Buffer.from(r.body)] : []) };
  };
  return { resolver, transport, seen };
}

function deps(n: ReturnType<typeof net>): IntakeDeps {
  return { resolver: n.resolver, transport: n.transport, fetchLimiter: new RateLimiter([{ max: 50, ms: 60_000 }]), parseLimiter: new RateLimiter([{ max: 50, ms: 60_000 }]), log: () => {} };
}

test('the intake end to end: microdata page read; closed pages → posting_closed; locale-prefixed robots refusal; LVMH never fetched', async () => {
  clearRobotsCache();
  const html = { status: 200, type: 'text/html; charset=utf-8' };
  const n = net({
    'empleos.maison-ejemplo.example.org/robots.txt': { status: 200, type: 'text/plain', body: 'User-agent: *\nDisallow: /services/\nDisallow: /talentcommunity/\n' },
    'empleos.maison-ejemplo.example.org/job/Polanco/1100000001/': { ...html, body: read('successfactors-microdata.html') },
    'empleos.maison-ejemplo.example.org/job/Polanco/1100000002/': { ...html, body: read('successfactors-filled.html') },
    'ejemplo.wd3.myworkdayjobs.example.org/robots.txt': { status: 200, type: 'text/plain', body: 'User-agent: *\nDisallow: /Ejemplo/\nAllow: /EjemploCareers/\n' },
    'ejemplo.wd3.myworkdayjobs.example.org/EjemploCareers/job/x_1': { ...html, body: read('workday-closed.html') },
    'ejemplo.wd3.myworkdayjobs.example.org/en-US/EjemploCareers/job/x_2': { ...html, body: read('workday-jsonld.html') },
  });
  const d = deps(n);
  const run = (url: string) => runIntake('owner-a', { source: 'url', url }, d);

  const ok = await run('https://empleos.maison-ejemplo.example.org/job/Polanco/1100000001/');
  assert.ok(ok.ok);
  assert.deepEqual([ok.draft.fields.company?.value, ok.draft.fields.stateCode?.value, ok.draft.fields.datePosted?.value], ['Maison Ejemplo', 'MX-CMX', '2026-10-14']);
  const reason = async (url: string) => {
    const r = await run(url);
    return r.ok ? 'ok' : r.body.reason;
  };
  assert.equal(await reason('https://empleos.maison-ejemplo.example.org/job/Polanco/1100000002/'), 'posting_closed');
  assert.equal(await reason('https://ejemplo.wd3.myworkdayjobs.example.org/EjemploCareers/job/x_1'), 'posting_closed');
  assert.equal(await reason('https://ejemplo.wd3.myworkdayjobs.example.org/en-US/EjemploCareers/job/x_2'), 'ok');
  assert.equal(await reason('https://ejemplo.wd3.myworkdayjobs.example.org/en-US/Ejemplo/job/x_3'), 'robots_disallowed');
  assert.ok(!n.seen.some((s) => s.path === '/en-US/Ejemplo/job/x_3'), 'a refused page is never fetched');
  const lv = await run('https://www.lvmh.com/en/join-us/our-job-offers/EJEMPLO1');
  assert.ok(!lv.ok && lv.body.reason === 'capture_only' && lv.body.board === 'LVMH');
  assert.ok(!n.seen.some((s) => s.hostname === 'lvmh.com' || s.hostname.endsWith('.lvmh.com')), 'no connection to a capture-only site');
  clearRobotsCache();
});
