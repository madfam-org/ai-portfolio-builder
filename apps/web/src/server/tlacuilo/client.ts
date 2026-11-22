/**
 * cv's client for tlacuilo's `POST /v1/extractions` (sync, `document_type=text_document`): one page image in, its text
 * lines out. Contract: `document-extraction/v1`, the optional `text` block.
 *
 * - Token: Janua client credentials (client_secret_basic, scope tlacuilo:extract), cached in memory until 60 s before
 *   it expires; one mint in flight at a time; a 401 from tlacuilo drops it and retries once.
 * - Budget: every call is bounded by `timeoutMs`.
 * - Circuit breaker (server/breaker.ts): only the SERVICE's failures count (a connection error, cv's own time budget
 *   running out, a 5xx without one of tlacuilo's page codes, at the token endpoint or the extraction), and only a run of
 *   them from different people opens it; one person's pages never open it alone. Open, the client answers
 *   `unavailable` at once for OPEN_MS. What a page itself can cause never counts: a page tlacuilo could not read (422
 *   blank scan, unreadable image), its page codes (`ocr_busy`, `ocr_timeout`), any other 4xx, a refused token, an
 *   answer outside the contract (a page can make tlacuilo send one).
 * - No cache: every page is someone's own document. Nothing is kept here, and tlacuilo keeps nothing either.
 * - Validation: the answer is parsed with zod and bounded; an unexpected shape is `invalid`, never shown.
 *
 * Sends ONLY the image bytes, with `X-Sensitivity: restricted`. Never the person's identity, profile or file name.
 * Logs status and error codes only, never content.
 */
import { z } from 'zod';
import { createBreaker } from '../breaker.ts';
import { TLACUILO_DOCUMENT_TYPE, TLACUILO_SCOPE, TLACUILO_SENSITIVITY, type TlacuiloConfig } from './config.ts';

export { FAILURE_THRESHOLD, MIN_OWNERS, OPEN_MS } from '../breaker.ts';
const TOKEN_SKEW_MS = 60_000;
/** Bounds on what one page may bring back (a dense page is about 6 000 characters). */
export const PAGE_MAX_LINES = 600;
export const PAGE_MAX_CHARS = 40_000;

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const lineSchema = z.object({
  text: z.string().max(2000),
  confidence: z.number().min(0).max(1).nullable(),
  bbox: z.array(z.number()).length(4).nullable().optional(),
});
const resultSchema = z.object({
  contract: z.literal('document-extraction/v1'),
  document: z.object({ type: z.literal(TLACUILO_DOCUMENT_TYPE), pages: z.number().int().nonnegative() }).passthrough(),
  text: z.object({
    source: z.enum(['text_layer', 'ocr']),
    pagesRead: z.number().int().nonnegative(),
    characters: z.number().int().nonnegative(),
    pages: z
      .array(z.object({ page: z.number().int().min(1), meanWordConfidence: z.number().min(0).max(1).nullable(), lines: z.array(lineSchema).max(5000) }))
      .max(20),
    quality: z.object({ verdict: z.enum(['good', 'fair', 'poor']) }),
  }),
  validation: z.object({ warnings: z.array(z.string().max(400)).max(20) }).passthrough(),
}).passthrough();

export type OcrVerdict = 'good' | 'fair' | 'poor';

export interface OcrPage {
  /** The page's lines, top to bottom; empty lines dropped. */
  lines: string[];
  /** Mean word confidence (0..1), or null when tlacuilo read a text layer. */
  confidence: number | null;
  verdict: OcrVerdict;
  source: 'text_layer' | 'ocr';
  /** True when the page had more text than cv keeps for one page. */
  truncated: boolean;
}

/** Why a page produced no text. `unreadable` and `too_large` are about the page; the rest are about the service. */
export type OcrFailure = 'unavailable' | 'refused' | 'invalid' | 'unreadable' | 'too_large' | 'busy' | 'timeout';

export type OcrResult = { ok: true; page: OcrPage } | { ok: false; reason: OcrFailure };

export type OcrMediaType = 'image/jpeg' | 'image/png';

export interface TlacuiloOcrPort {
  /** `owner`: the Janua `sub` of the person whose page this is; the breaker counts people, never sends it. */
  readPage(bytes: Uint8Array, mediaType: OcrMediaType, owner: string): Promise<OcrResult>;
}

class CallFailure extends Error {
  readonly kind: OcrFailure;
  /** The service's own failure (counts toward the breaker); false for anything the request could have caused. */
  readonly service: boolean;
  constructor(kind: OcrFailure, detail: string, service = false) {
    super(detail);
    this.kind = kind;
    this.service = service;
  }
}

/** tlacuilo's error codes that are about this page or this moment, mapped to what the person can do about it. */
const PAGE_ERRORS: Readonly<Record<string, OcrFailure>> = {
  unreadable_scan: 'unreadable',
  unreadable_image: 'unreadable',
  unreadable_pdf: 'unreadable',
  unsupported_mime: 'unreadable',
  empty_file: 'unreadable',
  image_too_large: 'too_large',
  too_large: 'too_large',
  too_many_pages: 'too_large',
  ocr_timeout: 'timeout',
  ocr_busy: 'busy',
  ocr_failed: 'unreadable',
};

export function createTlacuiloClient(config: TlacuiloConfig, deps: { fetch?: Fetch; now?: () => number } = {}): TlacuiloOcrPort {
  const doFetch: Fetch = deps.fetch ?? ((input, init) => fetch(input, init));
  const now = deps.now ?? (() => Date.now());
  let token: { value: string; expiresAt: number } | null = null;
  let inflight: Promise<string> | null = null;
  const breaker = createBreaker(now);

  async function mintToken(): Promise<string> {
    const basic = Buffer.from(`${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`).toString('base64');
    let res: Response;
    try {
      res = await doFetch(config.tokenUrl, {
        method: 'POST',
        headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ grant_type: 'client_credentials', scope: TLACUILO_SCOPE }).toString(),
        signal: AbortSignal.timeout(Math.min(config.timeoutMs, 5000)),
        redirect: 'error',
        cache: 'no-store',
      });
    } catch {
      throw new CallFailure('unavailable', 'token request failed', true);
    }
    if (!res.ok) throw res.status >= 500 ? new CallFailure('unavailable', `token ${res.status}`, true) : new CallFailure('refused', `token ${res.status}`);
    const body = z.object({ access_token: z.string().min(20).max(8192), expires_in: z.number().int().positive().max(86_400) }).safeParse(await res.json().catch(() => null));
    if (!body.success) throw new CallFailure('invalid', 'token response shape');
    token = { value: body.data.access_token, expiresAt: now() + body.data.expires_in * 1000 };
    return token.value;
  }

  async function bearer(): Promise<string> {
    if (token && token.expiresAt - TOKEN_SKEW_MS > now()) return token.value;
    inflight ??= mintToken().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  async function call(bytes: Uint8Array, mediaType: OcrMediaType, retry: boolean): Promise<OcrPage> {
    const form = new FormData();
    form.set('mode', 'sync');
    form.set('document_type', TLACUILO_DOCUMENT_TYPE);
    // A neutral name: the person's own file name never leaves cv.
    form.set('file', new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mediaType }), mediaType === 'image/png' ? 'page.png' : 'page.jpg');
    let res: Response;
    try {
      res = await doFetch(`${config.apiUrl}/v1/extractions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await bearer()}`, Accept: 'application/json', 'X-Sensitivity': TLACUILO_SENSITIVITY, 'User-Agent': 'madfam-cv/1 (+https://cv.madfam.io)' },
        body: form,
        signal: AbortSignal.timeout(config.timeoutMs),
        redirect: 'error',
        cache: 'no-store',
      });
    } catch (err) {
      if (err instanceof CallFailure) throw err;
      // No answer within cv's budget, or no connection: the service's.
      throw new CallFailure(err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'unavailable', 'extraction request failed', true);
    }
    if (res.status === 401 && retry) {
      token = null;
      return call(bytes, mediaType, false);
    }
    if (res.status === 401 || res.status === 403) throw new CallFailure('refused', `extraction ${res.status}`);
    const json = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      const code = z.object({ error: z.string().max(60) }).safeParse(json);
      const errorCode = code.success ? code.data.error : null;
      const mapped = errorCode ? PAGE_ERRORS[errorCode] : undefined;
      // A known code keeps its meaning whatever its status (`ocr_busy` is a 503: one job at a time, not an outage).
      if (mapped) throw new CallFailure(mapped, `extraction ${res.status} ${errorCode}`);
      if (res.status === 400 || res.status === 422) throw new CallFailure('invalid', `extraction ${res.status}`);
      // A 5xx without a page code is the service's; any other 4xx (413, 429 …) is about this request or this caller.
      throw new CallFailure('unavailable', `extraction ${res.status}`, res.status >= 500);
    }
    const parsed = resultSchema.safeParse(json);
    if (!parsed.success) throw new CallFailure('invalid', 'extraction response shape');
    const { text } = parsed.data;
    const lines: string[] = [];
    let chars = 0;
    let truncated = false;
    for (const line of text.pages.flatMap((p) => p.lines)) {
      const clean = line.text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!clean) continue;
      if (lines.length >= PAGE_MAX_LINES || chars + clean.length > PAGE_MAX_CHARS) {
        truncated = true;
        break;
      }
      lines.push(clean);
      chars += clean.length;
    }
    if (lines.length === 0) throw new CallFailure('unreadable', 'extraction read no text');
    const confidences = text.pages.map((p) => p.meanWordConfidence).filter((c): c is number => c !== null);
    return {
      lines,
      confidence: confidences.length ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 1000) / 1000 : null,
      verdict: text.quality.verdict,
      source: text.source,
      truncated,
    };
  }

  return {
    async readPage(bytes, mediaType, owner) {
      if (breaker.isOpen()) return { ok: false, reason: 'unavailable' };
      try {
        const page = await call(bytes, mediaType, true);
        breaker.succeed();
        return { ok: true, page };
      } catch (err) {
        const failure = err instanceof CallFailure ? err : new CallFailure('unavailable', 'unexpected');
        if (failure.service) breaker.fail(owner);
        // tlacuilo answered about this page: it is up.
        else if (failure.kind === 'unreadable' || failure.kind === 'too_large') breaker.succeed();
        console.error(`cv-api: tlacuilo ocr ${failure.kind} (${failure.message})`);
        return { ok: false, reason: failure.kind };
      }
    },
  };
}

const clients = new Map<string, TlacuiloOcrPort>();

/** One client per configuration (so the token and the breaker survive across requests in a process). */
export function sharedTlacuiloClient(config: TlacuiloConfig): TlacuiloOcrPort {
  const key = `${config.apiUrl}|${config.tokenUrl}|${config.clientId}`;
  let client = clients.get(key);
  if (!client) {
    client = createTlacuiloClient(config);
    clients.set(key, client);
  }
  return client;
}
