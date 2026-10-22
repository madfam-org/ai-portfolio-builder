/**
 * The cv-api route table, dependency-free so the proxy (lib/routing.ts) and the handler (server/api/handler.ts) share
 * ONE list of public paths. Unknown paths are null (404); ids that are not UUIDs are 404 too, never a database cast
 * error.
 */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Public artifact slug: 3-64 characters, a-z, 0-9 and inner hyphens (the pattern alone; see isAllowedSlug). */
export const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/;

/**
 * Slugs that would collide with routes, platform words or legal pages on whatever host serves public pages later
 * (W3 proposes a separate flat host; nothing here names it).
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'health', 'ready', 'l', 'api', 'app', 'admin', 'auth', 'p', 's', 'robots.txt', 'sitemap.xml', 'favicon.ico',
  '_next', 'static', 'assets', 'www', 'madfam', 'legal', 'privacy', 'terms',
  // W3 (lane X §0.2): Spanish words the public-pages host or its footer may route later.
  'entrar', 'salir', 'reportar', 'privacidad', 'terminos', 'soporte',
  // W4-O: the metrics path (served on the internal metrics port only; on the pages host it stays the HTML 404).
  'metrics',
]);

/** A slug an owner may claim: the pattern, not reserved, never starting with `_` or `.`. */
export function isAllowedSlug(slug: string): boolean {
  return SLUG.test(slug) && !RESERVED_SLUGS.has(slug) && !slug.startsWith('_') && !slug.startsWith('.');
}
/** Share token of a 'link' artifact: 32 random bytes, base64url (43 characters). */
export const SHARE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export type Route =
  | { kind: 'public-slug'; slug: string }
  | { kind: 'public-token'; token: string }
  | { kind: 'authed'; name: string; ids: string[]; methods: string[] };

const authed = (name: string, methods: string[], ids: string[] = []): Route => ({ kind: 'authed', name, ids, methods });

export function matchRoute(segments: readonly string[]): Route | null {
  const [a, b, c] = segments;
  const n = segments.length;
  const isId = (s: string | undefined): s is string => s !== undefined && UUID.test(s);
  if (a === 'public' && n === 3 && c !== undefined) {
    if (b === 'a' && isAllowedSlug(c)) return { kind: 'public-slug', slug: c };
    if (b === 's' && SHARE_TOKEN.test(c)) return { kind: 'public-token', token: c };
    return null;
  }
  if (a === 'me' && n === 1) return authed('me', ['GET', 'DELETE']);
  if (a === 'me' && n === 2 && b === 'export') return authed('me-export', ['GET']);
  if (a === 'profile') {
    if (n === 1) return authed('profile', ['GET', 'PUT']);
    if (b === 'items' && n === 2) return authed('items', ['GET', 'POST']);
    if (b === 'items' && n === 3 && c === 'reorder') return authed('items-reorder', ['POST']);
    if (b === 'items' && n === 3 && c === 'batch') return authed('items-batch', ['POST']);
    if (b === 'items' && n === 3 && isId(c)) return authed('item', ['GET', 'PATCH', 'DELETE'], [c]);
    return null;
  }
  if (a === 'jobs') {
    if (n === 1) return authed('jobs', ['GET', 'POST']);
    // W5-J: a preview of a job from a link, a text or a browser capture (nothing stored).
    if (n === 2 && b === 'intake') return authed('job-intake', ['POST']);
    if (n === 2 && isId(b)) return authed('job', ['GET', 'PATCH', 'DELETE'], [b]);
    if (n === 3 && isId(b) && c === 'match') return authed('job-match', ['GET'], [b]);
    return null;
  }
  if (a === 'artifacts') {
    if (n === 1) return authed('artifacts', ['GET', 'POST']);
    if (n === 2 && b === 'batch') return authed('artifacts-batch', ['POST']);
    if (n === 2 && isId(b)) return authed('artifact', ['GET', 'PATCH', 'DELETE'], [b]);
    if (n === 3 && isId(b) && (c === 'publish' || c === 'unpublish')) return authed(`artifact-${c}`, ['POST'], [b]);
    return null;
  }
  return null;
}

/** True for the `/api/v1/...` paths cv-api serves through the handler (everything but /api/v1/meta). */
export function isApiV1Path(path: string): boolean {
  if (!path.startsWith('/api/v1/')) return false;
  return matchRoute(path.slice('/api/v1/'.length).split('/')) !== null;
}
