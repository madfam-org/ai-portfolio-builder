/**
 * `GET` and `POST /api/v1/jobs/intake/ocr` — read the text of ONE page image of a job posting through tlacuilo.
 *
 * Why one page per call: cv never buffers more than 512 KiB of a request (next.config.ts, W4-S). The browser prepares
 * each page itself (components/jobs/intake/ocr-pages.ts: a photo, a screenshot or a page of a scanned PDF, drawn to a
 * canvas and encoded under OCR_MAX_BYTES) and sends the pages one by one; the text comes back and the browser hands
 * the joined text to the ordinary intake (`POST /api/v1/jobs/intake`, `read: "ocr"`), which builds the preview.
 *
 * Order: (handler: route, not configured, bearer, job quota) → tlacuilo not configured (503 not_configured) → the
 * per-owner OCR ceiling (429) → the body (raw image bytes; 415, 413, 400) → tlacuilo → `{page}`. NOTHING IS STORED:
 * not the image, not the text. The image goes to tlacuilo, MADFAM's own in-cluster service, which keeps nothing
 * either. Logs: outcome, bytes and milliseconds, never content or a file name.
 */
import { RateLimiter, type Window } from '../ingest/rate-limit.ts';
import { tlacuiloConfig } from './config.ts';
import { sharedTlacuiloClient, type OcrFailure, type OcrMediaType, type TlacuiloOcrPort } from './client.ts';

type Env = Readonly<Record<string, string | undefined>>;

/** The largest page image accepted (under the proxy's 512 KiB buffer, with room for headers). */
export const OCR_MAX_BYTES = 480 * 1024;
/** Pages the browser sends for one document (tlacuilo's own OCR ceiling per document is 4). */
export const OCR_MAX_PAGES = 4;
/** Per-owner ceilings on page reads: OCR is the most expensive thing a person can ask cv for. */
export const OCR_WINDOWS: readonly Window[] = [
  { max: 16, ms: 10 * 60 * 1000 },
  { max: 60, ms: 24 * 60 * 60 * 1000 },
];
export const ocrLimiter = new RateLimiter(OCR_WINDOWS);

export interface OcrDeps {
  client?: TlacuiloOcrPort;
  limiter?: RateLimiter;
  log?: (line: Record<string, unknown>) => void;
}

const json = (status: number, body: unknown, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });

const defaultLog = (line: Record<string, unknown>) => console.warn(JSON.stringify(line));

/** The media type the bytes really are (their signature), or null. The declared Content-Type must agree. */
export function sniffImage(bytes: Uint8Array): OcrMediaType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return 'image/png';
  return null;
}

/** HTTP status and Retry-After for each way a page read can fail. */
const FAILURES: Readonly<Record<OcrFailure, { status: number; error: string; retry?: number }>> = {
  unreadable: { status: 422, error: 'ocr_unreadable' },
  too_large: { status: 422, error: 'ocr_too_large' },
  busy: { status: 503, error: 'ocr_busy', retry: 10 },
  timeout: { status: 503, error: 'ocr_timeout', retry: 10 },
  unavailable: { status: 503, error: 'ocr_unavailable', retry: 60 },
  refused: { status: 503, error: 'ocr_unavailable', retry: 300 },
  invalid: { status: 503, error: 'ocr_unavailable', retry: 60 },
};

/** `GET`: whether reading images is on, and the limits the browser prepares pages for. No call to tlacuilo. */
export function ocrStatus(env: Env, deps: OcrDeps = {}): Response {
  const enabled = !!deps.client || tlacuiloConfig(env) !== null;
  return json(200, { enabled, maxPages: OCR_MAX_PAGES, maxBytes: OCR_MAX_BYTES, mediaTypes: ['image/jpeg', 'image/png'] });
}

/** `POST`: the raw bytes of one page image (Content-Type image/jpeg or image/png) → `{page}`. */
export async function ocrPage(owner: string, request: Request, env: Env, deps: OcrDeps = {}): Promise<Response> {
  const log = deps.log ?? defaultLog;
  const config = tlacuiloConfig(env);
  const client = deps.client ?? (config ? sharedTlacuiloClient(config) : null);
  if (!client) return json(503, { error: 'not_configured' });

  const declared = (request.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (declared !== 'image/jpeg' && declared !== 'image/png') return json(415, { error: 'unsupported_media_type', allowed: ['image/jpeg', 'image/png'] });
  if (Number(request.headers.get('content-length') ?? '0') > OCR_MAX_BYTES) return json(413, { error: 'body_too_large', limit: OCR_MAX_BYTES });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > OCR_MAX_BYTES) return json(413, { error: 'body_too_large', limit: OCR_MAX_BYTES });
  const actual = sniffImage(bytes);
  if (!actual || actual !== declared) return json(400, { error: 'invalid_image' });

  // The ceiling is taken only for a well-formed page, so a rejected upload costs the person nothing.
  const wait = (deps.limiter ?? ocrLimiter).take(owner);
  if (wait > 0) return json(429, { error: 'rate_limited', retryAfter: wait }, { 'Retry-After': String(wait) });

  const started = Date.now();
  const result = await client.readPage(bytes, actual);
  const ms = Date.now() - started;
  if (!result.ok) {
    const f = FAILURES[result.reason];
    log({ evt: 'cv-ocr', outcome: result.reason, bytes: bytes.byteLength, ms });
    return json(f.status, { error: f.error, ...(f.retry ? { retryAfter: f.retry } : {}) }, f.retry ? { 'Retry-After': String(f.retry) } : {});
  }
  log({ evt: 'cv-ocr', outcome: 'ok', bytes: bytes.byteLength, ms, lines: result.page.lines.length, verdict: result.page.verdict });
  return json(200, { page: result.page });
}
