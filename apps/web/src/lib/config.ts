/**
 * Runtime configuration, validated strictly. Everything here is plain environment (no secrets in wave 1).
 *
 * THE HOST TABLE is data: one row per public host. Adding a `cv-*` host later means one row here, one
 * route branch in routing.ts and one domain in enclii.yaml; nothing else names a host.
 */

export type Role = 'landing' | 'app' | 'api';

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
}

export const HOST_TABLE: readonly HostRow[] = [
  { role: 'landing', env: 'CV_HOST_LANDING', fallback: 'cv.madfam.io', kind: 'html', indexEligible: true },
  { role: 'app', env: 'CV_HOST_APP', fallback: 'cv-app.madfam.io', kind: 'html', indexEligible: false },
  { role: 'api', env: 'CV_HOST_API', fallback: 'cv-api.madfam.io', kind: 'json', indexEligible: false },
];

export interface Config {
  /** role -> exact lowercase hostname (no port). */
  readonly hosts: Readonly<Record<Role, string>>;
  /** host -> role, for exact-match lookup. */
  readonly byHost: ReadonlyMap<string, Role>;
  /** The landing may be indexed. Default false: noindex until the brand is ruled. */
  readonly indexable: boolean;
  /** Git commit the image was built from, or null when unset (local runs). */
  readonly revision: string | null;
  /** Development mode relaxes nothing but the CSP's eval for React's dev tooling. */
  readonly dev: boolean;
}

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

function readFlag(env: Env, name: string): boolean {
  const raw = env[name];
  if (raw === undefined || raw === '' || raw === 'false') return false;
  if (raw === 'true') return true;
  throw new ConfigError(`${name} must be "true" or "false" (got ${JSON.stringify(raw)})`);
}

/** Pure: builds and validates the configuration from an environment. Throws ConfigError on any defect. */
export function loadConfig(env: Env): Config {
  const hosts = {} as Record<Role, string>;
  const byHost = new Map<string, Role>();
  for (const row of HOST_TABLE) {
    const raw = env[row.env];
    const host = raw === undefined || raw === '' ? row.fallback : raw;
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
