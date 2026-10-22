/**
 * Runtime configuration, validated strictly. Everything here is plain environment (no secrets in wave 1).
 *
 * THE HOST TABLE is data: one row per public host. Adding a `cv-*` host later means one row here, one
 * route branch in routing.ts and one domain in enclii.yaml; nothing else names a host.
 */

/** The three owner-named hosts, always served. */
export type CoreRole = 'landing' | 'app' | 'api';
/**
 * `pages`: the user-content host (public and link-shared artifacts, W3). Its label is NOT ruled yet (working label
 * `cv-p.madfam.io`), so the row is INERT until `CV_HOST_PAGES` names a host: no request is routed to it before then.
 */
export type Role = CoreRole | 'pages';

export interface HostRow {
  readonly role: Role;
  /** Environment variable that overrides the host. */
  readonly env: string;
  /** The owner-named production host (decided topology, 2026-10-22). */
  readonly fallback: string;
  /** HTML surfaces render pages and need /_next assets; the API answers JSON only. */
  readonly kind: 'html' | 'json';
  /** Only a public landing host may ever be indexed (and only when CV_INDEXABLE=true). */
  readonly indexEligible: boolean;
  /**
   * True: the row is routed only when its env variable is set (the fallback is the proposed label, never served by
   * default). False: the fallback is the owner-named production host.
   */
  readonly inertUntilSet: boolean;
}

export const HOST_TABLE: readonly HostRow[] = [
  { role: 'landing', env: 'CV_HOST_LANDING', fallback: 'cv.madfam.io', kind: 'html', indexEligible: true, inertUntilSet: false },
  { role: 'app', env: 'CV_HOST_APP', fallback: 'cv-app.madfam.io', kind: 'html', indexEligible: false, inertUntilSet: false },
  { role: 'api', env: 'CV_HOST_API', fallback: 'cv-api.madfam.io', kind: 'json', indexEligible: false, inertUntilSet: false },
  // Per-artifact indexing is decided per page (the owner's `indexable` choice), never by the role: see headers.ts.
  { role: 'pages', env: 'CV_HOST_PAGES', fallback: 'cv-p.madfam.io', kind: 'html', indexEligible: false, inertUntilSet: true },
];

export interface Config {
  /** role -> exact lowercase hostname (no port); `pages` is null while CV_HOST_PAGES is unset (inert). */
  readonly hosts: Readonly<Record<CoreRole, string> & { pages: string | null }>;
  /** host -> role, for exact-match lookup. */
  readonly byHost: ReadonlyMap<string, Role>;
  /** The landing may be indexed. Default false: noindex until the brand is ruled. */
  readonly indexable: boolean;
  /** Git commit the image was built from, or null when unset (local runs). */
  readonly revision: string | null;
  /** Development mode relaxes nothing but the CSP's eval for React's dev tooling. */
  readonly dev: boolean;
  /**
   * W6-A: the per-client token bucket on unauthenticated reads (the pages host and cv-api's public reads; see
   * server/read-limit.ts). `burst` requests at once, refilled at `perMinute`. Per process: with R replicas a client
   * gets at most R times this.
   */
  readonly readLimit: ReadLimit;
}

export interface ReadLimit {
  readonly burst: number;
  readonly perMinute: number;
}

/** Defaults: 60 at once, then one a second. A person reading pages never meets it; a scraper slows to 1/s per pod. */
export const DEFAULT_READ_LIMIT: ReadLimit = { burst: 60, perMinute: 60 };

type Env = Readonly<Record<string, string | undefined>>;

// A DNS name with at least two labels, lowercase, no port, no trailing dot.
const HOSTNAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const REVISION = /^[0-9a-f]{7,40}$/;

export class ConfigError extends Error {
  constructor(message: string) {
    super(`cv config: ${message}`);
    this.name = 'ConfigError';
  }
}

function readCount(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n < 1 || n > 100_000) {
    throw new ConfigError(`${name} must be a whole number from 1 to 100000 (got ${JSON.stringify(raw)})`);
  }
  return n;
}

function readFlag(env: Env, name: string): boolean {
  const raw = env[name];
  if (raw === undefined || raw === '' || raw === 'false') return false;
  if (raw === 'true') return true;
  throw new ConfigError(`${name} must be "true" or "false" (got ${JSON.stringify(raw)})`);
}

/** Pure: builds and validates the configuration from an environment. Throws ConfigError on any defect. */
export function loadConfig(env: Env): Config {
  const hosts = { pages: null } as Record<CoreRole, string> & { pages: string | null };
  const byHost = new Map<string, Role>();
  for (const row of HOST_TABLE) {
    const raw = env[row.env];
    const unset = raw === undefined || raw === '';
    if (unset && row.inertUntilSet) continue;
    const host = unset ? row.fallback : raw;
    if (!HOSTNAME.test(host)) {
      throw new ConfigError(`${row.env} must be an exact lowercase hostname without a port (got ${JSON.stringify(host)})`);
    }
    if (byHost.has(host)) {
      throw new ConfigError(`${row.env} repeats host ${host}; every role needs its own host`);
    }
    hosts[row.role] = host;
    byHost.set(host, row.role);
  }
  const rev = env.CV_REVISION;
  if (rev !== undefined && rev !== '' && !REVISION.test(rev)) {
    throw new ConfigError(`CV_REVISION must be a 7-40 character lowercase hex commit (got ${JSON.stringify(rev)})`);
  }
  return {
    hosts,
    byHost,
    indexable: readFlag(env, 'CV_INDEXABLE'),
    revision: rev ? rev : null,
    dev: env.NODE_ENV === 'development',
    readLimit: {
      burst: readCount(env, 'CV_READ_LIMIT_BURST', DEFAULT_READ_LIMIT.burst),
      perMinute: readCount(env, 'CV_READ_LIMIT_PER_MINUTE', DEFAULT_READ_LIMIT.perMinute),
    },
  };
}

let cached: Config | undefined;

/** The process configuration, loaded once. Throws (fail visible) when the environment is invalid. */
export function getConfig(): Config {
  if (!cached) cached = loadConfig(process.env);
  return cached;
}

export function hostRow(role: Role): HostRow {
  const row = HOST_TABLE.find((r) => r.role === role);
  if (!row) throw new ConfigError(`no host row for role ${role}`);
  return row;
}
