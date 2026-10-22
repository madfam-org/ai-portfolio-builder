/**
 * The public origin of a sign-in request, from the Host header only, allow-listed by AUTH_PUBLIC_HOSTS.
 *
 * Behind the tunnel the standalone server sees request URLs on its bind address (0.0.0.0:3000); Auth.js would
 * build its callback and sign-out URLs from that. So every Auth.js entry point runs on a request rebuilt onto
 * `https://<Host>`, and only when Host is an allowed sign-in host (voxa apps/web/src/lib/public-origin.ts, origin/main
 * 0b5cde0, simplified: cv routes by Host, so Host is the one header that decides). A request that carries an
 * X-Forwarded-Host different from Host is refused: Auth.js reads X-Forwarded-Host when it builds URLs, so a forged
 * one must never reach it.
 */
import { authPublicHosts } from './auth-env.ts';
import { hostname } from './routing.ts';

type Env = Readonly<Record<string, string | undefined>>;

export type PublicOrigin = { ok: true; origin: string; host: string } | { ok: false };

function rawHost(headers: Headers): string | null {
  const h = headers.get('host')?.trim().toLowerCase();
  return h ? h : null;
}

export function resolvePublicOrigin(headers: Headers, env: Env): PublicOrigin {
  const host = rawHost(headers);
  const name = hostname(host);
  if (!host || !name) return { ok: false };
  const forwarded = headers.get('x-forwarded-host')?.split(',')[0]?.trim().toLowerCase();
  if (forwarded && forwarded !== host) return { ok: false };
  if (!authPublicHosts(env).includes(name)) return { ok: false };
  const loopback = name === 'localhost' || name === '127.0.0.1' || name.endsWith('.localhost');
  // A real host is https at the edge (R73, HSTS): never trust a forwarded `http` for it (the Next.js server adds
  // `x-forwarded-proto: http` itself when the edge sent none). Loopback development hosts follow the header.
  const xfp = headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  const proto = !loopback ? 'https' : xfp === 'https' ? 'https' : 'http';
  return { ok: true, origin: `${proto}://${host}`, host };
}

/**
 * CSRF guard for cookie-authenticated, state-changing requests: `Origin` must be this allowed public origin's host
 * (browsers send Origin on every form and fetch POST); without Origin, `Sec-Fetch-Site: same-origin` is accepted.
 */
export function isSameOriginRequest(request: Request, env: Env): boolean {
  const resolved = resolvePublicOrigin(request.headers, env);
  if (!resolved.ok) return false;
  const origin = request.headers.get('origin');
  if (!origin) return request.headers.get('sec-fetch-site') === 'same-origin';
  if (origin === 'null') return false;
  try {
    return new URL(origin).host.toLowerCase() === resolved.host;
  } catch {
    return false;
  }
}

/** Only same-site absolute paths survive as a post-sign-in target; anything that could name a host becomes `/`. */
export function safeRedirectPath(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/';
  return raw === '/en' ? '/en' : '/';
}

export function jsonResponse(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });
}

export const notConfigured = (): Response => jsonResponse(503, { error: 'not_configured' });
