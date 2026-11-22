/**
 * Server-side Janua OIDC helpers for the web: discovery, refresh-token rotation (single flight), refresh-token
 * revocation at sign-out (RFC 7009) and the RP-initiated logout URL. Reference: voxa apps/web/src/lib/janua-oidc.ts (origin/main 0b5cde0, Apache-2.0).
 */
import type { JanuaClientConfig } from '../lib/auth-env.ts';

export interface JanuaEndpoints {
  tokenEndpoint: string;
  endSessionEndpoint: string;
  /** RFC 7009 token revocation (Janua: `POST /api/v1/oauth/revoke`). */
  revocationEndpoint: string;
}

const discoveryCache = new Map<string, Promise<JanuaEndpoints>>();

function fallbackEndpoints(issuer: string): JanuaEndpoints {
  return {
    tokenEndpoint: `${issuer}/api/v1/oauth/token`,
    endSessionEndpoint: `${issuer}/logout`,
    revocationEndpoint: `${issuer}/api/v1/oauth/revoke`,
  };
}

function httpUrl(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

/** Janua's discovery document (cached per issuer; documented defaults when it cannot be read). */
export function januaEndpoints(issuer: string, fetchImpl: typeof fetch = fetch): Promise<JanuaEndpoints> {
  let cached = discoveryCache.get(issuer);
  if (!cached) {
    cached = (async () => {
      const fallback = fallbackEndpoints(issuer);
      try {
        const res = await fetchImpl(`${issuer}/.well-known/openid-configuration`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
        if (!res.ok) throw new Error(`discovery ${res.status}`);
        const doc = (await res.json()) as Record<string, unknown>;
        return {
          tokenEndpoint: httpUrl(doc.token_endpoint, fallback.tokenEndpoint),
          endSessionEndpoint: httpUrl(doc.end_session_endpoint, fallback.endSessionEndpoint),
          revocationEndpoint: httpUrl(doc.revocation_endpoint, fallback.revocationEndpoint),
        };
      } catch {
        discoveryCache.delete(issuer);
        return fallback;
      }
    })();
    discoveryCache.set(issuer, cached);
  }
  return cached;
}

/** HTTP Basic client authentication, as at Janua's token endpoint (RFC 6749 §2.3.1). */
function clientBasicAuth(client: JanuaClientConfig): string {
  return `Basic ${btoa(`${encodeURIComponent(client.clientId)}:${encodeURIComponent(client.clientSecret)}`)}`;
}

export interface RefreshedTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch seconds. */
  expiresAt: number;
  idToken?: string;
}

/**
 * Janua rotates the refresh token on every use, and several requests from one browser can arrive at once with the
 * same refresh token: the exchange runs once per refresh token and its answer is remembered for a minute.
 */
const inflight = new Map<string, Promise<RefreshedTokens>>();
const recent = new Map<string, { at: number; tokens: RefreshedTokens }>();

export async function refreshJanuaTokens(refreshToken: string, client: JanuaClientConfig, fetchImpl: typeof fetch = fetch): Promise<RefreshedTokens> {
  const now = Date.now();
  for (const [key, entry] of recent) if (now - entry.at > 60_000) recent.delete(key);
  const hit = recent.get(refreshToken);
  if (hit) return hit.tokens;
  const running = inflight.get(refreshToken);
  if (running) return running;
  const run = (async () => {
    const { tokenEndpoint } = await januaEndpoints(client.issuer, fetchImpl);
    const res = await fetchImpl(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: clientBasicAuth(client),
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`refresh failed (${res.status})`);
    const body = (await res.json()) as Record<string, unknown>;
    const expiresIn = Number(body.expires_in);
    if (typeof body.access_token !== 'string' || !Number.isFinite(expiresIn) || expiresIn <= 0) throw new Error('refresh answer malformed');
    const tokens: RefreshedTokens = {
      accessToken: body.access_token,
      refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + Math.floor(expiresIn),
      idToken: typeof body.id_token === 'string' ? body.id_token : undefined,
    };
    recent.set(refreshToken, { at: Date.now(), tokens });
    return tokens;
  })();
  inflight.set(refreshToken, run);
  try {
    return await run;
  } finally {
    inflight.delete(refreshToken);
  }
}

/**
 * What a revocation attempt came to, the only thing sign-out logs (never the token): `revoked` (Janua answered 2xx;
 * RFC 7009 answers 200 whether or not the token was live), `no_token` (nothing to revoke, no request),
 * `http_<status>` (Janua refused, e.g. 401 `invalid_client`, 503 when it cannot store the revocation), `timeout`,
 * `unreachable`.
 */
export type RevocationOutcome = 'revoked' | 'no_token' | `http_${number}` | 'timeout' | 'unreachable';

/**
 * RFC 7009 revocation of a refresh token: `POST <revocation_endpoint>` with `token` and
 * `token_type_hint=refresh_token`, the client authenticated by HTTP Basic as at the token endpoint. Janua revokes the
 * token's whole rotation family, so every refresh token minted from it is refused too. Best effort: it never throws,
 * and gives up after `timeoutMs` (at most 3 s).
 */
export async function revokeJanuaRefreshToken(
  refreshToken: string | undefined,
  client: JanuaClientConfig,
  revocationEndpoint: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<RevocationOutcome> {
  if (!refreshToken) return 'no_token';
  const timeoutMs = Math.min(Math.max(opts.timeoutMs ?? REVOCATION_TIMEOUT_MS, 0), REVOCATION_TIMEOUT_MS);
  if (timeoutMs === 0) return 'timeout';
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const res = await (opts.fetchImpl ?? fetch)(revocationEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: clientBasicAuth(client) },
      body: new URLSearchParams({ token: refreshToken, token_type_hint: 'refresh_token' }),
      cache: 'no-store',
      redirect: 'error',
      signal,
    });
    await res.body?.cancel().catch(() => undefined);
    return res.ok ? 'revoked' : `http_${res.status}`;
  } catch {
    return signal.aborted ? 'timeout' : 'unreachable';
  }
}

export const REVOCATION_TIMEOUT_MS = 3000;

/** RP-initiated logout URL (top-level GET navigation: the only shape that lets Janua clear its own cookie). */
export function buildEndSessionUrl(input: { endSessionEndpoint: string; clientId: string; idToken?: string; postLogoutRedirectUri: string }): string {
  const url = new URL(input.endSessionEndpoint);
  url.searchParams.set('client_id', input.clientId);
  if (input.idToken) url.searchParams.set('id_token_hint', input.idToken);
  url.searchParams.set('post_logout_redirect_uri', input.postLogoutRedirectUri);
  return url.toString();
}
