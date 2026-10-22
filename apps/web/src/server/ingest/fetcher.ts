/**
 * W5-J SSRF guard, part 2: the ONE way cv fetches a third-party URL, used only on an explicit `POST /jobs/intake` by the
 * signed-in owner (never on GET, never on render). Threat model: docs/PRODUCT.md "Job intake" and the W5-J report.
 *
 * Every hop (the first request and each redirect, at most 3):
 *   https only, port 443 only, no userinfo; the hostname passes `hostProblem` (net.ts); DNS is resolved HERE and EVERY
 *   returned address must be public (`isPublicAddress`); the socket then connects to that vetted address (a pinned
 *   `lookup`), so there is no window for DNS rebinding between the check and the connect. TLS still verifies the
 *   certificate against the hostname (SNI and identity use the name, not the address).
 * Every response: no cookie or credential is ever sent (no jar, no Authorization, Set-Cookie ignored); the status must
 *   be 2xx; the media type must be in the caller's allow-list; the body is capped (2 MB after decompression: a gzip bomb
 *   stops at the cap); one deadline (8 s) covers the whole chain.
 * The User-Agent names cv and a contact URL. Logs: host and outcome only (callers), never the URL (queries carry tokens).
 *
 * `resolver` and `transport` are injectable so the rejections are unit-tested without a network.
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';
import type { Readable, Transform } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { hostProblem, isPublicAddress } from './net.ts';

/** W6-A: the `+URL` is the public page that explains the reader to site operators (cv.madfam.io/lector, es-MX; /en/lector). */
export const INTAKE_USER_AGENT = 'MADFAM-CV-Intake/1.0 (+https://cv.madfam.io/lector; one fetch per person request; support@madfam.io)';
/** The robots.txt product token (RFC 9309 §2.2.1) cv answers to. */
export const ROBOTS_TOKEN = 'madfam-cv';

export const FETCH_LIMITS = { maxBytes: 2 * 1024 * 1024, timeoutMs: 8_000, maxRedirects: 3 } as const;

export type FetchFailure =
  | 'invalid_url'
  | 'not_https'
  | 'bad_port'
  | 'credentials'
  | 'blocked_host'
  | 'private_address'
  | 'dns_failed'
  | 'too_many_redirects'
  | 'http_status'
  | 'unsupported_type'
  | 'too_large'
  | 'timeout'
  | 'network';

export class FetchError extends Error {
  readonly code: FetchFailure;
  readonly status: number | null;
  readonly host: string | null;
  constructor(code: FetchFailure, host: string | null, status: number | null = null) {
    super(`fetch: ${code}${status ? ` ${status}` : ''}`);
    this.code = code;
    this.host = host;
    this.status = status;
  }
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

export interface TransportRequest {
  hostname: string;
  /** The vetted address the socket must connect to. */
  address: ResolvedAddress;
  path: string;
  headers: Record<string, string>;
  signal: AbortSignal;
}
export interface TransportResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Readable;
}
export type Transport = (req: TransportRequest) => Promise<TransportResponse>;

export interface FetchedDocument {
  /** The final URL (after redirects). */
  url: URL;
  status: number;
  mediaType: string;
  charset: string | null;
  bytes: Uint8Array;
}

export interface FetchOptions {
  /** Allowed media types (`text/html`, `application/json` …); `*` accepts any (robots.txt only). */
  accept: readonly string[];
  /** Absolute deadline (Date.now() ms) shared by every request of one intake. */
  deadline?: number;
  maxBytes?: number;
  resolver?: Resolver;
  transport?: Transport;
}

const systemResolver: Resolver = async (hostname) => {
  const found = await dnsLookup(hostname, { all: true, verbatim: true });
  return found.map((a) => ({ address: a.address, family: a.family === 6 ? 6 : 4 }));
};

/** node:https with the socket pinned to the vetted address; no agent (no pooled socket reuse), no proxy env. */
const httpsTransport: Transport = (req) =>
  new Promise((resolve, reject) => {
    const pinned = (_host: string, opts: { all?: boolean } | number, cb: (...args: unknown[]) => void) => {
      const all = typeof opts === 'object' && opts?.all;
      if (all) cb(null, [{ address: req.address.address, family: req.address.family }]);
      else cb(null, req.address.address, req.address.family);
    };
    const bare = req.hostname.replace(/^\[|\]$/g, '');
    const r = httpsRequest(
      {
        host: bare,
        // SNI carries names only (RFC 6066); certificate identity is still checked against `host`.
        ...(isIP(bare) ? {} : { servername: bare }),
        port: 443,
        path: req.path,
        method: 'GET',
        headers: req.headers,
        agent: false,
        lookup: pinned as never,
        signal: req.signal,
      },
      (res: IncomingMessage) => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: res }),
    );
    r.on('error', reject);
    r.end();
  });

/** Validates the URL of one hop; returns it normalised (fragment dropped). */
export function checkUrl(raw: string | URL): URL {
  let u: URL;
  try {
    u = new URL(String(raw));
  } catch {
    throw new FetchError('invalid_url', null);
  }
  const host = u.hostname || null;
  if (u.protocol !== 'https:') throw new FetchError('not_https', host);
  if (u.username || u.password) throw new FetchError('credentials', host);
  if (u.port !== '' && u.port !== '443') throw new FetchError('bad_port', host);
  const problem = hostProblem(u.hostname);
  if (problem) throw new FetchError(problem, host);
  u.hash = '';
  return u;
}

/** Resolves and vets: EVERY address must be public (a name with one private answer is refused outright). */
export async function vetAddresses(hostname: string, resolver: Resolver): Promise<ResolvedAddress> {
  const bare = hostname.replace(/^\[|\]$/g, '');
  if (isPublicAddress(bare)) return { address: bare, family: bare.includes(':') ? 6 : 4 };
  let found: ResolvedAddress[];
  try {
    found = await resolver(hostname);
  } catch {
    throw new FetchError('dns_failed', hostname);
  }
  if (found.length === 0) throw new FetchError('dns_failed', hostname);
  if (found.some((a) => !isPublicAddress(a.address))) throw new FetchError('private_address', hostname);
  return found[0]!;
}

function header(headers: TransportResponse['headers'], name: string): string | null {
  const v = headers[name];
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function decoder(encoding: string | null, host: string): Transform | null {
  const e = (encoding ?? '').trim().toLowerCase();
  if (e === '' || e === 'identity') return null;
  if (e === 'gzip' || e === 'x-gzip') return createGunzip();
  if (e === 'deflate') return createInflate();
  if (e === 'br') return createBrotliDecompress();
  throw new FetchError('unsupported_type', host);
}

async function readCapped(stream: Readable, max: number, host: string, signal: AbortSignal): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of stream) {
      if (signal.aborted) throw new FetchError('timeout', host);
      const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      total += b.length;
      if (total > max) throw new FetchError('too_large', host);
      chunks.push(b);
    }
  } catch (err) {
    stream.destroy();
    if (err instanceof FetchError) throw err;
    throw new FetchError(signal.aborted ? 'timeout' : 'network', host);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/** One GET through the guard. Throws FetchError (with the host, never the URL) on every refusal. */
export async function safeFetch(rawUrl: string | URL, opts: FetchOptions): Promise<FetchedDocument> {
  const resolver = opts.resolver ?? systemResolver;
  const transport = opts.transport ?? httpsTransport;
  const maxBytes = opts.maxBytes ?? FETCH_LIMITS.maxBytes;
  const deadline = opts.deadline ?? Date.now() + FETCH_LIMITS.timeoutMs;
  let url = checkUrl(rawUrl);
  for (let hop = 0; ; hop += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new FetchError('timeout', url.hostname);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    try {
      const address = await vetAddresses(url.hostname, resolver);
      let res: TransportResponse;
      try {
        res = await transport({
          hostname: url.hostname,
          address,
          path: `${url.pathname}${url.search}`,
          headers: {
            'User-Agent': INTAKE_USER_AGENT,
            Accept: opts.accept.includes('*') ? '*/*' : `${opts.accept.join(', ')};q=1.0, */*;q=0.1`,
            'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
          },
          signal: controller.signal,
        });
      } catch {
        throw new FetchError(controller.signal.aborted ? 'timeout' : 'network', url.hostname);
      }
      // The deadline ends the body too, whatever the transport does with the signal.
      const body = res.body;
      const onAbort = () => body.destroy(new Error('deadline'));
      if (controller.signal.aborted) onAbort();
      else controller.signal.addEventListener('abort', onAbort, { once: true });
      const location = header(res.headers, 'location');
      if ([301, 302, 303, 307, 308].includes(res.status) && location) {
        res.body.destroy();
        if (hop >= FETCH_LIMITS.maxRedirects) throw new FetchError('too_many_redirects', url.hostname);
        let next: URL;
        try {
          next = new URL(location, url);
        } catch {
          throw new FetchError('invalid_url', url.hostname);
        }
        url = checkUrl(next);
        continue;
      }
      if (res.status < 200 || res.status > 299) {
        res.body.destroy();
        throw new FetchError('http_status', url.hostname, res.status);
      }
      const contentType = header(res.headers, 'content-type') ?? '';
      const mediaType = contentType.split(';')[0]!.trim().toLowerCase();
      if (!opts.accept.includes('*') && !opts.accept.includes(mediaType)) {
        res.body.destroy();
        throw new FetchError('unsupported_type', url.hostname);
      }
      const declared = Number(header(res.headers, 'content-length') ?? '0');
      const encoding = header(res.headers, 'content-encoding');
      if (!encoding && declared > maxBytes) {
        res.body.destroy();
        throw new FetchError('too_large', url.hostname);
      }
      const inflate = decoder(encoding, url.hostname);
      const stream = inflate ? res.body.pipe(inflate) : res.body;
      if (inflate) {
        res.body.on('error', () => inflate.destroy());
        // The wire bytes are capped too: a compressed body that inflates to little (empty deflate blocks) cannot run on.
        let wire = 0;
        res.body.on('data', (chunk: Buffer) => {
          wire += chunk.length;
          if (wire > maxBytes) inflate.destroy(new FetchError('too_large', url.hostname));
        });
      }
      const bytes = await readCapped(stream, maxBytes, url.hostname, controller.signal);
      const charset = /charset\s*=\s*"?([\w.:-]+)"?/i.exec(contentType)?.[1]?.toLowerCase() ?? null;
      return { url, status: res.status, mediaType, charset, bytes };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Decodes a fetched body: the declared charset, else an HTML `<meta charset>` in the first 2 KiB, else UTF-8. */
export function decodeBody(doc: Pick<FetchedDocument, 'bytes' | 'charset' | 'mediaType'>): string {
  let label = doc.charset;
  if (!label && doc.mediaType.includes('html')) {
    const head = new TextDecoder('latin1').decode(doc.bytes.subarray(0, 2048));
    label = /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(head)?.[1]?.toLowerCase() ?? null;
  }
  try {
    return new TextDecoder(label ?? 'utf-8').decode(doc.bytes);
  } catch {
    return new TextDecoder('utf-8').decode(doc.bytes);
  }
}
