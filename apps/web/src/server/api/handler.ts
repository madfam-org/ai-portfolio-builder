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
  SlugTakenError,
  SuspendedError,
  createRepository,
  getLinkArtifactByToken,
  getPublicArtifactBySlug,
  type Repository,
} from '../db/repository.ts';
import { ARTIFACT_KINDS } from '../db/schema.ts';
import { authFailureResponse, authenticate } from '../janua.ts';
import { UUID, matchRoute } from '../../lib/api-routes.ts';
import { matchItems } from './match.ts';
import {
  ARTIFACT_CONTENT,
  ITEM_CONTENT,
  artifactCreateBody,
  artifactPatchBody,
  itemCreateBody,
  itemPatchBody,
  jobCreateBody,
  jobPatchBody,
  profileBody,
  publishBody,
  type ArtifactContent,
} from './validation.ts';

type Env = Readonly<Record<string, string | undefined>>;

export interface ApiDeps {
  env: Env;
  getDb: () => DbHandle | null;
}

const MAX_BODY_BYTES = 256 * 1024;

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
  const handle = route.name === 'me' ? null : deps.getDb();
  if (route.name !== 'me' && !handle) return notConfigured();

  const auth = await authenticate(request.headers.get('authorization'), verifier);
  if (!auth.ok) return authFailureResponse(auth);
  if (route.name === 'me') return json(200, { sub: auth.sub });

  try {
    const nameHint = typeof auth.claims.name === 'string' ? auth.claims.name.slice(0, 200) : undefined;
    return await dispatch(createRepository(handle!.db), auth.sub, nameHint, route.name, route.ids, method, request);
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, err.body);
    if (err instanceof ForeignItemsError) return json(422, { error: 'unknown_item_ids', itemIds: err.ids });
    if (err instanceof SlugTakenError) return json(409, { error: 'slug_taken' });
    if (err instanceof SuspendedError) return json(409, { error: 'suspended' });
    if (err instanceof JobHasArtifactsError) return json(409, { error: 'job_has_artifacts' });
    return dbFailure(err);
  }
}

function artifactContent(kind: string, value: unknown): ArtifactContent {
  const schema = ARTIFACT_CONTENT[kind as (typeof ARTIFACT_KINDS)[number]];
  return parse(schema, value);
}

async function dispatch(repo: Repository, sub: string, nameHint: string | undefined, name: string, ids: string[], method: string, request: Request): Promise<Response> {
  const [id = ''] = ids;
  const url = new URL(request.url);
  switch (name) {
    case 'profile': {
      if (method === 'GET') {
        const { profile, items } = await repo.getProfile(sub);
        return json(200, { profile: profile ? view(profile) : null, items: items.map(view) });
      }
      const body = parse(profileBody, await readJson(request));
      return json(200, { profile: view(await repo.putProfile(sub, body, nameHint)) });
    }
    case 'items': {
      if (method === 'GET') return json(200, { items: (await repo.listItems(sub)).map(view) });
      const body = parse(itemCreateBody, await readJson(request));
      const content = parse(ITEM_CONTENT[body.kind], body.content);
      return json(201, { item: view(await repo.createItem(sub, { ...body, content }, nameHint)) });
    }
    case 'item': {
      const existing = await repo.getItem(sub, id);
      if (!existing) return notFound();
      if (method === 'GET') return json(200, { item: view(existing) });
      if (method === 'DELETE') return (await repo.deleteItem(sub, id)) ? json(204, null) : notFound();
      const patch = parse(itemPatchBody, await readJson(request));
      const content = patch.content === undefined ? undefined : parse(ITEM_CONTENT[existing.kind as keyof typeof ITEM_CONTENT], patch.content);
      const row = await repo.updateItem(sub, id, { ...patch, ...(content === undefined ? {} : { content }) });
      return row ? json(200, { item: view(row) }) : notFound();
    }
    case 'jobs': {
      if (method === 'GET') return json(200, { jobs: (await repo.listJobs(sub)).map(view) });
      const body = parse(jobCreateBody, await readJson(request));
      return json(201, { job: view(await repo.createJob(sub, body)) });
    }
    case 'job': {
      if (method === 'GET') {
        const row = await repo.getJob(sub, id);
        return row ? json(200, { job: view(row) }) : notFound();
      }
      if (method === 'DELETE') return (await repo.deleteJob(sub, id)) ? json(204, null) : notFound();
      const row = await repo.updateJob(sub, id, parse(jobPatchBody, await readJson(request)));
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
      const row = await repo.createArtifact(sub, { ...body, content: artifactContent(body.kind, body.content) });
      // A job id that is absent or another person's: the same 404 as any other foreign id.
      return row ? json(201, { artifact: view(row) }) : notFound();
    }
    case 'artifact': {
      const existing = await repo.getArtifact(sub, id);
      if (!existing) return notFound();
      if (method === 'GET') return json(200, { artifact: view(existing) });
      if (method === 'DELETE') return (await repo.deleteArtifact(sub, id)) ? json(204, null) : notFound();
      const patch = parse(artifactPatchBody, await readJson(request));
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
