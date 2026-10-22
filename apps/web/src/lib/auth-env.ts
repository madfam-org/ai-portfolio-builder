/**
 * The identity and data environment contract (docs/DEPLOYMENT.md). Pure: every function takes the environment,
 * so nothing is read at import (`next build` runs without secrets) and every rule is unit-tested.
 *
 * DORMANT BY DEFAULT. Sign-in is on only when ALL of AUTH_SECRET, AUTH_JANUA_ISSUER, AUTH_JANUA_CLIENT_ID and
 * AUTH_JANUA_CLIENT_SECRET are set; otherwise the app shell says sign-in is not available yet and /api/auth/*
 * answers 503 {"error":"not_configured"}. The API verifies tokens only when AUTH_JANUA_ISSUER is set, and reads
 * data only when a database URL is set; otherwise its routes answer 503 not_configured.
 *
 * Reference: voxa apps/web/src/lib/auth-env.ts (origin/main 0b5cde0), adapted to cv's names (lane J §3.2).
 */
import { loadConfig } from './config.ts';

type Env = Readonly<Record<string, string | undefined>>;

export const SIGN_IN_ENV_KEYS = ['AUTH_SECRET', 'AUTH_JANUA_ISSUER', 'AUTH_JANUA_CLIENT_ID', 'AUTH_JANUA_CLIENT_SECRET'] as const;
export type SignInEnvKey = (typeof SIGN_IN_ENV_KEYS)[number];

/** Auth.js provider id; the registered callback is https://cv-app.madfam.io/api/auth/callback/janua. */
export const JANUA_PROVIDER_ID = 'janua';
/** Audience of the Janua access tokens cv-api accepts (janua.client.yaml). */
export const DEFAULT_API_AUDIENCE = 'cv-api';
/** Where the browser lands after RP-initiated logout: the app origin root, which Janua admits (R44). */
export const POST_LOGOUT_PATH = '/';

function value(env: Env, key: string): string | undefined {
  const raw = env[key]?.trim();
  return raw ? raw : undefined;
}

/** Names (never values) of the sign-in settings that are still missing. */
export function missingSignInEnv(env: Env): SignInEnvKey[] {
  return SIGN_IN_ENV_KEYS.filter((key) => !value(env, key));
}

export function isSignInConfigured(env: Env): boolean {
  return missingSignInEnv(env).length === 0;
}

/** The issuer without a trailing slash, or null when unset or not an https (or loopback http) URL. */
export function januaIssuer(env: Env): string | null {
  const raw = value(env, 'AUTH_JANUA_ISSUER');
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return null;
    return raw.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export interface JanuaClientConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
}

export function januaClientConfig(env: Env): JanuaClientConfig | null {
  const issuer = januaIssuer(env);
  const clientId = value(env, 'AUTH_JANUA_CLIENT_ID');
  const clientSecret = value(env, 'AUTH_JANUA_CLIENT_SECRET');
  if (!issuer || !clientId || !clientSecret || !value(env, 'AUTH_SECRET')) return null;
  return { issuer, clientId, clientSecret };
}

export function authSecret(env: Env): string | undefined {
  return value(env, 'AUTH_SECRET');
}

export interface VerifierConfig {
  issuer: string;
  audience: string;
  jwksUrl: string;
}

/** What cv-api needs to verify a bearer token: the issuer (required) and its JWKS and audience (defaults). */
export function verifierConfig(env: Env): VerifierConfig | null {
  const issuer = januaIssuer(env);
  if (!issuer) return null;
  return {
    issuer,
    audience: value(env, 'CV_JANUA_AUDIENCE') ?? DEFAULT_API_AUDIENCE,
    jwksUrl: value(env, 'CV_JANUA_JWKS_URL') ?? `${issuer}/.well-known/jwks.json`,
  };
}

/**
 * The hosts sign-in answers on: AUTH_PUBLIC_HOSTS (comma-separated, exact host names) or, unset, the app host of
 * the host table. Never the landing or API host: their requests never carry the session cookie.
 */
export function authPublicHosts(env: Env): string[] {
  const raw = value(env, 'AUTH_PUBLIC_HOSTS');
  if (raw) {
    return [...new Set(raw.split(',').map((h) => h.trim().toLowerCase()).filter((h) => h !== ''))];
  }
  return [loadConfig(env).hosts.app];
}

function isLoopbackName(host: string): boolean {
  const name = host.replace(/:\d+$/, '');
  return name === 'localhost' || name === '127.0.0.1' || name.endsWith('.localhost');
}

/** `__Secure-` cookies whenever any sign-in host is a real (https) host; plain names only for local development. */
export function secureAuthCookies(env: Env): boolean {
  return !authPublicHosts(env).every(isLoopbackName);
}

/** Auth.js session cookie name (chunks append `.0`, `.1`, ...). Host-only: no Domain attribute, ever. */
export function sessionCookieName(env: Env): string {
  return secureAuthCookies(env) ? '__Secure-authjs.session-token' : 'authjs.session-token';
}

/**
 * Runtime database URL. Production uses APP_DATABASE_URL, the least-privilege `cv_app` role written by Enclii
 * onboarding; DATABASE_URL is the database OWNER and is for migrations only (the PreSync Job). Only in development
 * and test does the runtime fall back to DATABASE_URL.
 */
export function runtimeDatabaseUrl(env: Env): string | null {
  const app = value(env, 'APP_DATABASE_URL');
  if (app) return app;
  const dev = env.NODE_ENV === 'development' || env.NODE_ENV === 'test';
  return dev ? (value(env, 'DATABASE_URL') ?? null) : null;
}

/** Migration URL: DIRECT_DATABASE_URL when onboarding provides one, else DATABASE_URL (the owner role). */
export function migrationDatabaseUrl(env: Env): string | null {
  return value(env, 'DIRECT_DATABASE_URL') ?? value(env, 'DATABASE_URL') ?? null;
}

/** Pool size per process (default 3: two replicas inside the cv_app role's connection limit of 8). */
export function databasePoolMax(env: Env): number {
  const raw = value(env, 'DATABASE_POOL_MAX');
  if (raw === undefined) return 3;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 10) throw new Error(`DATABASE_POOL_MAX must be an integer 1-10 (got ${JSON.stringify(raw)})`);
  return n;
}
