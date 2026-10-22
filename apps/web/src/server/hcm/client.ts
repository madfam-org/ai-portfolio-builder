/**
 * cv's client for Symbiosis HCM's `GET /api/v1/market-benchmarks/` (public INEGI ENOE aggregates).
 *
 * - Token: Janua client credentials (client_secret_basic, scope hcm-benchmarks:read), cached in memory until 60 s
 *   before it expires; one request in flight at a time; a 401 from HCM drops it and retries once.
 * - Budget: every call is bounded by `timeoutMs` (AbortSignal.timeout).
 * - Circuit breaker: after FAILURE_THRESHOLD consecutive failures (network, timeout, 5xx, refused token) the client
 *   answers `unavailable` at once for OPEN_MS, then lets one probe through.
 * - Cache: answers are cached per (title, state) for CACHE_TTL_MS (the data changes once a quarter), at most
 *   CACHE_MAX entries. Never per person: the query carries no identity.
 * - Validation: HCM's answer is parsed with zod; an unexpected shape is `unavailable`, never shown.
 *
 * Sends ONLY the job title (or SINCO) and the ISO state code. Logs status codes only, never the query.
 */
import { z } from 'zod';
import { HCM_BENCHMARK_SCOPE, type HcmConfig } from './config.ts';

export const FAILURE_THRESHOLD = 3;
export const OPEN_MS = 30_000;
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const CACHE_MAX = 500;
const TOKEN_SKEW_MS = 60_000;

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const percentile = z.number().int().nonnegative().nullable();
const benchmarkSchema = z.object({
  status: z.enum(['ok', 'insufficient_data', 'occupation_unresolved', 'occupation_ambiguous', 'occupation_unknown']),
  data_kind: z.literal('public_official_aggregate'),
  occupation: z
    .object({
      sinco: z.string().regex(/^\d{4}$/),
      title: z.string().max(300),
      taxonomy: z.string().max(120),
      match: z.object({
        method: z.string().max(40).nullable(),
        confidence: z.number().min(0).max(1),
        matched_phrase: z.string().max(300).nullable(),
        ignored_terms: z.array(z.string().max(60)).max(20),
        alternatives: z.array(z.object({ sinco: z.string(), title: z.string().max(300), confidence: z.number() })).max(5),
      }),
    })
    .nullable(),
  candidates: z.array(z.object({ sinco: z.string(), title: z.string().max(300), confidence: z.number() })).max(5).optional(),
  geography: z.object({
    requested_state: z.string().nullable(),
    state: z.string().nullable(),
    scope: z.enum(['state', 'national']).nullable(),
    fallback_reason: z.string().max(60).nullable(),
    requested_state_n: z.number().int().nonnegative().nullable().optional(),
  }),
  income: z
    .object({
      currency: z.literal('MXN'),
      period: z.literal('month'),
      percentiles: z.object({ p10: percentile, p25: percentile, p50: percentile, p75: percentile, p90: percentile }),
      n: z.number().int().nonnegative(),
      weighted_population: z.number().int().nonnegative(),
      income_reporting_share: z.string().regex(/^[01]\.\d{3}$/).nullable(),
    })
    .nullable(),
  suppression: z.object({ reason: z.string().max(60), n: z.number().int().nonnegative(), minimum_n: z.number().int() }).nullable(),
  period: z.object({ label: z.string().regex(/^\d{4}-Q[1-4]$/), start: z.string(), end: z.string() }),
  source: z.object({
    name: z.string().max(200),
    dataset_id: z.string().max(120),
    url: z.string().url().startsWith('https://www.inegi.org.mx/'),
    program_url: z.string().url().startsWith('https://www.inegi.org.mx/'),
    licence_url: z.string().url(),
    retrieved_at: z.string(),
    citation: z.string().max(500),
  }),
  methodology: z.object({
    minimum_n: z.number().int(),
    tails_minimum_n: z.number().int(),
    notes: z.array(z.string().max(400)).max(10),
  }),
});
export type HcmBenchmark = z.infer<typeof benchmarkSchema>;

export interface BenchmarkQuery {
  title: string;
  /** ISO 3166-2:MX (MX-CMX), or null for the national figure. */
  state: string | null;
}

export type BenchmarkResult = { ok: true; benchmark: HcmBenchmark; cached: boolean } | { ok: false; reason: 'unavailable' | 'refused' | 'invalid' };

export interface HcmBenchmarkPort {
  benchmark(query: BenchmarkQuery): Promise<BenchmarkResult>;
}

class CallFailure extends Error {
  readonly kind: 'unavailable' | 'refused' | 'invalid' | 'unauthorized';
  constructor(kind: 'unavailable' | 'refused' | 'invalid' | 'unauthorized', detail: string) {
    super(detail);
    this.kind = kind;
  }
}

export function createHcmClient(config: HcmConfig, deps: { fetch?: Fetch; now?: () => number } = {}): HcmBenchmarkPort {
  const doFetch: Fetch = deps.fetch ?? ((input, init) => fetch(input, init));
  const now = deps.now ?? (() => Date.now());
  let token: { value: string; expiresAt: number } | null = null;
  let inflight: Promise<string> | null = null;
  let failures = 0;
  let openUntil = 0;
  const cache = new Map<string, { at: number; benchmark: HcmBenchmark }>();

  async function mintToken(): Promise<string> {
    const basic = Buffer.from(`${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`).toString('base64');
    let res: Response;
    try {
      res = await doFetch(config.tokenUrl, {
        method: 'POST',
        headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ grant_type: 'client_credentials', scope: HCM_BENCHMARK_SCOPE }).toString(),
        signal: AbortSignal.timeout(config.timeoutMs),
        redirect: 'error',
        cache: 'no-store',
      });
    } catch {
      throw new CallFailure('unavailable', 'token request failed');
    }
    if (!res.ok) throw new CallFailure(res.status >= 500 ? 'unavailable' : 'refused', `token ${res.status}`);
    const body = z.object({ access_token: z.string().min(20).max(8192), expires_in: z.number().int().positive().max(86_400) }).safeParse(await res.json().catch(() => null));
    if (!body.success) throw new CallFailure('invalid', 'token response shape');
    token = { value: body.data.access_token, expiresAt: now() + body.data.expires_in * 1000 };
    return token.value;
  }

  async function bearer(): Promise<string> {
    if (token && token.expiresAt - TOKEN_SKEW_MS > now()) return token.value;
    inflight ??= mintToken().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  async function call(query: BenchmarkQuery, retry: boolean): Promise<HcmBenchmark> {
    const params = new URLSearchParams({ title: query.title });
    if (query.state) params.set('state', query.state);
    let res: Response;
    try {
      res = await doFetch(`${config.apiUrl}/api/v1/market-benchmarks/?${params}`, {
        headers: { Authorization: `Bearer ${await bearer()}`, Accept: 'application/json', 'User-Agent': 'madfam-cv/1 (+https://cv.madfam.io)' },
        signal: AbortSignal.timeout(config.timeoutMs),
        redirect: 'error',
        cache: 'no-store',
      });
    } catch (err) {
      if (err instanceof CallFailure) throw err;
      throw new CallFailure('unavailable', 'benchmark request failed');
    }
    if (res.status === 401 && retry) {
      token = null;
      return call(query, false);
    }
    if (res.status === 401 || res.status === 403) throw new CallFailure('refused', `benchmark ${res.status}`);
    if (res.status === 400) throw new CallFailure('invalid', 'benchmark 400');
    if (!res.ok) throw new CallFailure('unavailable', `benchmark ${res.status}`);
    const parsed = benchmarkSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new CallFailure('invalid', 'benchmark response shape');
    return parsed.data;
  }

  return {
    async benchmark(query) {
      const key = `${query.title.toLowerCase()}\u0000${query.state ?? ''}`;
      const hit = cache.get(key);
      if (hit && now() - hit.at < CACHE_TTL_MS) return { ok: true, benchmark: hit.benchmark, cached: true };
      if (openUntil > now()) return { ok: false, reason: 'unavailable' };
      try {
        const benchmark = await call(query, true);
        failures = 0;
        if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
        cache.set(key, { at: now(), benchmark });
        return { ok: true, benchmark, cached: false };
      } catch (err) {
        const failure = err instanceof CallFailure ? err : new CallFailure('unavailable', 'unexpected');
        // An answer HCM refused for this query (400) says nothing about HCM's health.
        if (failure.kind !== 'invalid' || failure.message !== 'benchmark 400') {
          failures += 1;
          if (failures >= FAILURE_THRESHOLD) {
            openUntil = now() + OPEN_MS;
            failures = 0;
          }
        }
        console.error(`cv-api: hcm benchmark ${failure.kind} (${failure.message})`);
        return { ok: false, reason: failure.kind === 'unauthorized' ? 'refused' : failure.kind };
      }
    },
  };
}

const clients = new Map<string, HcmBenchmarkPort>();

/** One client per configuration (so the token and the cache survive across requests in a process). */
export function sharedHcmClient(config: HcmConfig): HcmBenchmarkPort {
  const key = `${config.apiUrl}|${config.tokenUrl}|${config.clientId}`;
  let client = clients.get(key);
  if (!client) {
    client = createHcmClient(config);
    clients.set(key, client);
  }
  return client;
}
