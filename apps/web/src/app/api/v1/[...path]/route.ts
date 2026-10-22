import { handlers } from '@/auth';
import { isSignInConfigured } from '@/lib/auth-env';
import { isSameOriginRequest, jsonResponse, notConfigured } from '@/lib/public-origin';
import { getSharedDb } from '@/server/db/client';
import { handleApi } from '@/server/api/handler';
import { readServerSession, withSetCookies } from '@/server/server-session';

/**
 * cv-app.madfam.io/api/v1/*: the same-origin proxy (lane J §3.6). The browser sends its host-only session cookie;
 * this route reads the session on the server (refreshing it when due) and calls the cv-api handler IN PROCESS with
 * `Authorization: Bearer <the user's Janua access token>`.
 *
 * Why in-process: one container serves both hosts, so a network hop (out through the tunnel and back) would add
 * latency, a failure mode and a CORS policy, and buy nothing. The API handler still verifies the bearer exactly as
 * it does on cv-api.madfam.io (RS256, issuer, audience cv-api), so the API's rule is the only access rule. When the
 * API becomes its own Service, this call becomes a fetch to that Service URL with the same headers.
 * The access token never reaches page scripts; no CORS, no credentials across origins.
 */
export const dynamic = 'force-dynamic';

const SAFE = new Set(['GET', 'HEAD']);

async function handle(request: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const env = process.env;
  if (!isSignInConfigured(env)) return notConfigured();
  if (!SAFE.has(request.method) && !isSameOriginRequest(request, env)) return jsonResponse(403, { error: 'cross_origin' });
  const { path } = await ctx.params;
  const session = await readServerSession(request, handlers.GET, env);
  if (!session.token?.accessToken) return withSetCookies(jsonResponse(401, { error: 'not_signed_in' }), session.setCookies);
  const headers = new Headers({ Authorization: `Bearer ${session.token.accessToken}` });
  const type = request.headers.get('content-type');
  if (type) headers.set('Content-Type', type);
  const body = SAFE.has(request.method) ? undefined : await request.text();
  const inner = new Request(request.url, { method: request.method, headers, body });
  const res = await handleApi(inner, path, { env, getDb: () => getSharedDb(env) });
  res.headers.set('Cache-Control', 'private, no-store');
  return withSetCookies(res, session.setCookies);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
