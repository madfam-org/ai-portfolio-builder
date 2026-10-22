/**
 * W6-A: the per-client rate limit on cv's UNAUTHENTICATED reads, applied by the proxy before any database work:
 *
 *   pages        the pages host: `/<slug>`, `/l/<token>` (each one a database lookup in pages-gate.ts) and its 404 page;
 *   public-api   cv-api's `/api/v1/public/a/<slug>` and `/api/v1/public/s/<token>`.
 *
 * Signed-in routes are not counted here (the owner-scoped API has its own quotas and per-owner intake ceilings).
 *
 * ALGORITHM: a token bucket per (surface, client): `burst` requests at once, refilled at `perMinute`
 * (lib/config.ts `readLimit`, env `CV_READ_LIMIT_BURST` / `CV_READ_LIMIT_PER_MINUTE`). A refused request costs
 * nothing and answers 429 with `Retry-After` (whole seconds until one token is back). In memory, per process, on
 * purpose (the estate's pattern: pliego, fashion-cabinet, voxa): no shared store to fail, and nothing durable about
 * who reads which page. With R replicas a client gets at most R times the numbers (production runs 2). At most
 * MAX_KEYS clients are tracked; the least recently seen is dropped first (a dropped client starts with a full bucket,
 * which is also what an idle client would have).
 *
 * THE CLIENT ADDRESS: `CF-Connecting-IP` only, and only when it parses as an IP address.
 * - The pod's only ingress on the app port is the Cloudflare tunnel (NetworkPolicy `allow-tunnel-ingress` admits port
 *   3000 from the `cloudflare-tunnel` namespace alone). Cloudflare's edge sets `CF-Connecting-IP` on every request and
 *   overwrites any value a client sent, so behind the tunnel it is the visitor's address.
 * - `X-Forwarded-For` is NEVER read: its first hop is whatever the client wrote (Cloudflare appends, it does not
 *   replace). `X-Real-IP` and `True-Client-IP` are not read either.
 * - IPv6 clients are counted per /64 (one subscriber's prefix; a single host can rotate through 2^64 addresses).
 * - No valid header (local runs, a misconfigured edge): one shared `unattributed` bucket. Visible, never a bypass.
 *
 * Nothing here logs. The request log (metrics-server.ts) already records the status by route TEMPLATE, never the raw
 * path: a share token in `/l/<token>` is a bearer secret.
 */
import { isIP } from 'node:net';
import type { ReadLimit } from '../lib/config.ts';
import type { Decision } from '../lib/routing.ts';

export type ReadSurface = 'pages' | 'public-api';

/** The key for a request without a usable client address. */
export const UNATTRIBUTED = 'unattributed';
export const MAX_KEYS = 50_000;

/** Which limited surface a routing decision is, or null (not limited here). */
export function readSurface(decision: Decision): ReadSurface | null {
  if (decision.kind === 'user-page') return 'pages';
  if (decision.role === 'pages' && decision.kind === 'not-found') return 'pages';
  if (decision.role === 'api' && decision.kind === 'rewrite' && decision.to.startsWith('/h/api/v1/public/')) return 'public-api';
  return null;
}

/** An IPv6 address (already validated by `isIP`) expanded to eight 16-bit groups, or null. */
function ipv6Groups(address: string): number[] | null {
  let text = address;
  const lastColon = text.lastIndexOf(':');
  const tail = text.slice(lastColon + 1);
  if (tail.includes('.')) {
    // An embedded IPv4 tail (`::ffff:192.0.2.1`) becomes its two groups.
    if (isIP(tail) !== 4) return null;
    const o = tail.split('.').map(Number);
    text = `${text.slice(0, lastColon + 1)}${((o[0]! << 8) | o[1]!).toString(16)}:${((o[2]! << 8) | o[3]!).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string): number[] => (part === '' ? [] : part.split(':').map((g) => parseInt(g, 16)));
  const head = parse(halves[0]!);
  const rest = halves.length === 2 ? parse(halves[1]!) : [];
  const zeros = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (zeros < 0) return null;
  const groups = [...head, ...new Array<number>(zeros).fill(0), ...rest];
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

/** The rate-limit key of a client address: IPv4 as is, an IPv4-mapped IPv6 as its IPv4, other IPv6 as its /64. */
export function clientKey(headers: Headers): string {
  const raw = headers.get('cf-connecting-ip')?.trim() ?? '';
  const address = raw.split('%')[0]!.toLowerCase();
  const family = isIP(address);
  if (family === 4) return address;
  if (family !== 6) return UNATTRIBUTED;
  const g = ipv6Groups(address);
  if (!g) return UNATTRIBUTED;
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return [g[6]! >> 8, g[6]! & 0xff, g[7]! >> 8, g[7]! & 0xff].join('.');
  }
  return `${g.slice(0, 4).map((x) => x.toString(16)).join(':')}::/64`;
}

interface Bucket {
  tokens: number;
  at: number;
}

export class TokenBuckets {
  readonly #burst: number;
  readonly #perMs: number;
  readonly #now: () => number;
  readonly #maxKeys: number;
  readonly #buckets = new Map<string, Bucket>();

  constructor(limit: ReadLimit, now: () => number = Date.now, maxKeys = MAX_KEYS) {
    this.#burst = limit.burst;
    this.#perMs = limit.perMinute / 60_000;
    this.#now = now;
    this.#maxKeys = maxKeys;
  }

  /** Spends one token and returns 0, or returns the whole seconds until one is back (nothing spent). */
  take(key: string): number {
    const now = this.#now();
    const prev = this.#buckets.get(key);
    const tokens = prev ? Math.min(this.#burst, prev.tokens + Math.max(0, now - prev.at) * this.#perMs) : this.#burst;
    // Re-insert so the Map's order is least recently seen first.
    this.#buckets.delete(key);
    if (tokens >= 1) {
      this.#buckets.set(key, { tokens: tokens - 1, at: now });
      if (this.#buckets.size > this.#maxKeys) this.#buckets.delete(this.#buckets.keys().next().value!);
      return 0;
    }
    this.#buckets.set(key, { tokens, at: now });
    return Math.max(1, Math.ceil((1 - tokens) / this.#perMs / 1000));
  }

  get size(): number {
    return this.#buckets.size;
  }
}

let shared: { limit: ReadLimit; buckets: TokenBuckets } | undefined;

/** The process's limiter (one bucket map; the key carries the surface). */
export function readLimiter(limit: ReadLimit): TokenBuckets {
  if (!shared || shared.limit !== limit) shared = { limit, buckets: new TokenBuckets(limit) };
  return shared.buckets;
}

/** 0 when the request may proceed, else the seconds for `Retry-After`. */
export function checkRead(surface: ReadSurface, headers: Headers, limit: ReadLimit): number {
  return readLimiter(limit).take(`${surface}|${clientKey(headers)}`);
}

/** The bilingual plain-text body of a refused pages-host request (es-MX first). */
export function tooManyText(retryAfter: number): string {
  return `Demasiadas solicitudes desde tu conexión. Intenta de nuevo en ${retryAfter} s.\nToo many requests from your connection. Try again in ${retryAfter} s.\n`;
}
