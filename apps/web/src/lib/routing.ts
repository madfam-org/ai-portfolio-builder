/**
 * Host routing, as a pure decision over (Host header, path, config). src/proxy.ts is a thin adapter
 * around `decide`; every rule below is unit-tested in test/routing.test.ts.
 *
 * Order matters:
 *   1. /health and /ready answer on ANY Host (kubelet probes arrive with the pod IP as Host).
 *   2. The Host must match the host table exactly (lowercase, port stripped); anything else is a plain 404.
 *   3. Each role exposes an explicit allowlist of public paths, rewritten to internal routes under /h/.
 *      Internal paths are never public: a direct request for /h/... is not in any allowlist, so it 404s.
 */
import { isApiV1Path } from './api-routes.ts';
import type { Config, Role } from './config.ts';

export type Locale = 'es' | 'en';

export type Decision =
  /** Probe route: served as-is on any host. */
  | { kind: 'probe'; role: Role | null }
  /** A real route served as-is, on its own host only (Auth.js, sign-in/out, the same-origin API proxy on cv-app). */
  | { kind: 'pass'; role: Role }
  /** Next.js build assets (/_next/...) and the icon, on HTML hosts only. */
  | { kind: 'asset'; role: Role }
  /** Rewrite to an internal route. `html` pages get a nonce CSP; `locale` sets <html lang>. */
  | { kind: 'rewrite'; role: Role; to: string; html: boolean; locale: Locale | null }
  /** 404. `format` follows the host: plain text for unknown hosts, JSON on the API, a page on HTML hosts. */
  | { kind: 'not-found'; role: Role | null; format: 'text' | 'json' | 'html' };

/** The sign-in (account switching) and sign-out form targets on the app host. */
export const APP_PASS_PATHS: ReadonlySet<string> = new Set(['/auth/entrar', '/auth/salir']);

export const PROBE_PATHS: ReadonlySet<string> = new Set(['/health', '/ready']);

/** Internal route of the HTML 404 page (a path no route serves, so Next renders app/not-found.tsx). */
export const NOT_FOUND_ROUTE = '/h/not-found';

/**
 * Normalise a Host header to a bare lowercase hostname: drop the port, and the brackets of an IPv6
 * literal. Returns null for an absent or empty header.
 */
export function hostname(header: string | null | undefined): string | null {
  if (!header) return null;
  let h = header.trim().toLowerCase();
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    return end > 1 ? h.slice(1, end) : null;
  }
  const colon = h.indexOf(':');
  if (colon !== -1) h = h.slice(0, colon);
  return h === '' ? null : h;
}

/** One trailing slash is tolerated on any path but the root (`/en/` is `/en`). */
function normalisePath(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

function htmlPages(role: 'landing' | 'app', path: string): Decision | null {
  if (path === '/') return { kind: 'rewrite', role, to: `/h/${role}/es`, html: true, locale: 'es' };
  if (path === '/en') return { kind: 'rewrite', role, to: `/h/${role}/en`, html: true, locale: 'en' };
  return null;
}

function isAsset(path: string): boolean {
  return path.startsWith('/_next/') || path === '/icon.svg';
}

export function decide(hostHeader: string | null | undefined, rawPath: string, config: Config): Decision {
  const path = normalisePath(rawPath);
  const host = hostname(hostHeader);
  const role = host === null ? null : (config.byHost.get(host) ?? null);

  if (PROBE_PATHS.has(path)) return { kind: 'probe', role };
  if (role === null) return { kind: 'not-found', role: null, format: 'text' };

  const robots: Decision = { kind: 'rewrite', role, to: `/h/robots/${role}`, html: false, locale: null };

  switch (role) {
    case 'landing': {
      const page = htmlPages(role, path);
      if (page) return page;
      if (isAsset(rawPath)) return { kind: 'asset', role };
      if (path === '/robots.txt') return robots;
      // A sitemap only exists while the landing may be indexed: listing noindex URLs sends crawlers
      // two contradictory signals.
      if (path === '/sitemap.xml' && config.indexable) {
        return { kind: 'rewrite', role, to: '/h/sitemap', html: false, locale: null };
      }
      return { kind: 'not-found', role, format: 'html' };
    }
    case 'app': {
      const page = htmlPages(role, path);
      if (page) return page;
      // Sign-in lives on this host ONLY (the session cookie is host-only here): Auth.js (/api/auth/*, callback
      // /api/auth/callback/janua), the sign-in and sign-out forms, and the same-origin API proxy. On the landing and
      // API hosts these paths are 404s. Each route answers 503 not_configured while its settings are absent.
      if (APP_PASS_PATHS.has(path) || rawPath.startsWith('/api/auth/') || isApiV1Path(path)) return { kind: 'pass', role };
      if (isAsset(rawPath)) return { kind: 'asset', role };
      if (path === '/robots.txt') return robots;
      return { kind: 'not-found', role, format: 'html' };
    }
    case 'api': {
      if (path === '/api/v1/meta') return { kind: 'rewrite', role, to: '/h/api/v1/meta', html: false, locale: null };
      if (isApiV1Path(path)) return { kind: 'rewrite', role, to: `/h${path}`, html: false, locale: null };
      if (path === '/robots.txt') return robots;
      return { kind: 'not-found', role, format: 'json' };
    }
  }
}
