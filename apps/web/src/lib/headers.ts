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

export function htmlCsp(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
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
  // Every *.madfam.io host is HTTPS at the edge (R73); browsers ignore this header over plain HTTP.
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

/**
 * X-Robots-Tag. Only an index-eligible role (the landing) may drop noindex, and only when
 * CV_INDEXABLE=true. Unknown hosts, probes and the app/API hosts are always noindex.
 */
export function robotsTag(role: Role | null, config: Config): string {
  if (role !== null && hostRow(role).indexEligible && config.indexable) return 'index, follow';
  return 'noindex, nofollow';
}

/** A fresh, unguessable nonce per HTML response (128 bits, base64). */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
