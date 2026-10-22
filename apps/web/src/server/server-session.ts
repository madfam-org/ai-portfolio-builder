/**
 * Reads the signed-in session for a route handler (voxa apps/web/src/lib/server-session.ts, origin/main 0b5cde0).
 *
 * It runs Auth.js's own session endpoint for the request's cookies, so the same `jwt` callback runs everywhere
 * (refresh before expiry, sign-out when refresh fails). Auth.js answers with Set-Cookie (the re-encrypted session);
 * the caller appends those lines to its response, and the token is read from the cookies as they will be after it.
 * Calling `auth()` instead would drop that Set-Cookie and lose a rotated refresh token.
 */
import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { authSecret, isSignInConfigured, sessionCookieName, secureAuthCookies } from '../lib/auth-env.ts';
import { applySetCookies, parseCookieHeader, serializeCookieJar, sessionCookieNames } from '../lib/session-cookies.ts';
import type { CvSessionToken } from './session-token.ts';

export interface ServerSession {
  token: CvSessionToken | null;
  setCookies: string[];
}

const NONE: ServerSession = { token: null, setCookies: [] };

export async function readServerSession(request: Request, sessionHandler: (r: NextRequest) => Promise<Response>, env: Record<string, string | undefined> = process.env): Promise<ServerSession> {
  if (!isSignInConfigured(env)) return NONE;
  const cookieName = sessionCookieName(env);
  const jar = parseCookieHeader(request.headers.get('cookie'));
  if (sessionCookieNames(jar, cookieName).length === 0) return NONE;

  const headers = new Headers({ cookie: request.headers.get('cookie') ?? '' });
  for (const name of ['host', 'x-forwarded-proto']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  let response: Response;
  try {
    response = await sessionHandler(new NextRequest(new URL('/api/auth/session', request.url), { headers }));
  } catch {
    return NONE;
  }
  const setCookies = response.headers.getSetCookie().filter((l) => l.startsWith(`${cookieName}=`) || l.startsWith(`${cookieName}.`));
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok || !body) return { token: null, setCookies };
  const after = applySetCookies(jar, setCookies);
  const token = (await getToken({
    req: { headers: new Headers({ cookie: serializeCookieJar(after) }) },
    secret: authSecret(env)!,
    secureCookie: secureAuthCookies(env),
    cookieName,
    salt: cookieName,
  })) as CvSessionToken | null;
  if (!token?.accessToken || !token.sub) return { token: null, setCookies };
  return { token, setCookies };
}

/** Display-only read for server components: decrypts the cookie, never refreshes (a page cannot set cookies). */
export async function readSessionForDisplay(headers: Headers, env: Record<string, string | undefined> = process.env): Promise<{ sub: string; name: string | null; email: string | null } | null> {
  if (!isSignInConfigured(env)) return null;
  const cookieName = sessionCookieName(env);
  try {
    const token = (await getToken({ req: { headers }, secret: authSecret(env)!, secureCookie: secureAuthCookies(env), cookieName, salt: cookieName })) as CvSessionToken | null;
    return token?.sub ? { sub: token.sub, name: token.name ?? null, email: token.email ?? null } : null;
  } catch {
    return null;
  }
}

export function withSetCookies(response: Response, setCookies: string[]): Response {
  for (const line of setCookies) response.headers.append('Set-Cookie', line);
  return response;
}
