/**
 * `POST /auth/salir`, «Cerrar sesión» (R44, RP-initiated logout; voxa apps/web/src/lib/sign-out.ts), as a function the
 * route calls and the unit tests drive with a fake Janua.
 *
 * POST only (the route answers GET with 405: a link or an image can never sign anyone out), same-origin only (403).
 * Before redirecting it revokes the session's Janua refresh token (RFC 7009, `revokeJanuaRefreshToken`): the session
 * cookie is stateless and carries that token, so without this a copy of the cookie taken before sign-out would keep
 * refreshing until it had been idle 7 days. Revocation is best effort inside one budget of at most 3 s that also
 * covers reading the discovery document: a Janua failure or delay never blocks sign-out. Only the outcome code is
 * logged, never the token. Then it expires the session cookie and every chunk and answers 303 to Janua's
 * end_session_endpoint with client_id, id_token_hint and post_logout_redirect_uri = the origin root (which Janua
 * admits). A top-level navigation is the only shape that lets Janua clear its own estate-wide session.
 */
import { POST_LOGOUT_PATH, isSignInConfigured, januaClientConfig, sessionCookieName, secureAuthCookies } from '../lib/auth-env.ts';
import { isSameOriginRequest, jsonResponse, notConfigured, resolvePublicOrigin } from '../lib/public-origin.ts';
import { expireSessionCookies, parseCookieHeader } from '../lib/session-cookies.ts';
import { REVOCATION_TIMEOUT_MS, buildEndSessionUrl, januaEndpoints, revokeJanuaRefreshToken } from './janua-oidc.ts';
import type { CvSessionToken } from './session-token.ts';

type Env = Record<string, string | undefined>;

export interface SignOutDeps {
  /** The signed-in session as the rest of the app reads it (`readServerSession`), or null. */
  readSession: (request: Request) => Promise<{ token: CvSessionToken | null } | null>;
  fetchImpl?: typeof fetch;
  log?: (line: Record<string, unknown>) => void;
  /** Revocation budget, discovery included (ms; capped at 3000). */
  revokeBudgetMs?: number;
}

const defaultLog = (line: Record<string, unknown>) => console.warn(JSON.stringify(line));

export async function signOut(request: Request, env: Env, deps: SignOutDeps): Promise<Response> {
  if (!isSignInConfigured(env)) return notConfigured();
  if (!isSameOriginRequest(request, env)) return jsonResponse(403, { error: 'cross_origin' });
  const origin = resolvePublicOrigin(request.headers, env);
  const client = januaClientConfig(env);
  if (!origin.ok || !client) return jsonResponse(400, { error: 'unknown_host' });

  const token = (await deps.readSession(request).catch(() => null))?.token ?? null;
  const started = Date.now();
  const budget = Math.min(deps.revokeBudgetMs ?? REVOCATION_TIMEOUT_MS, REVOCATION_TIMEOUT_MS);
  const endpoints = await januaEndpoints(client.issuer, deps.fetchImpl);
  const revoke = await revokeJanuaRefreshToken(token?.refreshToken, client, endpoints.revocationEndpoint, {
    fetchImpl: deps.fetchImpl,
    timeoutMs: budget - (Date.now() - started),
  });
  if (revoke !== 'no_token') (deps.log ?? defaultLog)({ evt: 'cv-signout', revoke, ms: Date.now() - started });

  const location = buildEndSessionUrl({
    endSessionEndpoint: endpoints.endSessionEndpoint,
    clientId: client.clientId,
    idToken: token?.idToken,
    postLogoutRedirectUri: `${origin.origin}${POST_LOGOUT_PATH}`,
  });
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  for (const line of expireSessionCookies(parseCookieHeader(request.headers.get('cookie')), sessionCookieName(env), secureAuthCookies(env))) {
    headers.append('Set-Cookie', line);
  }
  return new Response(null, { status: 303, headers });
}
