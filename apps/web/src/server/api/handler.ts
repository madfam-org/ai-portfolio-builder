/**
 * cv-api's `/api/v1/*` (everything but `/api/v1/meta`), as one function over (request, path segments, deps), so the
 * same code answers on cv-api.madfam.io (app/h/api/v1/[...path]) and in-process behind cv-app's same-origin proxy
 * (app/api/v1/[...path]), and is tested without Next.js.
 *
 * Order for every authenticated route: route match (404/405) → not configured (503) → bearer (401/403/503) →
 * zod body (400) → owner-scoped repository (404 for absent or another person's rows).
 */
import type { z } from 'zod';
import { verifierConfig } from '../../lib/auth-env.ts';
import type { DbHandle } from '../db/client.ts';
import {
  ForeignItemsError,
  JobHasArtifactsError,
  PublishLimitError,
  SlugTakenError,
  SuspendedError,
  createRepository,
  getLinkArtifactByToken,
  getPublicArtifactBySlug,
  ownerRowCount,
  type OwnedTable,
  type Repository,
} from '../db/repository.ts';
import { ARTIFACT_KINDS, LOCALES } from '../db/schema.ts';
import { HEADER_TEXT_FIELDS, ITEM_TEXT_FIELDS, cleanTranslations, type ContentLocale, type Translations } from '../../lib/profile-text.ts';
import { createDataRights } from '../db/data-rights.ts';
import { EXPORT_FORMATS, exportFilename, fullExport, toJsonResume, type ExportFormat } from './portability.ts';
import { authFailureResponse, authenticate } from '../janua.ts';
import { UUID, matchRoute } from '../../lib/api-routes.ts';
import { MAX_BODY_BYTES, OWNER_QUOTAS, type OwnerQuotas } from './limits.ts';
import { matchItems } from './match.ts';
import { intakeResponse, type IntakeDeps } from '../ingest/intake.ts';
import type { HcmBenchmarkPort } from '../hcm/client.ts';
import { jobBenchmark } from '../hcm/route.ts';
import {
  ARTIFACT_CONTENT,
  ITEM_CONTENT,
  artifactCreateBody,
  artifactPatchBody,
  artifactSetBody,
  itemCreateBody,
  itemPatchBody,
  itemReorderBody,
  jobCreateBody,
  jobPatchBody,
  profileBody,
  itemBatchBody,
  deleteMeBody,
  ITEM_TRANSLATIONS,
  publishBody,
  salaryIssue,
  templateIssue,
  type ArtifactContent,
} from './validation.ts';

type Env = Readonly<Record<string, string | undefined>>;

export interface ApiDeps {
  env: Env;
  getDb: () => DbHandle | null;
  /** Per-owner row ceilings (limits.ts OWNER_QUOTAS); tests lower them. */
  quotas?: Partial<OwnerQuotas>;
  /** W5-J job intake: injected resolver, transport and limiters (tests); production uses the real ones. */
  intake?: IntakeDeps;
  /** W5-H: the Symbiosis HCM benchmark client; tests inject a fake. Unset: built from env (server/hcm/config.ts). */
  hcm?: HcmBenchmarkPort;
}

/** Throws 429 `quota_exceeded` when creating `adding` more rows would take the owner past the table's ceiling. */
type QuotaCheck = (table: OwnedTable, adding: number) => Promise<void>;

export function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });
}
const notFound = () => json(404, { error: 'not_found' });
const notConfigured = () => json(503, { error: 'not_configured' });

/** Never return the owner key: the caller already knows who they are. */
function view<T extends { ownerSub?: string }>(row: T): Omit<T, 'ownerSub'> {
  const { ownerSub: _ownerSub, ...rest } = row;
  return rest;
}

class HttpError extends Error {
  readonly status: number;
  readonly body: Record<string, unknown>;
  constructor(status: number, body: Record<string, unknown>) {
    super(String(body.error));
    this.status = status;
    this.body = body;
  }
}

async function readJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, { error: 'body_too_large' });
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new HttpError(413, { error: 'body_too_large' });
  if (text.trim() === '') return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, { error: 'invalid_json' });
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw new HttpError(400, { error: 'invalid_body', issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  }
  return r.data;
}

function dbFailure(err: unknown): Response {
  const code = (err as { code?: unknown; cause?: { code?: unknown } })?.code ?? (err as { cause?: { code?: unknown } })?.cause?.code;
  const sqlstate = typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code);
  // Log the code only: driver messages can carry bound parameters (user data).
  console.error(`cv-api: database error ${typeof code === 'string' ? code : 'unknown'}`);
  return sqlstate ? json(500, { error: 'internal' }) : json(503, { error: 'database_unavailable' }, { 'Retry-After': '30' });
}

export async function handleApi(request: Request, segments: readonly string[], deps: ApiDeps): Promise<Response> {
  const route = matchRoute(segments);
  if (!route) return notFound();
  const method = request.method.toUpperCase();

  if (route.kind !== 'authed') {
    if (method !== 'GET' && method !== 'HEAD') return json(405, { error: 'method_not_allowed' }, { Allow: 'GET' });
    const handle = deps.getDb();
    if (!handle) return notConfigured();
    try {
      const found = route.kind === 'public-slug' ? await getPublicArtifactBySlug(handle.db, route.slug) : await getLinkArtifactByToken(handle.db, route.token);
      if (!found) return notFound();
      // Link artifacts are unlisted: never indexed. A public one is indexable only by the owner's explicit choice;
      // the future public-page host carries this decision (`artifact.indexable`). On cv-api.madfam.io itself the
      // proxy keeps the API document noindex regardless.
      const index = route.kind === 'public-slug' && found.artifact.indexable;
      return json(200, found, { 'X-Robots-Tag': index ? 'index, follow' : 'noindex, nofollow' });
    } catch (err) {
      return dbFailure(err);
    }
  }

  if (!route.methods.includes(method)) return json(405, { error: 'method_not_allowed' }, { Allow: route.methods.join(', ') });
  const verifier = verifierConfig(deps.env);
  if (!verifier) return notConfigured();
  // `GET /me` answers from the token alone; every other route (including `DELETE /me`) needs the database.
  const tokenOnly = route.name === 'me' && method === 'GET';
  const handle = tokenOnly ? null : deps.getDb();
  if (!tokenOnly && !handle) return notConfigured();

  const auth = await authenticate(request.headers.get('authorization'), verifier);
  if (!auth.ok) return authFailureResponse(auth);
  if (tokenOnly) return json(200, { sub: auth.sub });

  try {
    const nameHint = typeof auth.claims.name === 'string' ? auth.claims.name.slice(0, 200) : undefined;
    const quotas = { ...OWNER_QUOTAS, ...deps.quotas };
    const quota: QuotaCheck = async (table, adding) => {
      const limit = quotas[table];
      if ((await ownerRowCount(handle!.db, auth.sub, table)) + adding > limit) throw new HttpError(429, { error: 'quota_exceeded', resource: table, limit });
    };
    if (route.name === 'items-batch' || route.name === 'me' || route.name === 'me-export') return await dataRights(handle!.db, quota, auth.sub, nameHint, route.name, request);
    if (route.name === 'job-intake') {
      // W5-J: the job ceiling first, so nobody fetches a page they could not save; then the preview (nothing stored).
      const input = await readJson(request);
      await quota('jobs', 1);
      return await intakeResponse(auth.sub, input, deps.intake);
    }
    // W5-H: owner-scoped read of the job, then Symbiosis HCM with the title and state only (server/hcm/route.ts).
    if (route.name === 'job-benchmark') return await jobBenchmark(createRepository(handle!.db), auth.sub, route.ids[0] ?? '', deps.env, deps.hcm);
    return await dispatch(createRepository(handle!.db), quota, auth.sub, nameHint, route.name, route.ids, method, request);
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, err.body);
    if (err instanceof ForeignItemsError) return json(422, { error: 'unknown_item_ids', itemIds: err.ids });
    if (err instanceof SlugTakenError) return json(409, { error: 'slug_taken' });
    if (err instanceof SuspendedError) return json(409, { error: 'suspended' });
    if (err instanceof JobHasArtifactsError) return json(409, { error: 'job_has_artifacts' });
    if (err instanceof PublishLimitError) return json(429, { error: 'publish_limit' }, { 'Retry-After': '3600' });
    return dbFailure(err);
  }
}

function artifactContent(kind: string, value: unknown): ArtifactContent {
  const schema = ARTIFACT_CONTENT[kind as (typeof ARTIFACT_KINDS)[number]];
  return parse(schema, value);
}

async function dispatch(repo: Repository, quota: QuotaCheck, sub: string, nameHint: string | undefined, name: string, ids: string[], method: string, request: Request): Promise<Response> {
  const [id = ''] = ids;
  const url = new URL(request.url);
  switch (name) {
    case 'profile': {
      if (method === 'GET') {
        const { profile, items } = await repo.getProfile(sub);
        return json(200, { profile: profile ? view(profile) : null, items: items.map(view) });
      }
      const body = parse(profileBody, await readJson(request));
      return json(200, { profile: view(await repo.putProfile(sub, { ...body, translations: profileTexts(body.translations, body.locale) }, nameHint)) });
    }
    case 'items': {
      if (method === 'GET') return json(200, { items: (await repo.listItems(sub)).map(view) });
      const body = parse(itemCreateBody, await readJson(request));
      const content = parse(ITEM_CONTENT[body.kind], body.content);
      const translations = itemTexts(body.kind, body.translations) ?? null;
      await quota('items', 1);
      return json(201, { item: view(await repo.createItem(sub, { ...body, content, translations }, nameHint)) });
    }
    case 'items-reorder': {
      const body = parse(itemReorderBody, await readJson(request));
      return json(200, { items: (await repo.reorderItems(sub, body.itemIds)).map(view) });
    }
    case 'item': {
      const existing = await repo.getItem(sub, id);
      if (!existing) return notFound();
      if (method === 'GET') return json(200, { item: view(existing) });
      if (method === 'DELETE') return (await repo.deleteItem(sub, id)) ? json(204, null) : notFound();
      const patch = parse(itemPatchBody, await readJson(request));
      const content = patch.content === undefined ? undefined : parse(ITEM_CONTENT[existing.kind as keyof typeof ITEM_CONTENT], patch.content);
      const translations = itemTexts(existing.kind as keyof typeof ITEM_CONTENT, patch.translations);
      const { translations: _sent, ...rest } = patch;
      const row = await repo.updateItem(sub, id, { ...rest, ...(content === undefined ? {} : { content }), ...(translations === undefined ? {} : { translations }) });
      return row ? json(200, { item: view(row) }) : notFound();
    }
    case 'jobs': {
      if (method === 'GET') return json(200, { jobs: (await repo.listJobs(sub)).map(view) });
      const body = parse(jobCreateBody, await readJson(request));
      await quota('jobs', 1);
      return json(201, { job: view(await repo.createJob(sub, body)) });
    }
    case 'job': {
      if (method === 'GET') {
        const row = await repo.getJob(sub, id);
        return row ? json(200, { job: view(row) }) : notFound();
      }
      if (method === 'DELETE') return (await repo.deleteJob(sub, id)) ? json(204, null) : notFound();
      const patch = parse(jobPatchBody, await readJson(request));
      // W5-J: the salary rules hold for the stored row merged with the patch (same 400 shape as zod's).
      if (['salaryMin', 'salaryMax', 'salaryCurrency', 'salaryPeriod'].some((k) => k in patch)) {
        const existing = await repo.getJob(sub, id);
        if (!existing) return notFound();
        const issue = salaryIssue({ ...existing, ...patch });
        if (issue) throw new HttpError(400, { error: 'invalid_body', issues: [issue] });
      }
      const row = await repo.updateJob(sub, id, patch);
      return row ? json(200, { job: view(row) }) : notFound();
    }
    case 'job-match': {
      const job = await repo.getJob(sub, id);
      if (!job) return notFound();
      return json(200, { jobId: job.id, ...matchItems(job, await repo.itemsForMatch(sub)) });
    }
    case 'artifacts': {
      if (method === 'GET') {
        const jobId = url.searchParams.get('job_id') ?? undefined;
        const kind = url.searchParams.get('kind') ?? undefined;
        if (jobId !== undefined && !UUID.test(jobId)) return json(400, { error: 'invalid_query', field: 'job_id' });
        if (kind !== undefined && !(ARTIFACT_KINDS as readonly string[]).includes(kind)) return json(400, { error: 'invalid_query', field: 'kind' });
        return json(200, { artifacts: (await repo.listArtifacts(sub, { jobId, kind })).map(view) });
      }
      const body = parse(artifactCreateBody, await readJson(request));
      const content = artifactContent(body.kind, body.content);
      await quota('artifacts', 1);
      const row = await repo.createArtifact(sub, { ...body, content });
      // A job id that is absent or another person's: the same 404 as any other foreign id.
      return row ? json(201, { artifact: view(row) }) : notFound();
    }
    case 'artifacts-batch': {
      const body = parse(artifactSetBody, await readJson(request));
      const items = body.artifacts.map((a) => ({ kind: a.kind, title: a.title, content: artifactContent(a.kind, a.content), template: a.template }));
      await quota('artifacts', items.length);
      const rows = await repo.createArtifactSet(sub, { jobId: body.jobId, locale: body.locale, template: body.template, artifacts: items });
      return rows ? json(201, { artifacts: rows.map(view) }) : notFound();
    }
    case 'artifact': {
      const existing = await repo.getArtifact(sub, id);
      if (!existing) return notFound();
      if (method === 'GET') return json(200, { artifact: view(existing) });
      if (method === 'DELETE') return (await repo.deleteArtifact(sub, id)) ? json(204, null) : notFound();
      const patch = parse(artifactPatchBody, await readJson(request));
      // W4-T: the template allowlist needs the stored kind (a PATCH carries none); same 400 shape as zod's.
      const templateProblem = patch.template === undefined ? null : templateIssue(existing.kind, patch.template);
      if (templateProblem) throw new HttpError(400, { error: 'invalid_body', issues: [{ path: 'template', message: templateProblem }] });
      const content = patch.content === undefined ? undefined : artifactContent(existing.kind, patch.content);
      const row = await repo.updateArtifact(sub, id, { ...patch, content });
      return row ? json(200, { artifact: view(row) }) : notFound();
    }
    case 'artifact-publish': {
      const target = parse(publishBody, await readJson(request));
      const row = await repo.publishArtifact(sub, id, target);
      return row ? json(200, { artifact: view(row) }) : notFound();
    }
    case 'artifact-unpublish': {
      const row = await repo.unpublishArtifact(sub, id);
      return row ? json(200, { artifact: view(row) }) : notFound();
    }
  }
  return notFound();
}

/**
 * W4-I: the import batch, the export and the deletion (server/db/data-rights.ts), owner-scoped like everything else.
 * - `POST /profile/items/batch`: every item validated against its kind before anything is written; then the owner's
 *   item ceiling (429 `quota_exceeded`); then one transaction (all or none). 201 with the created items and the profile.
 * - `GET /me/export[?format=full|json-resume]`: a download (`Content-Disposition: attachment`), never cached.
 * - `DELETE /me` with `{"confirm":"delete-all-my-data"}`: every row of the owner, in one transaction; 200 with counts.
 */
async function dataRights(db: Parameters<typeof createDataRights>[0], quota: QuotaCheck, sub: string, nameHint: string | undefined, name: string, request: Request): Promise<Response> {
  const rights = createDataRights(db);
  if (name === 'items-batch') {
    const body = parse(itemBatchBody, await readJson(request));
    const items = body.items.map((it, i) => {
      const r = ITEM_CONTENT[it.kind].safeParse(it.content);
      if (!r.success) {
        throw new HttpError(400, { error: 'invalid_body', issues: r.error.issues.map((x) => ({ path: ['items', i, 'content', ...x.path].join('.'), message: x.message })) });
      }
      return { kind: it.kind, content: r.data, tags: it.tags };
    });
    // W4-S ceiling: an import never takes the owner past OWNER_QUOTAS.items (429 quota_exceeded, nothing written).
    await quota('items', items.length);
    const { profile, items: rows } = await rights.importItems(sub, { items, profile: body.profile }, nameHint);
    return json(201, { profile: view(profile), items: rows.map(view) });
  }
  if (name === 'me-export') {
    const raw = new URL(request.url).searchParams.get('format') ?? 'full';
    if (!(EXPORT_FORMATS as readonly string[]).includes(raw)) return json(400, { error: 'invalid_query', field: 'format' });
    const format = raw as ExportFormat;
    // W7 (B4): `locale` picks the language of a JSON Resume (absent: the profile's primary language).
    const locale = new URL(request.url).searchParams.get('locale');
    if (locale !== null && !(LOCALES as readonly string[]).includes(locale)) return json(400, { error: 'invalid_query', field: 'locale' });
    const now = new Date();
    const data = await rights.exportAll(sub);
    const doc = format === 'json-resume' ? toJsonResume(data, now, locale === null ? undefined : (locale as ContentLocale)) : fullExport(data, now);
    return new Response(JSON.stringify(doc, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="${exportFilename(format, now, locale ?? undefined)}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
  // DELETE /me
  parse(deleteMeBody, await readJson(request));
  return json(200, { deleted: await rights.deleteAll(sub) });
}

/**
 * W7 (B4): the header's translations as stored. Undefined (not sent) keeps the stored ones; null clears them. A
 * translation keyed by the profile's own primary locale is refused (400): that text belongs in the fields themselves.
 */
function profileTexts(raw: unknown, primary: string): Translations | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (raw && typeof raw === 'object' && primary in raw) {
    throw new HttpError(400, { error: 'invalid_body', issues: [{ path: `translations.${primary}`, message: 'the primary language is written in the fields themselves' }] });
  }
  return cleanTranslations(raw, HEADER_TEXT_FIELDS);
}

/** W7 (B4): one item's translations, validated against its kind's word fields (`ITEM_TRANSLATIONS`), as stored. */
function itemTexts(kind: keyof typeof ITEM_CONTENT, raw: unknown): Translations | null | undefined {
  if (raw === undefined) return undefined;
  const r = ITEM_TRANSLATIONS[kind].safeParse(raw);
  if (!r.success) throw new HttpError(400, { error: 'invalid_body', issues: r.error.issues.map((x) => ({ path: ['translations', ...x.path].join('.'), message: x.message })) });
  return r.data === null ? null : cleanTranslations(r.data, ITEM_TEXT_FIELDS[kind]);
}
