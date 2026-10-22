/**
 * Sign-in for cv-app.madfam.io: Auth.js v5 (next-auth 5.0.0-beta.32) with Janua as its OIDC provider
 * (authorization code + PKCE, state and nonce), JWT session strategy. Lane J §3.3; reference implementation voxa
 * apps/web/src/auth.ts (origin/main 0b5cde0).
 *
 * Why Auth.js and not @madfam/janua-next: that adapter lives only on MADFAM's private registry and this public
 * AGPL repository must install from public npm without credentials.
 *
 * - The session cookie is encrypted with AUTH_SECRET (this app's own secret, never the Janua client secret, R42),
 *   host-only on cv-app (Auth.js never gets a cookie `domain`), `__Host-` prefixed and Secure on https.
 * - It keeps Janua's access, refresh and id tokens server-side; page scripts see only `publicSession()`.
 * - DORMANT: without every AUTH_* value there is no provider, and every entry point answers 503 before it gets here
 *   (app/api/auth/[...nextauth]/route.ts, app/auth/*).
 */
import NextAuth, { type NextAuthConfig } from 'next-auth';
import type { OIDCConfig } from 'next-auth/providers';
import { JANUA_PROVIDER_ID, authCookies, authSecret, januaClientConfig, secureAuthCookies, verifierConfig, type JanuaClientConfig } from '@/lib/auth-env';
import { resolvePublicOrigin } from '@/lib/public-origin';
import { verifyAccessToken } from '@/server/janua';
import { refreshJanuaTokens } from '@/server/janua-oidc';
import { publicSession, refreshSessionTokenIfNeeded, sessionTokenFromSignIn, type CvSessionToken } from '@/server/session-token';
import { NextRequest } from 'next/server';

interface JanuaProfile {
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
}

function januaProvider(client: JanuaClientConfig): OIDCConfig<JanuaProfile> {
  return {
    id: JANUA_PROVIDER_ID,
    name: 'Janua',
    type: 'oidc',
    issuer: client.issuer,
    clientId: client.clientId,
    clientSecret: client.clientSecret,
    authorization: { params: { scope: 'openid email profile offline_access' } },
    checks: ['pkce', 'state', 'nonce'],
    profile(profile) {
      return { id: profile.sub, name: profile.name ?? profile.preferred_username ?? profile.email ?? null, email: profile.email ?? null };
    },
  };
}

/** Built per request: `next build` evaluates this module without secrets. */
export function buildAuthConfig(env: Record<string, string | undefined> = process.env): NextAuthConfig {
  const client = januaClientConfig(env);
  const verifier = verifierConfig(env);
  const verify = (token: string) => {
    if (!verifier) throw new Error('Janua is not configured');
    return verifyAccessToken(token, verifier);
  };
  return {
    secret: authSecret(env),
    // Only together with the AUTH_PUBLIC_HOSTS allow-list: every handler runs on a request rebuilt onto the
    // allow-listed public origin (withPublicOrigin below); trustHost alone never decides the origin.
    trustHost: true,
    useSecureCookies: secureAuthCookies(env),
    // `__Host-` session and sign-in flow cookies on https (lib/auth-env.ts authCookies): no sibling host can plant them.
    cookies: authCookies(env),
    providers: client ? [januaProvider(client)] : [],
    session: { strategy: 'jwt' },
    pages: { signIn: '/', error: '/' },
    callbacks: {
      async signIn({ account }) {
        if (!account?.access_token) return false;
        try {
          await verify(account.access_token);
          return true;
        } catch {
          return false;
        }
      },
      async jwt({ token, account, profile }) {
        if (account) {
          const built = await sessionTokenFromSignIn(account, { name: token.name ?? profile?.name ?? null, email: token.email ?? null }, verify);
          return built ? (built as typeof token) : null;
        }
        if (!client) return null;
        const next = await refreshSessionTokenIfNeeded(token as CvSessionToken, { refresh: (rt) => refreshJanuaTokens(rt, client), verify });
        return next ? (next as typeof token) : null;
      },
      session({ session, token }) {
        return publicSession(token as CvSessionToken, session.expires) as unknown as typeof session;
      },
    },
  };
}

const nextAuth = NextAuth(() => buildAuthConfig());

export const { signIn } = nextAuth;

type Handler = (request: NextRequest) => Promise<Response>;

/**
 * Auth.js handlers on the public origin. The standalone server hands route handlers a URL on its bind address
 * (0.0.0.0:3000); Auth.js would build callback and sign-out URLs from it. The request is rebuilt onto
 * `https://<allow-listed Host>` with the forwarded headers pinned to the same values; anything else is a 400.
 */
function withPublicOrigin(handler: Handler): Handler {
  return async (request) => {
    const resolved = resolvePublicOrigin(request.headers, process.env);
    if (!resolved.ok) return Response.json({ error: 'unknown_host' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    const current = new URL(request.url);
    const headers = new Headers(request.headers);
    headers.set('x-forwarded-host', resolved.host);
    headers.set('x-forwarded-proto', new URL(resolved.origin).protocol.replace(':', ''));
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
    const body = hasBody ? await request.arrayBuffer() : undefined;
    return handler(new NextRequest(new URL(`${current.pathname}${current.search}`, resolved.origin), { method: request.method, headers, body }));
  };
}

export const handlers = {
  GET: withPublicOrigin(nextAuth.handlers.GET),
  POST: withPublicOrigin(nextAuth.handlers.POST),
};
