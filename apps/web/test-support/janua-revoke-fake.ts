/**
 * A local, SYNTHETIC stand-in for Janua's discovery document and RFC 7009 revocation endpoint, on one loopback port.
 * It answers the way Janua's `POST /api/v1/oauth/revoke` does (madfam-org/janua
 * apps/api/app/routers/v1/oauth_provider_userinfo.py): the client authenticates by HTTP Basic or form fields, a
 * confidential client must present its secret (401 `invalid_client` otherwise), and any authenticated request is a
 * 200 whether or not the token was live. Modes: `ok`, `unavailable` (503, as when Janua cannot store a revocation)
 * and `slow` (never answers until closed). It records every revocation request so tests can prove what cv sent.
 */
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

export const FAKE_JANUA_CLIENT_ID = 'cv-app-test';

export interface FakeRevokeRequest {
  authorization: string | undefined;
  contentType: string | undefined;
  form: Record<string, string>;
}

export interface FakeJanua {
  issuer: string;
  /** The client secret this fake accepts: random per start, never a literal in the repository. */
  clientSecret: string;
  mode: 'ok' | 'unavailable' | 'slow';
  revocations: FakeRevokeRequest[];
  /** Revoked refresh tokens (a set the tests read, standing in for Janua's revoked families). */
  revoked: Set<string>;
  close: () => Promise<void>;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function clientOf(req: IncomingMessage, form: Record<string, string>): { id?: string; presented?: string } {
  const header = req.headers.authorization ?? '';
  if (header.startsWith('Basic ')) {
    const [id, ...rest] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':');
    return { id, presented: rest.join(':') };
  }
  return { id: form['client_id'], presented: form['client_secret'] };
}

export async function startFakeJanua(): Promise<FakeJanua> {
  const fake: FakeJanua = { issuer: '', clientSecret: randomBytes(24).toString('hex'), mode: 'ok', revocations: [], revoked: new Set(), close: async () => undefined };
  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    if (req.method === 'GET' && path === '/.well-known/openid-configuration') {
      return json(res, 200, {
        issuer: fake.issuer,
        token_endpoint: `${fake.issuer}/api/v1/oauth/token`,
        end_session_endpoint: `${fake.issuer}/api/v1/oauth/logout`,
        revocation_endpoint: `${fake.issuer}/api/v1/oauth/revoke`,
      });
    }
    if (req.method === 'POST' && path === '/api/v1/oauth/revoke') {
      const body = await readBody(req);
      const form = Object.fromEntries(new URLSearchParams(body));
      fake.revocations.push({ authorization: req.headers.authorization, contentType: req.headers['content-type'], form });
      if (fake.mode === 'slow') return; // never answers; close() drops the connection
      if (fake.mode === 'unavailable') return json(res, 503, { detail: 'revocation unavailable' });
      const client = clientOf(req, form);
      if (client.id !== FAKE_JANUA_CLIENT_ID || client.presented !== fake.clientSecret) return json(res, 401, { detail: 'invalid_client' });
      if (!form.token) return json(res, 422, { detail: 'token required' });
      fake.revoked.add(form.token);
      return json(res, 200, { message: 'Token revoked' });
    }
    json(res, 404, { detail: 'not found' });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fake janua: no port');
  fake.issuer = `http://127.0.0.1:${address.port}`;
  fake.close = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return fake;
}
