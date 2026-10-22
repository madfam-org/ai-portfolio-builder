/** GET /api/v1/jobs/:id/benchmark (server/hcm/route.ts) over a fake repository and the SYNTHETIC fake HCM. */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { Repository } from '../src/server/db/repository.ts';
import { matchRoute } from '../src/lib/api-routes.ts';
import { createHcmClient, type HcmBenchmarkPort } from '../src/server/hcm/client.ts';
import { hcmConfig } from '../src/server/hcm/config.ts';
import { jobBenchmark, salaryPosition } from '../src/server/hcm/route.ts';
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
