/**
 * The Symbiosis HCM machine-client settings (docs/DEPLOYMENT.md "Env contract"). Pure: takes the environment, reads
 * nothing at import, so `next build` runs without them.
 *
 * DORMANT BY DEFAULT, like sign-in: the market benchmark is on only when HCM_API_URL, HCM_CLIENT_ID and
 * HCM_CLIENT_SECRET are set (the pair comes from the ExternalSecret cv-hcm-client). Otherwise
 * `GET /api/v1/jobs/:id/benchmark` answers 503 {"error":"not_configured"} and the job page says the comparison is not
 * available yet. A missing or broken HCM never affects `/ready`: the benchmark is an optional panel, not a dependency
 * of the product.
 */
type Env = Readonly<Record<string, string | undefined>>;

export const HCM_ENV_KEYS = ['HCM_API_URL', 'HCM_CLIENT_ID', 'HCM_CLIENT_SECRET'] as const;
/** The one scope this edge holds (enclii ecosystem-oidc platform cv-hcm-benchmarks). */
export const HCM_BENCHMARK_SCOPE = 'hcm-benchmarks:read';

export interface HcmConfig {
  /** Origin of the HCM API, without a trailing slash (production: https://hcm-api.madfam.io). */
  apiUrl: string;
  /** Janua's client-credentials token endpoint. */
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  /** Per-request budget in milliseconds (token and benchmark calls alike). */
  timeoutMs: number;
}

function value(env: Env, key: string): string | undefined {
  const raw = env[key]?.trim();
  return raw ? raw : undefined;
}

/** https only, except plain http on a loopback host (local development and the e2e fake HCM). */
function safeUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return raw.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/** Names (never values) of the HCM settings still missing or invalid. */
export function missingHcmEnv(env: Env): string[] {
  const missing: string[] = HCM_ENV_KEYS.filter((key) => !value(env, key));
  if (value(env, 'HCM_API_URL') && !safeUrl(value(env, 'HCM_API_URL'))) missing.push('HCM_API_URL (https)');
  if (!tokenUrl(env)) missing.push('HCM_TOKEN_URL or AUTH_JANUA_ISSUER (https)');
  return missing;
}

function tokenUrl(env: Env): string | null {
  const explicit = value(env, 'HCM_TOKEN_URL');
  if (explicit) return safeUrl(explicit);
  const issuer = safeUrl(value(env, 'AUTH_JANUA_ISSUER'));
  return issuer ? `${issuer}/api/v1/oauth/token` : null;
}

export function hcmConfig(env: Env): HcmConfig | null {
  const apiUrl = safeUrl(value(env, 'HCM_API_URL'));
  const token = tokenUrl(env);
  const clientId = value(env, 'HCM_CLIENT_ID');
  const clientSecret = value(env, 'HCM_CLIENT_SECRET');
  if (!apiUrl || !token || !clientId || !clientSecret) return null;
  const timeout = Number(value(env, 'HCM_TIMEOUT_MS') ?? 3000);
  return {
    apiUrl,
    tokenUrl: token,
    clientId,
    clientSecret,
    timeoutMs: Number.isInteger(timeout) && timeout >= 200 && timeout <= 10_000 ? timeout : 3000,
  };
}
