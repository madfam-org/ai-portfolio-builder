/**
 * Real RS256 Janua-style tokens for tests: a local RSA key, its JWKS served from an in-process HTTP server on an
 * OS-assigned loopback port (voxa apps/api/src/test-support/janua-tokens.ts pattern, origin/main 0b5cde0).
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import type { VerifierConfig } from '../src/lib/auth-env.ts';

export const TEST_ISSUER = 'https://issuer.test';
export const TEST_AUDIENCE = 'cv-api';
/** The client the test issuer stamps on its tokens (`client_id`), accepted through `env.CV_JANUA_CLIENT_IDS`. */
export const TEST_CLIENT_ID = 'cv-web-test';

export interface TestIssuer {
  config: VerifierConfig;
  /** Env that points cv at this issuer (AUTH_JANUA_ISSUER, CV_JANUA_JWKS_URL) and accepts its client (CV_JANUA_CLIENT_IDS). */
  env: Record<string, string>;
  /** `client_id` defaults to TEST_CLIENT_ID; pass `client_id: undefined` to leave it out. */
  token(claims?: Record<string, unknown>, opts?: { audience?: string; issuer?: string; expiresIn?: string }): Promise<string>;
  /** A token signed by a key the JWKS does not publish. */
  foreignToken(sub: string): Promise<string>;
  /** An HS256 token (any secret): must always be refused. */
  hs256Token(sub: string, secret?: string): Promise<string>;
  close(): Promise<void>;
}

/** Janua stamps the requesting client's id on every access token; tests do the same unless they say otherwise. */
function withClient(claims: Record<string, unknown>): Record<string, unknown> {
  if (!Object.hasOwn(claims, 'client_id')) return { client_id: TEST_CLIENT_ID, ...claims };
  if (claims.client_id !== undefined) return claims;
  const { client_id: _omitted, ...rest } = claims;
  return rest;
}

export async function startTestIssuer(): Promise<TestIssuer> {
  const keys = await generateKeyPair('RS256', { extractable: true });
  const other = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...(await exportJWK(keys.publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const jwksUrl = `http://127.0.0.1:${port}/.well-known/jwks.json`;
  const sign = (claims: Record<string, unknown>, key: CryptoKey, kid: string, opts: { audience?: string; issuer?: string; expiresIn?: string } = {}) =>
    new SignJWT(withClient(claims))
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer(opts.issuer ?? TEST_ISSUER)
      .setAudience(opts.audience ?? TEST_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(opts.expiresIn ?? '5m')
      .sign(key);
  return {
    config: { issuer: TEST_ISSUER, audience: TEST_AUDIENCE, jwksUrl, clientIds: [TEST_CLIENT_ID] },
    env: { AUTH_JANUA_ISSUER: TEST_ISSUER, CV_JANUA_JWKS_URL: jwksUrl, CV_JANUA_CLIENT_IDS: TEST_CLIENT_ID },
    token: (claims = { sub: 'user-a' }, opts) => sign(claims, keys.privateKey, 'test-key', opts),
    foreignToken: (sub) => sign({ sub }, other.privateKey, 'test-key'),
    hs256Token: (sub, secret = 'x'.repeat(32)) =>
      new SignJWT({ sub })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer(TEST_ISSUER)
        .setAudience(TEST_AUDIENCE)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(new TextEncoder().encode(secret)),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}
