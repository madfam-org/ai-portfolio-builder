/**
 * W5-J ATS detection and mapping (synthetic JSON in the documented field names), board policy, and the intake service
 * end to end over a fake network: capture-only boards never connect, ATS API first with page fallback, robots.txt
 * before any page, per-owner ceilings, honest failures, and logs that carry the host and never the URL.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { matchRoute } from '../src/lib/api-routes.ts';
import { detectAts } from '../src/server/ingest/ats.ts';
import { captureOnlyBoard } from '../src/server/ingest/boards.ts';
import type { Resolver, Transport, TransportRequest } from '../src/server/ingest/fetcher.ts';
import { runIntake, type IntakeDeps } from '../src/server/ingest/intake.ts';
import { RateLimiter } from '../src/server/ingest/rate-limit.ts';
import { clearRobotsCache } from '../src/server/ingest/robots.ts';
import type { DraftFields } from '../src/server/ingest/types.ts';

const FIX = join(import.meta.dirname, 'fixtures', 'ingest');
const atsJson = (name: string) => JSON.parse(readFileSync(join(FIX, 'ats', `${name}.json`), 'utf8')) as unknown;
const values = (f: DraftFields): Record<string, unknown> => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v!.value]));

test('ATS detection by the careers URL a candidate sees; anything else is the page path', () => {
  const api = (u: string) => detectAts(new URL(u))?.apiUrl.toString() ?? null;
  assert.equal(api('https://job-boards.greenhouse.io/ejemplo/jobs/4012345'), 'https://boards-api.greenhouse.io/v1/boards/ejemplo/jobs/4012345?pay_transparency=true');
  assert.equal(api('https://boards.greenhouse.io/embed/job_app?for=ejemplo&token=4012345'), 'https://boards-api.greenhouse.io/v1/boards/ejemplo/jobs/4012345?pay_transparency=true');
  assert.equal(api('https://jobs.lever.co/ejemplo/5f3c2b1a-0000-4000-8000-00000000abcd/apply'), 'https://api.lever.co/v0/postings/ejemplo/5f3c2b1a-0000-4000-8000-00000000abcd');
  assert.equal(api('https://jobs.eu.lever.co/ejemplo/5f3c2b1a-0000-4000-8000-00000000abcd'), 'https://api.eu.lever.co/v0/postings/ejemplo/5f3c2b1a-0000-4000-8000-00000000abcd');
  assert.equal(api('https://jobs.smartrecruiters.com/EjemploCorp/744000012345678-contador-general'), 'https://api.smartrecruiters.com/v1/companies/EjemploCorp/postings/744000012345678');
  assert.equal(api('https://jobs.ashbyhq.com/ejemplo/22222222-2222-4222-8222-222222222222'), 'https://api.ashbyhq.com/posting-api/job-board/ejemplo?includeCompensation=true');
  assert.equal(api('https://apply.workable.com/ejemplo/j/AB12CD34EF/'), 'https://www.workable.com/api/accounts/ejemplo?details=true');
  assert.equal(api('https://ejemplo.recruitee.com/o/disenadora-ux'), 'https://ejemplo.recruitee.com/api/offers/');
  assert.equal(api('https://ejemplo.pinpointhq.com/es/postings/8f9e7d6c-aaaa-4bbb-8ccc-000000000123'), 'https://ejemplo.pinpointhq.com/postings.json');
  for (const u of ['https://job-boards.greenhouse.io/ejemplo', 'https://jobs.lever.co/ejemplo/not-a-uuid', 'https://ejemplo.teamtailor.com/jobs/1-x', 'https://empresa.wd5.myworkdayjobs.com/x/job/1', 'https://evil.example.org/jobs.lever.co/a/5f3c2b1a-0000-4000-8000-00000000abcd']) {
    assert.equal(api(u), null, u);
  }
});

test('ATS mapping from each documented shape: only what the API returns, from ats-api', () => {
  const run = (url: string, name: string) => {
    const t = detectAts(new URL(url))!;
    const json = atsJson(name);
    const job = t.pick(json)!;
    assert.ok(job, name);
    const m = t.map(job, json);
    assert.ok(Object.values(m.fields).every((f) => f!.from === 'ats-api'));
    return { ...m, v: values(m.fields) };
  };
  const gh = run('https://job-boards.greenhouse.io/ejemplo/jobs/4012345', 'greenhouse');
  assert.deepEqual(gh.v, { title: 'Ingeniera de Datos', company: 'Ejemplo Analítica', location: 'Ciudad de México, CDMX', stateCode: 'MX-CMX', countryCode: 'MX', datePosted: '2026-10-08', salaryMin: 60000, salaryMax: 80000, salaryCurrency: 'MXN' });
  assert.match(gh.description!, /Construirás pipelines de datos[\s\S]*• SQL avanzado/);
  const lv = run('https://jobs.lever.co/ejemplo/5f3c2b1a-0000-4000-8000-00000000abcd', 'lever');
  assert.deepEqual(lv.v, { title: 'Product Manager, Payments', location: 'Monterrey, Nuevo León', countryCode: 'MX', stateCode: 'MX-NLE', employmentType: 'full_time', workMode: 'hybrid', salaryMin: 90000, salaryMax: 120000, salaryCurrency: 'MXN', salaryPeriod: 'month' });
  assert.ok(!('company' in lv.fields), 'Lever does not name the company');
  assert.match(lv.description!, /Lead our payments roadmap[\s\S]*What you will do[\s\S]*• Own discovery/);
  const sr = run('https://jobs.smartrecruiters.com/EjemploCorp/744000012345678-contador-general', 'smartrecruiters');
  assert.deepEqual([sr.v.title, sr.v.company, sr.v.stateCode, sr.v.countryCode, sr.v.employmentType, sr.v.datePosted], ['Contador General', 'Ejemplo Corporativo', 'MX-PUE', 'MX', 'full_time', '2026-10-02']);
  const ab = run('https://jobs.ashbyhq.com/ejemplo/22222222-2222-4222-8222-222222222222', 'ashby');
  assert.deepEqual([ab.v.title, ab.v.stateCode, ab.v.employmentType, ab.v.workMode, ab.v.salaryMin, ab.v.salaryCurrency, ab.v.salaryPeriod], ['Frontend Engineer', 'MX-YUC', 'contract', 'hybrid', 50000, 'USD', 'year']);
  const wk = run('https://apply.workable.com/ejemplo/j/AB12CD34EF/', 'workable');
  assert.deepEqual([wk.v.title, wk.v.company, wk.v.stateCode, wk.v.workMode, wk.v.employmentType], ['Supervisor de Almacén', 'Ejemplo Logística', 'MX-MEX', 'onsite', 'full_time']);
  const rc = run('https://ejemplo.recruitee.com/o/disenadora-ux', 'recruitee');
  assert.deepEqual([rc.v.stateCode, rc.v.workMode, rc.v.employmentType, rc.v.salaryMin, rc.v.salaryMax, rc.v.salaryPeriod], ['MX-OAX', 'remote', 'part_time', 20000, 25000, 'month']);
  const pp = run('https://ejemplo.pinpointhq.com/postings/8f9e7d6c-aaaa-4bbb-8ccc-000000000123', 'pinpoint');
  assert.deepEqual([pp.v.stateCode, pp.v.workMode, pp.v.salaryMin, pp.v.salaryPeriod], ['MX-MOR', 'onsite', 16000, 'month']);
  assert.equal(detectAts(new URL('https://jobs.ashbyhq.com/ejemplo/33333333-3333-4333-8333-333333333333'))!.pick(atsJson('ashby')), null, 'not in the list → null');
});

test('boards that forbid fetching are capture-only; others are not', () => {
  for (const h of ['www.linkedin.com', 'mx.linkedin.com', 'lnkd.in', 'mx.indeed.com', 'www.indeed.com', 'indeed.com.mx', 'www.google.com', 'www.google.com.mx', 'www.glassdoor.com.mx', 'mx.talent.com', 'mx.computrabajo.com']) {
    assert.ok(captureOnlyBoard(h), h);
  }
  for (const h of ['www.occ.com.mx', 'www.bumeran.com.mx', 'boards.greenhouse.io', 'notlinkedin.com.example.org', 'linkedin.com.example.org']) assert.equal(captureOnlyBoard(h), null, h);
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

function deps(n: ReturnType<typeof net>, extra: Partial<IntakeDeps> = {}): IntakeDeps & { lines: Record<string, unknown>[] } {
  const lines: Record<string, unknown>[] = [];
  return { resolver: n.resolver, transport: n.transport, fetchLimiter: new RateLimiter([{ max: 50, ms: 60_000 }]), parseLimiter: new RateLimiter([{ max: 50, ms: 60_000 }]), log: (l) => lines.push(l), lines, ...extra };
}

const page = readFileSync(join(FIX, 'jsonld-board.html'), 'utf8');

test('a link: robots.txt, then one page read as JSON-LD; the log has the host and outcome, never the path or query', async () => {
  clearRobotsCache();
  const n = net({
    'empleos.example.org/robots.txt': { status: 200, type: 'text/plain', body: 'User-agent: *\nDisallow: /buscar\n' },
    'empleos.example.org/vacante/12345?ref=secret-token': { status: 200, type: 'text/html', body: page },
  });
  const d = deps(n);
  const r = await runIntake('owner-a', { source: 'url', url: 'https://empleos.example.org/vacante/12345?ref=secret-token' }, d);
  assert.ok(r.ok);
  assert.equal(r.draft.sourceKind, 'url');
  assert.equal(r.draft.fields.stateCode!.value, 'MX-JAL');
  assert.deepEqual(n.seen.map((s) => s.path), ['/robots.txt', '/vacante/12345?ref=secret-token']);
  assert.equal(d.lines.length, 1);
  assert.equal(d.lines[0]!.host, 'empleos.example.org');
  assert.equal(d.lines[0]!.outcome, 'ok');
  assert.ok(!JSON.stringify(d.lines).includes('secret-token') && !JSON.stringify(d.lines).includes('/vacante'), 'no path or query in logs');
  clearRobotsCache();
});

test('a link: robots.txt disallow, unreachable robots, a 403 from the site, an unreadable page — honest reasons, no retry', async () => {
  clearRobotsCache();
  const n = net({
    'a.example.org/robots.txt': { status: 200, type: 'text/plain', body: 'User-agent: madfam-cv\nDisallow: /\n' },
    'b.example.org/robots.txt': { status: 500 },
    'c.example.org/v/1': { status: 403, type: 'text/html', body: 'captcha' },
    'd.example.org/v/1': { status: 200, type: 'text/html', body: '<html><title>Inicio</title><body>Hola</body></html>' },
  });
  const d = deps(n);
  const reason = async (url: string) => {
    const r = await runIntake('owner-a', { source: 'url', url }, d);
    return r.ok ? 'ok' : r.body.reason;
  };
  assert.equal(await reason('https://a.example.org/v/1'), 'robots_disallowed');
  assert.equal(await reason('https://b.example.org/v/1'), 'robots_unreachable');
  assert.equal(await reason('https://c.example.org/v/1'), 'blocked_by_site');
  assert.equal(await reason('https://d.example.org/v/1'), 'unreadable');
  assert.equal(n.seen.filter((s) => s.hostname === 'c.example.org' && s.path === '/v/1').length, 1, 'never retried');
  assert.ok(!n.seen.some((s) => s.hostname === 'a.example.org' && s.path === '/v/1'), 'a disallowed page is never fetched');
  clearRobotsCache();
});

test('capture-only boards and refused URLs never touch the network', async () => {
  const n = net({});
  const d = deps(n);
  for (const [url, reason] of [
    ['https://www.linkedin.com/jobs/view/123', 'capture_only'],
    ['https://mx.indeed.com/viewjob?jk=abc', 'capture_only'],
    ['http://empleos.example.org/v/1', 'not_https'],
    ['https://169.254.169.254/latest/meta-data/', 'private_address'],
    ['https://cv.cv.svc.cluster.local/', 'blocked_host'],
    ['https://empleos.example.org:8443/v', 'bad_port'],
  ] as const) {
    const r = await runIntake('owner-a', { source: 'url', url }, d);
    assert.ok(!r.ok && r.status === 422 && r.body.reason === reason, url);
    if (reason === 'capture_only') assert.ok(!r.ok && typeof r.body.board === 'string');
  }
  assert.equal(n.seen.length, 0);
});

test('an ATS link: the public API answers; a failing API falls back to the page (with a note)', async () => {
  clearRobotsCache();
  const n = net({
    'boards-api.greenhouse.io/v1/boards/ejemplo/jobs/4012345?pay_transparency=true': { status: 200, type: 'application/json', body: JSON.stringify(atsJson('greenhouse')) },
    'job-boards.greenhouse.io/robots.txt': { status: 404 },
    'job-boards.greenhouse.io/ejemplo/jobs/999': { status: 200, type: 'text/html', body: page },
  });
  const d = deps(n);
  const ok = await runIntake('owner-a', { source: 'url', url: 'https://job-boards.greenhouse.io/ejemplo/jobs/4012345' }, d);
  assert.ok(ok.ok);
  assert.equal(ok.draft.sourceKind, 'ats');
  assert.equal(ok.draft.provider, 'greenhouse');
  assert.equal(ok.draft.sourceTextFrom, 'ats-api');
  assert.equal(ok.draft.sourceUrl, 'https://job-boards.greenhouse.io/ejemplo/jobs/4012345');
  assert.ok(!n.seen.some((s) => s.path === '/robots.txt'), 'documented APIs need no robots.txt');
  const fb = await runIntake('owner-a', { source: 'url', url: 'https://job-boards.greenhouse.io/ejemplo/jobs/999' }, d);
  assert.ok(fb.ok);
  assert.equal(fb.draft.sourceKind, 'url');
  assert.ok(fb.draft.notes.includes('ats_fallback'));
  clearRobotsCache();
});

test('per-owner ceilings: link reads and all intake calls; owners are independent', async () => {
  const n = net({});
  const d = deps(n, { fetchLimiter: new RateLimiter([{ max: 2, ms: 60_000 }]), parseLimiter: new RateLimiter([{ max: 4, ms: 60_000 }]) });
  const url = { source: 'url', url: 'https://nada.example.org/v' };
  assert.notEqual((await runIntake('a', url, d)).ok, undefined);
  await runIntake('a', url, d);
  const third = await runIntake('a', url, d);
  assert.ok(!third.ok && third.status === 429 && (third.body.retryAfter ?? 0) > 0);
  assert.ok((await runIntake('b', url, d)).ok === false && n.seen.some((s) => s.hostname === 'nada.example.org'));
  const text = { source: 'text', text: 'Puesto: Chofer\nEmpresa: Ejemplo' };
  assert.ok((await runIntake('a', text, d)).ok);
  const over = await runIntake('a', text, d);
  assert.ok(!over.ok && over.status === 429);
});

test('bodies are strict: unknown fields, unknown sources and oversized captures are 400', async () => {
  const d = deps(net({}));
  for (const body of [
    { source: 'url' },
    { source: 'url', url: 'https://x.example.org', extra: 1 },
    { source: 'ftp', url: 'x' },
    { source: 'text', kind: 'ocr', text: 'x' },
    { source: 'capture', capture: { jsonLd: Array(11).fill('{}') } },
    { source: 'capture', capture: { text: 'x', ownerSub: 'janua|someone-else' } },
  ]) {
    const r = await runIntake('owner-a', body, d);
    assert.ok(!r.ok && r.status === 400 && r.body.error === 'invalid_body', JSON.stringify(body).slice(0, 80));
  }
});

test('the route: POST /jobs/intake is an authed route that does not collide with /jobs/:id', () => {
  assert.deepEqual(matchRoute(['jobs', 'intake']), { kind: 'authed', name: 'job-intake', ids: [], methods: ['POST'] });
  assert.equal(matchRoute(['jobs', 'intake', 'x']), null);
});
