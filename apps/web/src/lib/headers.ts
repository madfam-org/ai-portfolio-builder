/**
 * Response headers, as pure functions of the decision and the configuration (src/proxy.ts applies them).
 *
 * CSP: HTML pages get a per-request nonce with 'strict-dynamic' (Next.js stamps the nonce on its own
 * scripts when it finds the policy on the request). Production never carries 'unsafe-inline' or
 * 'unsafe-eval' for scripts; development adds only 'unsafe-eval', which React's dev tooling needs.
 * Every other response (JSON, text, assets) gets a locked-down policy.
 */
import type { Config, Role } from './config.ts';
import { hostRow } from './config.ts';

/**
 * `formAction`: the targets this page's forms may post to, redirects included (browsers apply form-action to the
 * redirect chain). The landing has no form ('none'); the app posts to itself and is redirected to Janua.
 */
export function htmlCsp(nonce: string, dev: boolean, formAction: readonly string[] = []): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action ${formAction.length ? formAction.join(' ') : "'none'"}`,
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * The pages host (user content, lane X §4.5): stricter than the app. Nothing but this origin's own build assets;
 * no form may post anywhere; no base URL; every user string renders as React text (no inline style, no raw HTML).
 */
export function pagesCsp(nonce: string, dev: boolean): string {
  return [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; ');
}

export const LOCKED_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/** Headers every response carries, whatever the host. */
export const BASELINE_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  // No other origin may load a cv response as a subresource (img/script/style no-cors loads; e.g. a page pulling
  // cv-api JSON or another host's build assets). Each host loads only its own /_next assets; navigations are unaffected.
  'Cross-Origin-Resource-Policy': 'same-origin',
  // Every *.madfam.io host is HTTPS at the edge (R73); browsers ignore this header over plain HTTP.
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

/** The pages host's default: not indexed, not followed, and opted out of AI training (noai, noimageai). */
export const PAGES_NOINDEX = 'noindex, nofollow, noai, noimageai';

/**
 * X-Robots-Tag. Only an index-eligible role (the landing) may drop noindex, and only when
 * CV_INDEXABLE=true. Unknown hosts, probes and the app/API hosts are always noindex. The pages host is
 * PAGES_NOINDEX by default; a single public artifact whose owner chose `indexable` gets `userPageHeaders` instead.
 */
export function robotsTag(role: Role | null, config: Config): string {
  if (role === 'pages') return PAGES_NOINDEX;
  if (role !== null && hostRow(role).indexEligible && config.indexable) return 'index, follow';
  return 'noindex, nofollow';
}

/**
 * Headers of one user page, from the artifact (lane X §3.3, §4.5):
 * - a link-shared page (`/l/<token>`) is never indexed, never cached and never sends a Referer (the token is the
 *   secret: it must not leak to the sites the page links to, nor sit in shared caches);
 * - a public page is indexed only when its owner chose `indexable`, and is not cached either (unpublishing and
 *   suspension take effect at once).
 */
export function userPageHeaders(share: 'public' | 'link', indexable: boolean): Record<string, string> {
  if (share === 'link') {
    return { 'X-Robots-Tag': PAGES_NOINDEX, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
  }
  return { 'X-Robots-Tag': indexable ? 'index, follow' : PAGES_NOINDEX, 'Cache-Control': 'no-store' };
}

/** A fresh, unguessable nonce per HTML response (128 bits, base64). */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
