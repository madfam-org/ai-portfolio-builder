/**
 * `GET /api/v1/jobs/:id/benchmark` — the market range for one of the owner's saved jobs, from Symbiosis HCM.
 *
 * Order: (handler: route, not configured, bearer) → the owner's job (404 for absent or another person's) → HCM not
 * configured (503 not_configured) → HCM (title + state only) → the DTO below. HCM down, slow, refused or answering an
 * unexpected shape: 503 `benchmark_unavailable` with Retry-After. Nothing about the person or their CV leaves cv.
 *
 * Every figure in the answer is HCM's (INEGI ENOE); cv adds only where the posting's own stated monthly MXN salary
 * falls between those published percentiles, and only when the posting states one.
 */
import type { Repository } from '../db/repository.ts';
import { hcmConfig } from './config.ts';
import { sharedHcmClient, type HcmBenchmark, type HcmBenchmarkPort } from './client.ts';
import { jobFacts, type StatedSalary } from './facts.ts';

type Env = Readonly<Record<string, string | undefined>>;

export type SalaryPosition = 'below_p10' | 'p10_p25' | 'p25_p50' | 'p50_p75' | 'p75_p90' | 'above_p90' | 'below_p25' | 'above_p75';

export interface BenchmarkView {
  jobId: string;
  status: HcmBenchmark['status'];
  query: { title: string; country: string | null; state: string | null; stateSource: 'job_field' | 'location_text' | null };
  occupation: HcmBenchmark['occupation'];
  candidates: NonNullable<HcmBenchmark['candidates']>;
  geography: HcmBenchmark['geography'];
  income: HcmBenchmark['income'];
  suppression: HcmBenchmark['suppression'];
  period: HcmBenchmark['period'];
  source: HcmBenchmark['source'];
  methodology: HcmBenchmark['methodology'];
  posting: { salary: StatedSalary | null; comparableMonthlyMxn: number | null; position: SalaryPosition | null };
}

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });

/** Where `value` falls among the published percentiles (null tails are skipped, never estimated). */
export function salaryPosition(value: number, p: NonNullable<HcmBenchmark['income']>['percentiles']): SalaryPosition | null {
  if (p.p25 === null || p.p50 === null || p.p75 === null) return null;
  if (value < p.p25) return p.p10 === null ? 'below_p25' : value < p.p10 ? 'below_p10' : 'p10_p25';
  if (value < p.p50) return 'p25_p50';
  if (value <= p.p75) return 'p50_p75';
  return p.p90 === null ? 'above_p75' : value <= p.p90 ? 'p75_p90' : 'above_p90';
}

export async function jobBenchmark(repo: Repository, sub: string, jobId: string, env: Env, port?: HcmBenchmarkPort): Promise<Response> {
  const job = await repo.getJob(sub, jobId);
  if (!job) return json(404, { error: 'not_found' });
  const config = hcmConfig(env);
  const client = port ?? (config ? sharedHcmClient(config) : null);
  if (!client) return json(503, { error: 'not_configured' });

  const facts = jobFacts(job as unknown as { title: string; location?: string | null } & Record<string, unknown>);
  if (facts.title.length < 2) return json(422, { error: 'title_too_short' });
  const result = await client.benchmark({ title: facts.title, state: facts.state });
  if (!result.ok) return json(503, { error: 'benchmark_unavailable' }, { 'Retry-After': '60' });

  const b = result.benchmark;
  const position = facts.comparableMonthlyMxn !== null && b.income ? salaryPosition(facts.comparableMonthlyMxn, b.income.percentiles) : null;
  const view: BenchmarkView = {
    jobId: job.id,
    status: b.status,
    query: { title: facts.title, country: facts.country, state: facts.state, stateSource: facts.stateSource },
    occupation: b.occupation,
    candidates: b.candidates ?? [],
    geography: b.geography,
    income: b.income,
    suppression: b.suppression,
    period: b.period,
    source: b.source,
    methodology: b.methodology,
    posting: { salary: facts.salary, comparableMonthlyMxn: facts.comparableMonthlyMxn, position },
  };
  return json(200, view);
}
