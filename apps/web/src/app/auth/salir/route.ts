import { handlers } from '@/auth';
import { POST_LOGOUT_PATH, isSignInConfigured, januaClientConfig, sessionCookieName, secureAuthCookies } from '@/lib/auth-env';
import { isSameOriginRequest, jsonResponse, notConfigured, resolvePublicOrigin } from '@/lib/public-origin';
import { expireSessionCookies, parseCookieHeader } from '@/lib/session-cookies';
import { buildEndSessionUrl, januaEndpoints } from '@/server/janua-oidc';
import { readServerSession } from '@/server/server-session';

/**
 * `POST /auth/salir`, «Cerrar sesión» (R44, RP-initiated logout; voxa apps/web/src/lib/sign-out.ts):
 * POST only (GET 405: a link or an image can never sign anyone out), same-origin only (403). Expires the session
 * cookie and every chunk, then 303 to Janua's end_session_endpoint with client_id, id_token_hint and
 * post_logout_redirect_uri = https://cv-app.madfam.io/ (the origin root, which Janua admits). A top-level
 * navigation is the only shape that lets Janua clear its own estate-wide session.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const env = process.env;
  if (!isSignInConfigured(env)) return notConfigured();
  if (!isSameOriginRequest(request, env)) return jsonResponse(403, { error: 'cross_origin' });
  const origin = resolvePublicOrigin(request.headers, env);
  const client = januaClientConfig(env);
  if (!origin.ok || !client) return jsonResponse(400, { error: 'unknown_host' });
  const idToken = (await readServerSession(request, handlers.GET, env).catch(() => null))?.token?.idToken;
  const location = buildEndSessionUrl({
    endSessionEndpoint: (await januaEndpoints(client.issuer)).endSessionEndpoint,
    clientId: client.clientId,
    idToken,
    postLogoutRedirectUri: `${origin.origin}${POST_LOGOUT_PATH}`,
  });
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  for (const line of expireSessionCookies(parseCookieHeader(request.headers.get('cookie')), sessionCookieName(env), secureAuthCookies(env))) {
    headers.append('Set-Cookie', line);
  }
  return new Response(null, { status: 303, headers });
}

export function GET(): Response {
  return jsonResponse(405, { error: 'method_not_allowed' }, { Allow: 'POST' });
}
