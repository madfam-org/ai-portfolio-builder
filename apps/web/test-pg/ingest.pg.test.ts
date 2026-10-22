/**
 * W5-J job intake over a REAL Postgres (as cv_app): migration 0002 is additive (old-shape rows keep working), the typed
 * posting fields round-trip, the database CHECKs hold even if the API is bypassed, another owner gets 404 everywhere,
 * the intake preview stores nothing, and the job ceiling is checked before any link is read.
 */
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { after, before, test } from 'node:test';
import postgres from 'postgres';
import type { DbHandle } from '../src/server/db/client.ts';
import { handleApi, type ApiDeps } from '../src/server/api/handler.ts';
import type { Transport, TransportRequest } from '../src/server/ingest/fetcher.ts';
import { RateLimiter } from '../src/server/ingest/rate-limit.ts';
import { bearer, startTestIssuer, type TestIssuer } from '../test-support/janua-tokens.ts';
import { A, B, appDb, resetAndMigrate, testUrls } from './harness.ts';

let issuer: TestIssuer;
let h: DbHandle;
const connected: TransportRequest[] = [];
const transport: Transport = async (req) => {
  connected.push(req);
  return { status: 404, headers: {}, body: Readable.from([]) };
};

before(async () => {
  await resetAndMigrate();
  issuer = await startTestIssuer();
  h = appDb();
});
after(async () => {
  await issuer.close();
  await h.sql.end();
});

// Test-only: the assertions walk nested JSON response bodies.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

async function api(sub: string | null, method: string, path: string, body?: unknown, extra: Partial<ApiDeps> = {}): Promise<{ status: number; body: Json | null }> {
  const headers = sub ? bearer(await issuer.token({ sub })) : {};
  const req = new Request(`http://0.0.0.0:3000${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const deps: ApiDeps = {
    env: issuer.env,
    getDb: () => h,
    intake: { transport, resolver: async () => [{ address: '93.184.215.14', family: 4 }], fetchLimiter: new RateLimiter([{ max: 100, ms: 60_000 }]), parseLimiter: new RateLimiter([{ max: 100, ms: 60_000 }]), log: () => undefined },
    ...extra,
  };
  const res = await handleApi(req, path.slice('/api/v1/'.length).split('/'), deps);
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Json) : null };
}

const typed = {
  title: 'Desarrolladora Backend Sr.',
  company: 'Ejemplo Software',
  location: 'Guadalajara, Jalisco',
  sourceUrl: 'https://empleos.example.org/vacante/12345',
  sourceText: 'Buscamos una persona desarrolladora backend con Node.js y PostgreSQL.',
  sourceKind: 'url',
  countryCode: 'MX',
  stateCode: 'MX-JAL',
  employmentType: 'full_time',
  workMode: 'hybrid',
  salaryMin: 45000,
  salaryMax: 60000.5,
  salaryCurrency: 'MXN',
  salaryPeriod: 'month',
  datePosted: '2026-10-12',
  validThrough: '2026-11-30',
};

test('migration 0002 is additive: the new columns are nullable, and a job written the pre-W5-J way still works', async () => {
  const cols = await h.sql<{ column_name: string; is_nullable: string; column_default: string | null }[]>`
    select column_name, is_nullable, column_default from information_schema.columns where table_name = 'jobs' and column_name = any(${[
      'source_kind', 'country_code', 'state_code', 'employment_type', 'work_mode', 'salary_min', 'salary_max', 'salary_currency', 'salary_period', 'date_posted', 'valid_through',
    ]})`;
  assert.equal(cols.length, 11);
  for (const c of cols) assert.deepEqual([c.column_name, c.is_nullable, c.column_default], [c.column_name, 'YES', null]);
  const old = await api(A, 'POST', '/api/v1/jobs', { title: 'Puesto viejo', sourceText: 'Texto pegado como antes de W5-J.' });
  assert.equal(old.status, 201);
  for (const k of ['sourceKind', 'countryCode', 'stateCode', 'employmentType', 'workMode', 'salaryMin', 'salaryMax', 'salaryCurrency', 'salaryPeriod', 'datePosted', 'validThrough']) {
    assert.equal(old.body!.job[k], null, k);
  }
});

test('typed posting fields round-trip as typed JSON; another owner gets 404 for read, patch and delete', async () => {
  const created = await api(A, 'POST', '/api/v1/jobs', typed);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body!.job.id as string;
  const read = await api(A, 'GET', `/api/v1/jobs/${id}`);
  for (const [k, v] of Object.entries(typed)) assert.deepEqual(read.body!.job[k], v, k);
  assert.equal(typeof read.body!.job.salaryMin, 'number', 'numeric(14,2) comes back as a number');

  assert.equal((await api(B, 'GET', `/api/v1/jobs/${id}`)).status, 404);
  assert.equal((await api(B, 'PATCH', `/api/v1/jobs/${id}`, { salaryMin: 1 })).status, 404);
  assert.equal((await api(B, 'PATCH', `/api/v1/jobs/${id}`, { stateCode: 'MX-CMX' })).status, 404);
  assert.equal((await api(B, 'DELETE', `/api/v1/jobs/${id}`)).status, 404);
  assert.ok(!(await api(B, 'GET', '/api/v1/jobs')).body!.jobs.some((j: Json) => j.id === id));
  const again = await api(A, 'GET', `/api/v1/jobs/${id}`);
  assert.equal(again.body!.job.salaryMin, 45000, 'unchanged after B tried');
  assert.equal(again.body!.job.stateCode, 'MX-JAL');

  const patched = await api(A, 'PATCH', `/api/v1/jobs/${id}`, { workMode: 'remote', stateCode: null });
  assert.equal(patched.status, 200);
  assert.equal(patched.body!.job.workMode, 'remote');
  assert.equal(patched.body!.job.stateCode, null);
  assert.equal((await api(A, 'PATCH', `/api/v1/jobs/${id}`, { sourceKind: 'paste' })).status, 400, 'the source kind is set at creation only');
});

test('validation: salary order and units, state and country codes, dates; the stored row is merged on PATCH', async () => {
  const bad = async (over: Json) => (await api(A, 'POST', '/api/v1/jobs', { ...typed, ...over })).status;
  assert.equal(await bad({ salaryMin: 70000 }), 400, 'min > max');
  assert.equal(await bad({ salaryMin: null, salaryMax: null }), 400, 'currency and period without an amount');
  assert.equal(await bad({ salaryMin: 0 }), 400);
  assert.equal(await bad({ salaryMin: 1.005 }), 400, 'at most two decimals');
  assert.equal(await bad({ stateCode: 'MX-XXX' }), 400);
  assert.equal(await bad({ stateCode: 'jalisco' }), 400);
  assert.equal(await bad({ countryCode: 'mex' }), 400);
  assert.equal(await bad({ salaryCurrency: 'pesos' }), 400);
  assert.equal(await bad({ employmentType: 'FULL_TIME' }), 400);
  assert.equal(await bad({ datePosted: '2026-02-30' }), 400);
  assert.equal(await bad({ sourceKind: 'scrape' }), 400);
  const ok = await api(A, 'POST', '/api/v1/jobs', { ...typed, stateCode: 'US-TX', countryCode: 'US', salaryCurrency: 'USD' });
  assert.equal(ok.status, 201, 'other countries keep the ISO 3166-2 shape');
  const id = ok.body!.job.id as string;
  const merged = await api(A, 'PATCH', `/api/v1/jobs/${id}`, { salaryMin: 99999 });
  assert.equal(merged.status, 400, 'min above the STORED max');
  assert.equal(merged.body!.issues[0].path, 'salaryMax');
  assert.equal((await api(A, 'PATCH', `/api/v1/jobs/${id}`, { salaryMin: null, salaryMax: null })).status, 400, 'would leave a currency without an amount');
  assert.equal((await api(A, 'PATCH', `/api/v1/jobs/${id}`, { salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null })).status, 200);
});

test('the database CHECKs hold even when the API is bypassed (as cv_app)', async () => {
  const insert = (cols: Json) =>
    h.sql`insert into jobs ${h.sql({ owner_sub: A, title: 't', source_text: 's', ...cols })}`.then(
      () => 'ok',
      (err: { code?: string }) => err.code,
    );
  assert.equal(await insert({ salary_min: 10, salary_max: 5 }), '23514');
  assert.equal(await insert({ salary_currency: 'MXN' }), '23514');
  assert.equal(await insert({ state_code: 'Jalisco' }), '23514');
  assert.equal(await insert({ employment_type: 'gig' }), '23514');
  assert.equal(await insert({ work_mode: 'moon' }), '23514');
  assert.equal(await insert({ source_kind: 'scrape' }), '23514');
  assert.equal(await insert({ country_code: 'mx' }), '23514');
  assert.equal(await insert({ salary_min: 10, salary_max: 20, salary_currency: 'MXN', salary_period: 'month', state_code: 'MX-JAL' }), 'ok');
});

test('POST /jobs/intake: a preview only (nothing stored), owner-scoped, 401 without a token', async () => {
  const before = (await api(A, 'GET', '/api/v1/jobs')).body!.jobs.length as number;
  const r = await api(A, 'POST', '/api/v1/jobs/intake', { source: 'text', kind: 'paste', text: 'Puesto: Analista de Datos\nEmpresa: Ejemplo\nUbicación: Monterrey, N.L.\nSueldo: $30,000 - $35,000 MXN mensuales' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body!.draft.fields.stateCode.value, 'MX-NLE');
  assert.equal(r.body!.draft.fields.salaryMin.from, 'labeled-text');
  assert.equal((await api(A, 'GET', '/api/v1/jobs')).body!.jobs.length, before, 'the preview stored nothing');
  assert.equal((await api(null, 'POST', '/api/v1/jobs/intake', { source: 'text', text: 'x' })).status, 401);
  assert.equal((await api(A, 'GET', '/api/v1/jobs/intake')).status, 405);
  const priv = await api(A, 'POST', '/api/v1/jobs/intake', { source: 'url', url: 'https://10.0.0.1/admin' });
  assert.deepEqual([priv.status, priv.body!.reason], [422, 'private_address']);
  assert.equal(connected.length, 0, 'nothing connected');
  assert.equal((await api(A, 'POST', '/api/v1/jobs/intake', { source: 'text', text: 'x', ownerSub: B })).status, 400, 'strict body');
});

test('the job ceiling is checked BEFORE any link is read (429 quota_exceeded, no connection); B is unaffected', async () => {
  const owner = postgres(testUrls().owner, { max: 1, onnotice: () => undefined });
  const count = (await owner<{ n: number }[]>`select count(*)::int as n from jobs where owner_sub = ${A}`)[0]!.n;
  await owner.end();
  const quotas = { jobs: count };
  const r = await api(A, 'POST', '/api/v1/jobs/intake', { source: 'url', url: 'https://empleos.example.org/v/1' }, { quotas });
  assert.deepEqual([r.status, r.body!.error, r.body!.resource], [429, 'quota_exceeded', 'jobs']);
  assert.equal(connected.length, 0);
  const b = await api(B, 'POST', '/api/v1/jobs/intake', { source: 'text', text: 'Puesto: Chofer de reparto\nEmpresa: Ejemplo\nRutas locales con licencia federal.' }, { quotas });
  assert.equal(b.status, 200);
});

test('data rights: the export carries the typed fields; «Eliminar mis datos» removes them with the job', async () => {
  const exp = await api(A, 'GET', '/api/v1/me/export');
  const withSalary = (exp.body!.jobs as Json[]).find((j) => j.salaryCurrency === 'MXN' && j.stateCode === 'MX-JAL');
  assert.ok(withSalary, 'exported');
  const del = await api(A, 'DELETE', '/api/v1/me', { confirm: 'delete-all-my-data' });
  assert.equal(del.status, 200);
  const left = await h.sql`select count(*)::int as n from jobs where owner_sub = ${A}`;
  assert.equal(left[0]!.n, 0);
  assert.ok((await api(B, 'GET', '/api/v1/jobs')).status === 200);
});
