/** GET /api/v1/jobs/:id/benchmark (server/hcm/route.ts) over a fake repository and the SYNTHETIC fake HCM. */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { Repository } from '../src/server/db/repository.ts';
import { matchRoute } from '../src/lib/api-routes.ts';
import { createHcmClient, type HcmBenchmarkPort } from '../src/server/hcm/client.ts';
import { hcmConfig } from '../src/server/hcm/config.ts';
import { RETAIL_SALES_SINCO, RETAIL_SEGMENT, jobBenchmark, salaryPosition } from '../src/server/hcm/route.ts';
import { startFakeHcm, type FakeHcm } from '../test-support/hcm-fake.ts';

const ID = '00000000-0000-4000-8000-000000000001';
let fake: FakeHcm;
let port: HcmBenchmarkPort;
before(async () => {
  fake = await startFakeHcm();
  port = createHcmClient(hcmConfig(fake.env)!);
});
after(() => fake.close());

function repo(row: Record<string, unknown> | null): Repository {
  return { getJob: async (_sub: string, id: string) => (row && id === ID ? row : null) } as unknown as Repository;
}
const job = (extra: Record<string, unknown> = {}) => ({ id: ID, ownerSub: 'janua|a', title: 'Desarrolladora backend', location: 'Ciudad de México', ...extra });
const read = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, any> }); // eslint-disable-line @typescript-eslint/no-explicit-any

test('route table: GET /jobs/:id/benchmark only, UUID ids only', () => {
  assert.deepEqual(matchRoute(['jobs', ID, 'benchmark']), { kind: 'authed', name: 'job-benchmark', ids: [ID], methods: ['GET'] });
  assert.equal(matchRoute(['jobs', 'not-a-uuid', 'benchmark']), null);
});

test('absent or foreign job: 404 before anything else, HCM never called', async () => {
  const before = fake.requests.length;
  assert.equal((await jobBenchmark(repo(null), 'janua|b', ID, {}, port)).status, 404);
  assert.equal(fake.requests.length, before);
});

test('dormant: 503 not_configured when the HCM settings are absent', async () => {
  const res = await read(await jobBenchmark(repo(job()), 'janua|a', ID, {}));
  assert.deepEqual(res, { status: 503, body: { error: 'not_configured' } });
});

test('state from the location, HCM figures passed through, no salary to compare', async () => {
  const { status, body } = await read(await jobBenchmark(repo(job()), 'janua|a', ID, {}, port));
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
  assert.deepEqual(body.query, { title: 'Desarrolladora backend', country: null, state: 'MX-CMX', stateSource: 'location_text' });
  assert.equal(body.income.percentiles.p50, 14_950);
  assert.equal(body.geography.scope, 'state');
  assert.deepEqual(body.posting, { salary: null, comparableMonthlyMxn: null, position: null });
  assert.equal(body.source.dataset_id, 'MEX-INEGI.SYNTHETIC-ENOE-2031-III');
  const last = fake.requests.at(-1)!;
  assert.deepEqual(last.query, { title: 'Desarrolladora backend', state: 'MX-CMX' });
  assert.ok(!JSON.stringify(last).includes('janua|a'), 'the owner never reaches HCM');
});

test('a stated monthly MXN salary is placed between the published percentiles', async () => {
  const { body } = await read(await jobBenchmark(repo(job({ salaryMin: 16_000, salaryMax: 18_000, salaryCurrency: 'MXN', salaryPeriod: 'month' })), 'janua|a', ID, {}, port));
  assert.equal(body.posting.comparableMonthlyMxn, 17_000);
  assert.equal(body.posting.position, 'p50_p75');
});

test('insufficient data and unresolved titles carry no figures', async () => {
  const thin = await read(await jobBenchmark(repo(job({ title: 'Contador', location: '' })), 'janua|a', ID, {}, port));
  assert.equal(thin.body.status, 'insufficient_data');
  assert.equal(thin.body.income, null);
  assert.deepEqual(thin.body.suppression, { reason: 'below_minimum_n', n: 12, minimum_n: 30 });
  const vague = await read(await jobBenchmark(repo(job({ title: 'Ninja de la vida' })), 'janua|a', ID, {}, port));
  assert.equal(vague.body.status, 'occupation_unresolved');
  assert.equal(vague.body.income, null);
});

test('HCM failing: 503 benchmark_unavailable with Retry-After', async () => {
  const res = await jobBenchmark(repo(job({ title: 'falla total' })), 'janua|a', ID, {}, port);
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('retry-after'), '60');
  assert.deepEqual(await res.json(), { error: 'benchmark_unavailable' });
});

test('salaryPosition: bands, and tails withheld are never estimated', () => {
  const p = { p10: 10, p25: 20, p50: 30, p75: 40, p90: 50 };
  assert.deepEqual([5, 10, 15, 20, 29, 30, 40, 45, 50, 51].map((v) => salaryPosition(v, p)), [
    'below_p10', 'p10_p25', 'p10_p25', 'p25_p50', 'p25_p50', 'p50_p75', 'p50_p75', 'p75_p90', 'p75_p90', 'above_p90',
  ]);
  const core = { p10: null, p25: 20, p50: 30, p75: 40, p90: null };
  assert.equal(salaryPosition(5, core), 'below_p25');
  assert.equal(salaryPosition(60, core), 'above_p75');
  assert.equal(salaryPosition(30, { ...core, p50: null }), null);
});

// ---- W7: the retail segment view (decided from the matched SINCO, never from a company or brand) ----

const benchCalls = () => fake.requests.filter((r) => r.path === '/api/v1/market-benchmarks/');

test('retail sales job: a second, segment call by SINCO; the general answer is unchanged', async () => {
  const before = benchCalls().length;
  const salary = { salaryMin: 30_000, salaryMax: 30_000, salaryCurrency: 'MXN', salaryPeriod: 'month' };
  const { status, body } = await read(await jobBenchmark(repo(job({ title: 'Client Advisor', company: 'Maison X', ...salary })), 'janua|a', ID, {}, port));
  assert.equal(status, 200);
  assert.equal(body.occupation.sinco, '4211');
  assert.equal(body.income.percentiles.p90, 13_000, 'general CDMX P90');
  assert.equal(body.posting.position, 'above_p90');
  assert.equal(body.segment.state, 'ready');
  assert.match(body.segment.label, /no solo lujo$/);
  assert.match(body.segment.labelEn, /not only luxury$/);
  assert.equal(body.segment.status, 'ok');
  assert.equal(body.segment.income.n, 30);
  assert.deepEqual(body.segment.income.percentiles, { p10: null, p25: 4_400, p50: 6_400, p75: 8_400, p90: null });
  assert.equal(body.segment.position, 'above_p75', 'P90 withheld in the segment: never estimated');
  assert.equal(body.segment.source.dataset_id, 'MEX-INEGI.SYNTHETIC-ENOE-2031-III');
  const calls = benchCalls().slice(before);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0]!.query, { title: 'Client Advisor', state: 'MX-CMX' });
  assert.deepEqual(calls[1]!.query, { sinco: '4211', state: 'MX-CMX', segment: 'retail_apparel_personal' });
  assert.ok(!JSON.stringify(calls).includes('Maison'), 'the company never reaches HCM');
});

test('non-retail occupation or unresolved title: no segment call, segment null', async () => {
  for (const title of ['Desarrolladora de software', 'Ninja de la vida']) {
    const before = benchCalls().length;
    const { body } = await read(await jobBenchmark(repo(job({ title, location: 'Guadalajara, Jalisco' })), 'janua|a', ID, {}, port));
    assert.equal(body.segment, null, title);
    assert.equal(benchCalls().length - before, 1, title);
  }
});

test('store manager: the segment is withheld below the floor and says so with n', async () => {
  const { body } = await read(await jobBenchmark(repo(job({ title: 'Store Manager' })), 'janua|a', ID, {}, port));
  assert.equal(body.occupation.sinco, '1411');
  assert.equal(body.segment.state, 'ready');
  assert.equal(body.segment.status, 'insufficient_data');
  assert.equal(body.segment.income, null);
  assert.deepEqual(body.segment.suppression, { reason: 'below_minimum_n', n: 12, minimum_n: 30 });
  assert.equal(body.segment.position, null);
});

test('segment call failing (HCM 503): the general answer still shows; segment unavailable', async () => {
  const { status, body } = await read(await jobBenchmark(repo(job({ title: 'Subgerente de tienda' })), 'janua|a', ID, {}, port));
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.occupation.sinco, '1711');
  assert.deepEqual(body.segment, { state: 'unavailable' });
});

test('an HCM without segments (400 to the new parameter) leaves the general answer intact', async () => {
  const general = await port.benchmark({ title: 'Asesora de ventas', state: null });
  assert.ok(general.ok);
  const oldHcm: HcmBenchmarkPort = { benchmark: async (q) => (q.segment ? { ok: false, reason: 'invalid' } : general) };
  const { status, body } = await read(await jobBenchmark(repo(job({ title: 'Asesora de ventas', location: '' })), 'janua|a', ID, {}, oldHcm));
  assert.equal(status, 200);
  assert.equal(body.income.n, 6_000);
  assert.deepEqual(body.segment, { state: 'unavailable' });
});

test('RETAIL_SALES_SINCO is the store sales and store management groups only', () => {
  assert.deepEqual([...RETAIL_SALES_SINCO].sort(), ['1411', '1711', '4201', '4211']);
  assert.equal(RETAIL_SEGMENT, 'retail_apparel_personal');
});
