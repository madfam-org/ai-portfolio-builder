/**
 * W5-J: `POST /api/v1/jobs/intake` — turn a link, a text or a browser capture into a PREVIEW of a job. Nothing is stored:
 * the person edits the preview and saves it with `POST /api/v1/jobs` (the per-owner job quota is checked there, and
 * here first so nobody fetches a page they cannot save).
 *
 * A link (`source: 'url'`), only on this explicit POST by the signed-in owner:
 *   1. syntax and SSRF checks (fetcher.ts `checkUrl`); a board that forbids fetching → `capture_only` (boards.ts);
 *   2. the per-owner fetch ceiling (rate-limit.ts);
 *   3. a known ATS → its public API (ats.ts); on any failure, fall through to the page;
 *   4. robots.txt for `madfam-cv` (robots.ts), then ONE page fetch, read as JSON-LD → microdata → Open Graph → text.
 * A text or a capture is parsed only (no network). Logs: source, host and outcome, never the URL or the content.
 */
import { z } from 'zod';
import { SOURCE_TEXT_MAX } from '../db/schema.ts';
import { detectAts } from './ats.ts';
import { captureOnlyBoard } from './boards.ts';
import { draftFromCapture, draftFromHtml, draftFromText } from './extract.ts';
import { FETCH_LIMITS, FetchError, checkUrl, decodeBody, safeFetch, type Resolver, type Transport } from './fetcher.ts';
import { robotsVerdict } from './robots.ts';
import { fetchLimiter as defaultFetchLimiter, parseLimiter as defaultParseLimiter, type RateLimiter } from './rate-limit.ts';
import type { IntakeDraft, IntakeFailure } from './types.ts';

const captureSchema = z
  .object({
    url: z.string().trim().max(2000).nullable().default(null),
    canonical: z.string().trim().max(2000).nullable().default(null),
    title: z.string().max(500).default(''),
    jsonLd: z.array(z.string().max(200_000)).max(10).default([]),
    meta: z
      .record(z.string().max(100), z.string().max(5000))
      .refine((m) => Object.keys(m).length <= 60, 'at most 60 entries')
      .default({}),
    microdata: z.string().max(200_000).default(''),
    text: z.string().max(120_000).default(''),
  })
  .strict();

export const intakeBody = z.discriminatedUnion('source', [
  z.object({ source: z.literal('url'), url: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ source: z.literal('text'), kind: z.enum(['paste', 'pdf', 'docx', 'file']).default('paste'), text: z.string().min(1).max(SOURCE_TEXT_MAX * 2) }).strict(),
  z.object({ source: z.literal('capture'), kind: z.enum(['capture', 'file']).default('capture'), capture: captureSchema }).strict(),
]);
export type IntakeBody = z.input<typeof intakeBody>;

export interface IntakeDeps {
  resolver?: Resolver;
  transport?: Transport;
  fetchLimiter?: RateLimiter;
  parseLimiter?: RateLimiter;
  log?: (line: Record<string, unknown>) => void;
}

export type IntakeResult =
  | { ok: true; draft: IntakeDraft }
  | { ok: false; status: number; body: { error: string; reason?: IntakeFailure; board?: string; status?: number; retryAfter?: number; issues?: unknown } };

const defaultLog = (line: Record<string, unknown>) => console.warn(JSON.stringify(line));

const fail = (reason: IntakeFailure, extra: { board?: string; status?: number } = {}): IntakeResult => ({ ok: false, status: 422, body: { error: 'intake_failed', reason, ...extra } });

function fetchFailure(err: unknown): IntakeResult {
  if (!(err instanceof FetchError)) return fail('network');
  if (err.code === 'http_status') {
    const blocked = err.status === 401 || err.status === 403 || err.status === 429 || err.status === 451;
    return fail(blocked ? 'blocked_by_site' : 'http_status', err.status ? { status: err.status } : {});
  }
  return fail(err.code);
}

async function fromUrl(owner: string, raw: string, deps: IntakeDeps): Promise<IntakeResult> {
  const log = deps.log ?? defaultLog;
  const started = Date.now();
  let url: URL;
  try {
    url = checkUrl(raw);
  } catch (err) {
    const r = fetchFailure(err);
    log({ evt: 'cv-intake', source: 'url', host: err instanceof FetchError ? err.host : null, outcome: r.ok ? 'ok' : r.body.reason });
    return r;
  }
  const host = url.hostname;
  const done = (r: IntakeResult, via: string): IntakeResult => {
    log({ evt: 'cv-intake', source: 'url', host, via, outcome: r.ok ? 'ok' : r.body.reason, ms: Date.now() - started });
    return r;
  };
  const board = captureOnlyBoard(host);
  if (board) return done(fail('capture_only', { board: board.name }), 'board');
  const wait = (deps.fetchLimiter ?? defaultFetchLimiter).take(owner);
  if (wait > 0) return done({ ok: false, status: 429, body: { error: 'rate_limited', retryAfter: wait } }, 'limit');

  const deadline = started + FETCH_LIMITS.timeoutMs;
  const net = { resolver: deps.resolver, transport: deps.transport, deadline };
  const ats = detectAts(url);
  let atsFellBack = false;
  if (ats) {
    try {
      const doc = await safeFetch(ats.apiUrl, { ...net, accept: ['application/json'] });
      const json = JSON.parse(decodeBody(doc)) as unknown;
      const job = ats.pick(json);
      if (job) {
        const mapped = ats.map(job, json);
        const description = mapped.description?.trim() ?? '';
        if (mapped.fields.title && description) {
          const notes: IntakeDraft['notes'] = [];
          const text = description.length > SOURCE_TEXT_MAX ? (notes.push('text_truncated'), description.slice(0, SOURCE_TEXT_MAX)) : description;
          let sourceUrl = url.toString();
          try {
            if (mapped.url && new URL(mapped.url).protocol === 'https:') sourceUrl = new URL(mapped.url).toString();
          } catch {
            /* keep the submitted URL */
          }
          return done({ ok: true, draft: { sourceKind: 'ats', sourceUrl, provider: ats.provider, fields: mapped.fields, sourceText: text, sourceTextFrom: 'ats-api', notes } }, `ats:${ats.provider}`);
        }
      }
    } catch {
      // Any API failure (404, a list over the size cap, unexpected JSON): read the page instead, below.
    }
    atsFellBack = true;
  }

  const robots = await robotsVerdict(url, net);
  if (robots === 'disallowed') return done(fail('robots_disallowed'), 'robots');
  if (robots === 'unreachable') return done(fail('robots_unreachable'), 'robots');
  try {
    const doc = await safeFetch(url, { ...net, accept: ['text/html', 'application/xhtml+xml'] });
    const draft = draftFromHtml(decodeBody(doc), doc.url, 'url');
    if (!draft) return done(fail('unreadable'), 'page');
    if (atsFellBack) draft.notes.push('ats_fallback');
    return done({ ok: true, draft }, 'page');
  } catch (err) {
    return done(fetchFailure(err), 'page');
  }
}

/** The intake itself (validated body → preview or an honest failure). */
export async function runIntake(owner: string, input: unknown, deps: IntakeDeps = {}): Promise<IntakeResult> {
  const parsed = intakeBody.safeParse(input);
  if (!parsed.success) return { ok: false, status: 400, body: { error: 'invalid_body', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } };
  const wait = (deps.parseLimiter ?? defaultParseLimiter).take(owner);
  if (wait > 0) return { ok: false, status: 429, body: { error: 'rate_limited', retryAfter: wait } };
  const body = parsed.data;
  if (body.source === 'url') return fromUrl(owner, body.url, deps);
  const draft = body.source === 'text' ? draftFromText(body.text, body.kind) : draftFromCapture(body.capture, body.kind);
  (deps.log ?? defaultLog)({ evt: 'cv-intake', source: body.source, kind: body.kind, outcome: draft ? 'ok' : 'unreadable' });
  return draft ? { ok: true, draft } : fail('unreadable');
}

/** The API answer (server/api/handler.ts calls this after authentication and the job-quota pre-check). */
export async function intakeResponse(owner: string, input: unknown, deps: IntakeDeps = {}): Promise<Response> {
  const r = await runIntake(owner, input, deps);
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (!r.ok && r.status === 429 && r.body.retryAfter) headers['Retry-After'] = String(r.body.retryAfter);
  return new Response(JSON.stringify(r.ok ? { draft: r.draft } : r.body), { status: r.ok ? 200 : r.status, headers });
}
