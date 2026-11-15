/**
 * The tlacuilo machine-client settings (docs/DEPLOYMENT.md "Env contract"). Pure: takes the environment, reads nothing
 * at import, so `next build` runs without them.
 *
 * tlacuilo is the ecosystem's document-intelligence service (OCR and typed extraction; it keeps nothing). cv uses ONE
 * lane of it, `text_document`: a picture of a job posting in, its text lines out.
 *
 * DORMANT BY DEFAULT, like sign-in and the market benchmark: reading images is on only when TLACUILO_API_URL,
 * TLACUILO_CLIENT_ID and TLACUILO_CLIENT_SECRET are set. Otherwise `GET /api/v1/jobs/intake/ocr` answers
 * `{"enabled": false}`, the POST answers 503 `not_configured`, and the page keeps saying «aún no leemos imágenes».
 * A missing or broken tlacuilo never affects `/ready`.
 */
type Env = Readonly<Record<string, string | undefined>>;

export const TLACUILO_ENV_KEYS = ['TLACUILO_API_URL', 'TLACUILO_CLIENT_ID', 'TLACUILO_CLIENT_SECRET'] as const;
/** The one role this edge holds; tlacuilo reads it from the token's scope. */
export const TLACUILO_SCOPE = 'tlacuilo:extract';
/** The lane cv asks for (tlacuilo's `document_type`). */
export const TLACUILO_DOCUMENT_TYPE = 'text_document';
/** A person's job search is personal data: always the strictest label (tlacuilo then never leaves local engines). */
export const TLACUILO_SENSITIVITY = 'restricted';

export interface TlacuiloConfig {
  /** Origin of tlacuilo's API, without a trailing slash (in-cluster in production). */
  apiUrl: string;
  /** Janua's client-credentials token endpoint. */
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  /** Budget for one page, in milliseconds (OCR of a page takes seconds). */
  timeoutMs: number;
}

function value(env: Env, key: string): string | undefined {
  const raw = env[key]?.trim();
  return raw ? raw : undefined;
}

function parsed(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

/** https only, except plain http on a loopback host (local development and the tests' fake). */
function safeUrl(raw: string | undefined): string | null {
  const url = parsed(raw);
  if (!url) return null;
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return null;
  return raw!.replace(/\/+$/, '');
}

/**
 * The API address: as `safeUrl`, plus plain http to a Kubernetes Service name (`*.svc` or `*.svc.cluster.local`).
 * tlacuilo's API has no public hostname by design; inside the cluster the hop is covered by NetworkPolicy, and the
 * bearer token still authenticates every call.
 */
function apiUrl(raw: string | undefined): string | null {
  const safe = safeUrl(raw);
  if (safe) return safe;
  const url = parsed(raw);
  if (!url || url.protocol !== 'http:') return null;
  return /\.svc(\.cluster\.local)?$/.test(url.hostname) ? raw!.replace(/\/+$/, '') : null;
}

function tokenUrl(env: Env): string | null {
  const explicit = value(env, 'TLACUILO_TOKEN_URL');
  if (explicit) return safeUrl(explicit);
  const issuer = safeUrl(value(env, 'AUTH_JANUA_ISSUER'));
  return issuer ? `${issuer}/api/v1/oauth/token` : null;
}

/** Names (never values) of the tlacuilo settings still missing or invalid. */
export function missingTlacuiloEnv(env: Env): string[] {
  const missing: string[] = TLACUILO_ENV_KEYS.filter((key) => !value(env, key));
  if (value(env, 'TLACUILO_API_URL') && !apiUrl(value(env, 'TLACUILO_API_URL'))) missing.push('TLACUILO_API_URL (https, or http to a cluster Service)');
  if (!tokenUrl(env)) missing.push('TLACUILO_TOKEN_URL or AUTH_JANUA_ISSUER (https)');
  return missing;
}

export function tlacuiloConfig(env: Env): TlacuiloConfig | null {
  const api = apiUrl(value(env, 'TLACUILO_API_URL'));
  const token = tokenUrl(env);
  const clientId = value(env, 'TLACUILO_CLIENT_ID');
  const clientSecret = value(env, 'TLACUILO_CLIENT_SECRET');
  if (!api || !token || !clientId || !clientSecret) return null;
  const timeout = Number(value(env, 'TLACUILO_TIMEOUT_MS') ?? 45_000);
  return {
    apiUrl: api,
    tokenUrl: token,
    clientId,
    clientSecret,
    timeoutMs: Number.isInteger(timeout) && timeout >= 1000 && timeout <= 70_000 ? timeout : 45_000,
  };
}
