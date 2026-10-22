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

export interface TestIssuer {
  config: VerifierConfig;
  /** Env that points cv at this issuer (AUTH_JANUA_ISSUER, CV_JANUA_JWKS_URL). */
  env: Record<string, string>;
  token(claims?: Record<string, unknown>, opts?: { audience?: string; issuer?: string; expiresIn?: string }): Promise<string>;
  /** A token signed by a key the JWKS does not publish. */
  foreignToken(sub: string): Promise<string>;
  /** An HS256 token (any secret): must always be refused. */
  hs256Token(sub: string, secret?: string): Promise<string>;
  close(): Promise<void>;
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
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer(opts.issuer ?? TEST_ISSUER)
      .setAudience(opts.audience ?? TEST_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(opts.expiresIn ?? '5m')
      .sign(key);
  return {
    config: { issuer: TEST_ISSUER, audience: TEST_AUDIENCE, jwksUrl },
    env: { AUTH_JANUA_ISSUER: TEST_ISSUER, CV_JANUA_JWKS_URL: jwksUrl },
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
