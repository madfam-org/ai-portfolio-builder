/**
 * The labels a request is counted under: its host role and a ROUTE TEMPLATE, derived from the same routing decision
 * the proxy takes (lib/routing.ts `decide`), so the set of possible values is the route tables themselves:
 *
 *   probes        /health, /ready (on any Host; a pod-IP or unknown Host is host_role "none")
 *   landing       /, /en, /robots.txt, /sitemap.xml, /lector, /en/lector (W6-A)
 *   app           the app pages with `:id` for the UUID (/empleos/:id/adaptar, /en/documentos/:id, ...),
 *                 /auth/entrar, /auth/salir, /api/auth/*, the same-origin /api/v1 proxy
 *   api           /api/v1/meta and every /api/v1 route with `:id`, `:slug`, `:token` for its parameters
 *   pages         /:slug, /l/:token
 *   assets        /_next/*, /icon.svg
 *   anything else "unmatched" (every 404 of the router, whatever the path)
 *
 * Never a raw path, id, slug, share token or query string: a share token is a bearer secret and a slug names a
 * person's page. Pure; test/metrics-route.test.ts walks the tables.
 */
import { UUID, matchRoute } from '../lib/api-routes.ts';
import { APP_ROUTE_SEGMENTS, matchAppPath } from '../lib/app-routes.ts';
import type { Config } from '../lib/config.ts';
import { APP_PASS_PATHS, LANDING_PAGES, decide, type Decision } from '../lib/routing.ts';

export const UNMATCHED = 'unmatched';
/** host_role for a Host the host table does not know (kubelet probes on the pod IP, scanners, typos). */
export const NO_ROLE = 'none';

export interface RouteLabels {
  hostRole: string;
  route: string;
  /** Liveness/readiness probes and build assets: counted, but their successful requests are not logged. */
  quiet: boolean;
}

function pathOf(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  try {
    return new URL(rawUrl, 'http://cv.invalid').pathname;
  } catch {
    return null;
  }
}

function normalise(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/** `/api/v1/...` → its template, from the API route table (null when the table has no such route). */
export function apiTemplate(path: string): string | null {
  if (path === '/api/v1/meta') return path;
  if (!path.startsWith('/api/v1/')) return null;
  const segments = path.slice('/api/v1/'.length).split('/');
  const route = matchRoute(segments);
  if (!route) return null;
  if (route.kind === 'public-slug') return '/api/v1/public/a/:slug';
  if (route.kind === 'public-token') return '/api/v1/public/s/:token';
  // matchRoute accepted the shape, so every segment is a fixed word or a UUID.
  return `/api/v1/${segments.map((s) => (UUID.test(s) ? ':id' : s)).join('/')}`;
}

/** An app page → its template (`/en/empleos/:id/adaptar`), or null. */
export function appTemplate(path: string): string | null {
  const m = matchAppPath(path);
  if (!m) return null;
  const segments = APP_ROUTE_SEGMENTS[m.name];
  const body = segments.length ? `/${segments.join('/')}` : '';
  if (m.locale === 'en') return `/en${body}`;
  return body || '/';
}

function template(path: string, decision: Decision): string {
  switch (decision.kind) {
    case 'probe':
      return path;
    case 'asset':
      return path === '/icon.svg' ? '/icon.svg' : '/_next/*';
    case 'user-page':
      return decision.share === 'public' ? '/:slug' : '/l/:token';
    case 'not-found':
      return UNMATCHED;
    case 'rewrite':
    case 'pass': {
      if (path === '/robots.txt' || path === '/sitemap.xml' || APP_PASS_PATHS.has(path)) return path;
      if (path.startsWith('/api/auth/')) return '/api/auth/*';
      if (path.startsWith('/api/v1/')) return apiTemplate(path) ?? UNMATCHED;
      if (decision.role === 'app') return appTemplate(path) ?? UNMATCHED;
      if (decision.role === 'landing' && (path === '/' || path === '/en')) return path;
      if (decision.role === 'landing' && path in LANDING_PAGES) return path;
      return UNMATCHED;
    }
  }
}

/**
 * The labels for one request, from its Host header and request target. `config` is null when the configuration
 * failed to load (the server answers 500, /ready 503): such requests count as host_role "none".
 */
export function routeLabels(hostHeader: string | undefined, rawUrl: string | undefined, config: Config | null): RouteLabels {
  const raw = pathOf(rawUrl);
  if (raw === null || config === null) {
    const probe = raw !== null && (normalise(raw) === '/health' || normalise(raw) === '/ready');
    return { hostRole: NO_ROLE, route: probe ? normalise(raw!) : UNMATCHED, quiet: probe };
  }
  const decision = decide(hostHeader ?? null, raw, config);
  const path = normalise(raw);
  return {
    hostRole: decision.role ?? NO_ROLE,
    route: template(path, decision),
    quiet: decision.kind === 'probe' || decision.kind === 'asset',
  };
}
