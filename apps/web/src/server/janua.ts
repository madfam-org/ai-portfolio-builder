/**
 * Janua access-token verification for cv-api (lane J §3.5; voxa apps/api/src/lib/janua.ts and
 * apps/web/src/lib/janua-oidc.ts on origin/main 0b5cde0 are the reference).
 *
 * - RS256 only, against Janua's JWKS (remote, cached 10 minutes); HS256, `none` and every other alg: 401 (R42).
 * - Missing, unparseable, bad signature, wrong issuer, expired, no `sub`: 401. Wrong audience: 403.
 * - JWKS unreachable or unusable (cold cache): 503 with Retry-After. Never "anonymous allowed" (fail closed).
 * - No Janua call on the request path beyond the cached JWKS (R106). The owner key is the verified `sub` only.
 */
import { createRemoteJWKSet, decodeProtectedHeader, errors, jwtVerify, type JWTPayload } from 'jose';
import type { VerifierConfig } from '../lib/auth-env.ts';

type Jwks = ReturnType<typeof createRemoteJWKSet>;
const jwksCache = new Map<string, Jwks>();

function jwksFor(url: string): Jwks {
  let jwks = jwksCache.get(url);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url), { cacheMaxAge: 600_000, timeoutDuration: 3_000 });
    jwksCache.set(url, jwks);
  }
  return jwks;
}

export function resetJwksCacheForTests(): void {
  jwksCache.clear();
}

/** Verifies an access token; throws jose errors (callers classify them with `classify`). */
export async function verifyAccessToken(token: string, cfg: VerifierConfig): Promise<JWTPayload> {
  const header = decodeProtectedHeader(token);
  if (header.alg !== 'RS256') throw new errors.JOSEAlgNotAllowed(`alg ${String(header.alg)} is not allowed`);
  const { payload } = await jwtVerify(token, jwksFor(cfg.jwksUrl), {
    issuer: cfg.issuer,
    audience: cfg.audience,
    algorithms: ['RS256'],
    clockTolerance: 30,
  });
  if (typeof payload.sub !== 'string' || payload.sub === '') throw new errors.JWTClaimValidationFailed('missing sub', payload, 'sub');
  return payload;
}

export type AuthFailure = { ok: false; status: 401 | 403 | 503; error: 'missing_token' | 'invalid_token' | 'wrong_audience' | 'jwks_unavailable' };
export type AuthResult = { ok: true; sub: string; claims: JWTPayload } | AuthFailure;

const INVALID_TOKEN_CODES = new Set([
  'ERR_JWT_EXPIRED',
  'ERR_JWT_CLAIM_VALIDATION_FAILED',
  'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
  'ERR_JWS_INVALID',
  'ERR_JWT_INVALID',
  'ERR_JOSE_ALG_NOT_ALLOWED',
  'ERR_JOSE_NOT_SUPPORTED',
  'ERR_JWKS_NO_MATCHING_KEY',
  'ERR_JWKS_MULTIPLE_MATCHING_KEYS',
]);

/** Maps a verification error to the answer: the token's fault is 401/403, the JWKS's fault is 503. */
export function classify(err: unknown): AuthFailure {
  if (err instanceof errors.JWTClaimValidationFailed && err.claim === 'aud') return { ok: false, status: 403, error: 'wrong_audience' };
  if (err instanceof errors.JOSEError && INVALID_TOKEN_CODES.has(err.code)) return { ok: false, status: 401, error: 'invalid_token' };
  // decodeProtectedHeader rejects garbage with JWSInvalid (handled above) or a TypeError on non-strings.
  if (err instanceof TypeError && /Invalid Token|Compact JWS|must be a string/i.test(err.message)) {
    return { ok: false, status: 401, error: 'invalid_token' };
  }
  // JWKSTimeout, JWKSInvalid, a non-200 JWKS answer, a network failure: the issuer is unreachable, not the user.
  return { ok: false, status: 503, error: 'jwks_unavailable' };
}

export function bearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer[ ]+([A-Za-z0-9._~+/=-]+)$/.exec(authorization.trim());
  return match?.[1] ?? null;
}

export async function authenticate(authorization: string | null, cfg: VerifierConfig): Promise<AuthResult> {
  const token = bearerToken(authorization);
  if (!token) return { ok: false, status: 401, error: 'missing_token' };
  try {
    const claims = await verifyAccessToken(token, cfg);
    return { ok: true, sub: claims.sub as string, claims };
  } catch (err) {
    return classify(err);
  }
}

export function authFailureResponse(failure: AuthFailure): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (failure.status === 401) headers['WWW-Authenticate'] = `Bearer error="${failure.error === 'missing_token' ? 'invalid_request' : 'invalid_token'}"`;
  if (failure.status === 403) headers['WWW-Authenticate'] = 'Bearer error="insufficient_scope"';
  if (failure.status === 503) headers['Retry-After'] = '30';
  return new Response(JSON.stringify({ error: failure.error }), { status: failure.status, headers });
}
