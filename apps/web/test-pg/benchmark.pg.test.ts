/**
 * W5-H: GET /api/v1/jobs/:id/benchmark over a REAL Postgres (as cv_app) with real RS256 tokens and the SYNTHETIC
 * fake HCM (test-support/hcm-fake.ts): owner-scoped (another person's job is a 404 and HCM is never asked), dormant
 * without HCM settings, and nothing about the person reaches HCM.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { DbHandle } from '../src/server/db/client.ts';
import { handleApi } from '../src/server/api/handler.ts';
import { createHcmClient, type HcmBenchmarkPort } from '../src/server/hcm/client.ts';
import { hcmConfig } from '../src/server/hcm/config.ts';
import { bearer, startTestIssuer, type TestIssuer } from '../test-support/janua-tokens.ts';
import { startFakeHcm, type FakeHcm } from '../test-support/hcm-fake.ts';
import { A, B, appDb, resetAndMigrate } from './harness.ts';

let issuer: TestIssuer;
let h: DbHandle;
let fake: FakeHcm;
let hcm: HcmBenchmarkPort;
let jobId = '';

before(async () => {
  await resetAndMigrate();
  issuer = await startTestIssuer();
  h = appDb();
  fake = await startFakeHcm();
  hcm = createHcmClient(hcmConfig(fake.env)!);
});
after(async () => {
  await fake.close();
  await issuer.close();
  await h.sql.end();
});

async function api(method: string, path: string, opts: { sub?: string; body?: unknown; withHcm?: boolean } = {}) {
  const headers: Record<string, string> = opts.sub ? bearer(await issuer.token({ sub: opts.sub, name: `Persona ${opts.sub}`, email: `${opts.sub.replace(/\W/g, '')}@example.test` })) : {};
  const req = new Request(`http://0.0.0.0:3000${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const res = await handleApi(req, path.slice('/api/v1/'.length).split('/'), { env: issuer.env, getDb: () => h, ...(opts.withHcm === false ? {} : { hcm }) });
  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: text ? (JSON.parse(text) as Record<string, any>) : null };
}

test('owner A: the benchmark of their own job, title and state only sent to HCM', async () => {
  const job = await api('POST', '/api/v1/jobs', { sub: A, body: { title: 'Desarrolladora backend', company: 'Ejemplo', location: 'Ciudad de México', sourceText: 'Vacante sintética de prueba.' } });
  assert.equal(job.status, 201);
  jobId = job.body?.job.id as string;
  const res = await api('GET', `/api/v1/jobs/${jobId}/benchmark`, { sub: A });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body?.jobId, jobId);
  assert.equal(res.body?.income.percentiles.p50, 14_950);
  assert.equal(res.body?.query.state, 'MX-CMX');
  const sent = fake.requests.filter((r) => r.path === '/api/v1/market-benchmarks/');
  assert.equal(sent.length, 1, `read ${sent.length} HCM calls`);
  const wire = JSON.stringify(sent);
  for (const secret of [A, 'Persona', 'example.test', 'Ejemplo', 'sintética']) assert.ok(!wire.includes(secret), `${secret} must not reach HCM`);
});

test('owner B: A’s job is a 404 and HCM is not asked', async () => {
  const before = fake.requests.length;
  const res = await api('GET', `/api/v1/jobs/${jobId}/benchmark`, { sub: B });
  assert.deepEqual(res, { status: 404, body: { error: 'not_found' } });
  assert.equal(fake.requests.length, before);
  const mine = await api('GET', `/api/v1/jobs/${jobId}`, { sub: A });
  assert.equal(mine.body?.job.title, 'Desarrolladora backend', 'A’s job unchanged');
});

test('no token: 401; wrong method: 405; dormant without HCM: 503 not_configured', async () => {
  assert.equal((await api('GET', `/api/v1/jobs/${jobId}/benchmark`)).status, 401);
  assert.equal((await api('POST', `/api/v1/jobs/${jobId}/benchmark`, { sub: A })).status, 405);
  assert.deepEqual(await api('GET', `/api/v1/jobs/${jobId}/benchmark`, { sub: A, withHcm: false }), { status: 503, body: { error: 'not_configured' } });
});

test('W5-J typed columns drive the query: stateCode over the location text, the stated monthly MXN salary placed', async () => {
  const job = await api('POST', '/api/v1/jobs', {
    sub: A,
    body: {
      title: 'Desarrollador de software',
      location: 'Ciudad de México',
      countryCode: 'MX',
      stateCode: 'MX-JAL',
      salaryMin: 16000,
      salaryMax: 18000,
      salaryCurrency: 'MXN',
      salaryPeriod: 'month',
      sourceText: 'Vacante sintética con campos tipados.',
    },
  });
  assert.equal(job.status, 201, JSON.stringify(job.body));
  const res = await api('GET', `/api/v1/jobs/${job.body?.job.id as string}/benchmark`, { sub: A });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body?.query, { title: 'Desarrollador de software', country: 'MX', state: 'MX-JAL', stateSource: 'job_field' });
  assert.equal(res.body?.geography.fallback_reason, 'state_cell_below_minimum_n');
  assert.deepEqual(res.body?.posting, {
    salary: { min: 16000, max: 18000, currency: 'MXN', period: 'month' },
    comparableMonthlyMxn: 17000,
    position: 'p50_p75',
  });
  assert.equal(fake.requests.at(-1)?.query.state, 'MX-JAL');

  const hourly = await api('POST', '/api/v1/jobs', {
    sub: A,
    body: { title: 'Desarrollador de software', salaryMin: 150, salaryCurrency: 'MXN', salaryPeriod: 'hour', sourceText: 'Por hora.' },
  });
  const notComparable = await api('GET', `/api/v1/jobs/${hourly.body?.job.id as string}/benchmark`, { sub: A });
  assert.equal(notComparable.body?.posting.position, null);
  assert.equal(notComparable.body?.posting.salary.period, 'hour');
});

test('W7 retail job: the segment call carries only the SINCO, the state and the segment id, never the person or the house', async () => {
  const job = await api('POST', '/api/v1/jobs', {
    sub: A,
    body: {
      title: 'Client Advisor',
      company: 'Maison Ejemplo',
      location: 'Polanco, Ciudad de México',
      salaryMin: 30000,
      salaryMax: 30000,
      salaryCurrency: 'MXN',
      salaryPeriod: 'month',
      sourceText: 'Vacante sintética de boutique.',
    },
  });
  assert.equal(job.status, 201, JSON.stringify(job.body));
  const before = fake.requests.length;
  const res = await api('GET', `/api/v1/jobs/${job.body?.job.id as string}/benchmark`, { sub: A });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body?.posting.position, 'above_p90');
  assert.equal(res.body?.segment.state, 'ready');
  assert.match(res.body?.segment.label as string, /no solo lujo$/);
  const sent = fake.requests.slice(before).filter((r) => r.path === '/api/v1/market-benchmarks/');
  assert.deepEqual(
    sent.map((r) => r.query),
    [
      { title: 'Client Advisor', state: 'MX-CMX' },
      { sinco: '4211', state: 'MX-CMX', segment: 'retail_apparel_personal' },
    ],
  );
  const wire = JSON.stringify(sent);
  for (const secret of [A, 'Persona', 'example.test', 'Maison', 'Polanco', 'boutique', '30000']) assert.ok(!wire.includes(secret), `${secret} must not reach HCM`);
});
