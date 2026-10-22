/**
 * What cv keeps in its encrypted, httpOnly, host-only Auth.js session cookie, and the rules that build and refresh
 * it. Tokens stay on the server: `publicSession` is the only shape page scripts see. Reference: voxa
 * apps/web/src/lib/session-token.ts (origin/main 0b5cde0).
 */
import type { JWTPayload } from 'jose';
import type { RefreshedTokens } from './janua-oidc.ts';

export interface CvSessionToken {
  /** Janua subject: the owner key of every row. */
  sub?: string;
  name?: string | null;
  email?: string | null;
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  /** Access-token expiry, epoch seconds. */
  expiresAt?: number;
}

export interface CvPublicSession {
  user: { sub: string; name: string | null; email: string | null };
  expires: string;
}

export const REFRESH_MARGIN_SECONDS = 60;

export interface SignInAccount {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_at?: number;
  expires_in?: number;
}

export type VerifyAccessToken = (token: string) => Promise<JWTPayload>;

/** The session built at sign-in, or null (sign-in refused) when the access token is absent or does not verify. */
export async function sessionTokenFromSignIn(
  account: SignInAccount,
  profile: { name?: string | null; email?: string | null },
  verify: VerifyAccessToken,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<CvSessionToken | null> {
  if (typeof account.access_token !== 'string') return null;
  let claims: JWTPayload;
  try {
    claims = await verify(account.access_token);
  } catch {
    return null;
  }
  if (typeof claims.sub !== 'string' || !claims.sub) return null;
  const expiresAt =
    typeof account.expires_at === 'number' && account.expires_at > nowSeconds
      ? account.expires_at
      : typeof account.expires_in === 'number' && account.expires_in > 0
        ? nowSeconds + Math.floor(account.expires_in)
        : typeof claims.exp === 'number' && claims.exp > nowSeconds
          ? claims.exp
          : null;
  if (!expiresAt) return null;
  const email = typeof claims.email === 'string' ? claims.email : (profile.email ?? null);
  return {
    sub: claims.sub,
    name: profile.name ?? (typeof claims.name === 'string' ? claims.name : email),
    email,
    accessToken: account.access_token,
    refreshToken: account.refresh_token,
    idToken: account.id_token,
    expiresAt,
  };
}

/**
 * On every session read: unchanged while the access token has more than the margin left; otherwise rotated with
 * the refresh token. Null (Auth.js then clears the cookie) when it cannot continue, or when a refresh would change
 * the person the session belongs to.
 */
export async function refreshSessionTokenIfNeeded(
  token: CvSessionToken,
  deps: { refresh: (refreshToken: string) => Promise<RefreshedTokens>; verify: VerifyAccessToken; nowSeconds?: number },
): Promise<CvSessionToken | null> {
  const now = deps.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!token.accessToken || !token.sub || typeof token.expiresAt !== 'number') return null;
  if (token.expiresAt - REFRESH_MARGIN_SECONDS > now) return token;
  if (!token.refreshToken) return null;
  try {
    const refreshed = await deps.refresh(token.refreshToken);
    const claims = await deps.verify(refreshed.accessToken);
    if (claims.sub !== token.sub) return null;
    return {
      ...token,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      idToken: refreshed.idToken ?? token.idToken,
      expiresAt: refreshed.expiresAt,
    };
  } catch {
    return null;
  }
}

/** The page-visible session: identity for the UI, never a token. */
export function publicSession(token: CvSessionToken, expires: string): CvPublicSession {
  return { user: { sub: token.sub ?? '', name: token.name ?? null, email: token.email ?? null }, expires };
}
