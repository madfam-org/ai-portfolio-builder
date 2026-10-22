/**
 * The cv-app's typed data layer: plain `fetch` to the SAME-ORIGIN proxy `/api/v1/*` that W2 built (the browser's
 * host-only session cookie goes along; the proxy adds the person's access token on the server). Usable from client
 * components; no server import (types only).
 *
 * Every call returns a result, never throws: `{ ok: true, data }` or `{ ok: false, error }`, where `error.kind` is
 * the state a page must show:
 * - `not_configured` (503 not_configured): sign-in or the database is not configured yet (the dormant default);
 * - `not_signed_in` (401): the session ended; `forbidden` (403); `not_found` (404, also another person's id);
 * - `invalid` (400/413/422, with `issues` or `itemIds`); `conflict` (409: slug_taken, suspended, job_has_artifacts);
 * - `rate_limited` (429); `unavailable` (503 database_unavailable, or any 5xx); `network` (fetch failed); `error`.
 */
import type {
  ArtifactCreateInput,
  ArtifactDto,
  ArtifactPatchInput,
  ArtifactSetInput,
  ItemBatchInput,
  ItemCreateInput,
  ItemDto,
  ItemPatchInput,
  JobCreateInput,
  JobDto,
  JobPatchInput,
  MatchDto,
  ProfileDto,
  ProfileInput,
  PublishInput,
} from './types.ts';

export type ApiErrorKind =
  | 'not_configured'
  | 'not_signed_in'
  | 'forbidden'
  | 'not_found'
  | 'invalid'
  | 'conflict'
  | 'rate_limited'
  | 'unavailable'
  | 'network'
  | 'error';

export interface ApiError {
  kind: ApiErrorKind;
  status: number;
  /** The API's own error code (`slug_taken`, `invalid_body`, ...), when it sent one. */
  code: string | null;
  issues?: { path: string; message: string }[];
  itemIds?: string[];
}

export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; error: ApiError };

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export function errorKind(status: number, code: string | null): ApiErrorKind {
  if (status === 503 && code === 'not_configured') return 'not_configured';
  if (status === 401) return 'not_signed_in';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 400 || status === 413 || status === 422) return 'invalid';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'unavailable';
  return 'error';
}

/** Builds the client. `fetchImpl` and `base` exist for tests; pages use the default `api` below. */
export function createApiClient(fetchImpl: Fetch = (i, init) => fetch(i, init), base = '/api/v1') {
  async function call<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method,
        cache: 'no-store',
        credentials: 'same-origin',
        headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      return { ok: false, error: { kind: 'network', status: 0, code: null } };
    }
    const text = await res.text().catch(() => '');
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        json = null;
      }
    }
    if (res.ok) return { ok: true, status: res.status, data: json as T };
    const rec = (json && typeof json === 'object' ? json : {}) as { error?: unknown; issues?: unknown; itemIds?: unknown };
    const code = typeof rec.error === 'string' ? rec.error : null;
    const error: ApiError = { kind: errorKind(res.status, code), status: res.status, code };
    if (Array.isArray(rec.issues)) error.issues = rec.issues as ApiError['issues'];
    if (Array.isArray(rec.itemIds)) error.itemIds = rec.itemIds as string[];
    return { ok: false, error };
  }

  const id = (value: string) => encodeURIComponent(value);
  const query = (params: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined)).toString();
    return q ? `?${q}` : '';
  };

  return {
    me: () => call<{ sub: string }>('GET', '/me'),

    getProfile: () => call<{ profile: ProfileDto | null; items: ItemDto[] }>('GET', '/profile'),
    putProfile: (body: ProfileInput) => call<{ profile: ProfileDto }>('PUT', '/profile', body),
    listItems: () => call<{ items: ItemDto[] }>('GET', '/profile/items'),
    createItem: (body: ItemCreateInput) => call<{ item: ItemDto }>('POST', '/profile/items', body),
    getItem: (itemId: string) => call<{ item: ItemDto }>('GET', `/profile/items/${id(itemId)}`),
    updateItem: (itemId: string, body: ItemPatchInput) => call<{ item: ItemDto }>('PATCH', `/profile/items/${id(itemId)}`, body),
    deleteItem: (itemId: string) => call<null>('DELETE', `/profile/items/${id(itemId)}`),
    /** Positions 0..n-1 in the given order, in one transaction. */
    reorderItems: (itemIds: string[]) => call<{ items: ItemDto[] }>('POST', '/profile/items/reorder', { itemIds }),

    listJobs: () => call<{ jobs: JobDto[] }>('GET', '/jobs'),
    createJob: (body: JobCreateInput) => call<{ job: JobDto }>('POST', '/jobs', body),
    getJob: (jobId: string) => call<{ job: JobDto }>('GET', `/jobs/${id(jobId)}`),
    updateJob: (jobId: string, body: JobPatchInput) => call<{ job: JobDto }>('PATCH', `/jobs/${id(jobId)}`, body),
    /** 409 `job_has_artifacts` while artifacts still point at it (never a silent cascade). */
    deleteJob: (jobId: string) => call<null>('DELETE', `/jobs/${id(jobId)}`),
    match: (jobId: string) => call<MatchDto>('GET', `/jobs/${id(jobId)}/match`),

    listArtifacts: (filter: { jobId?: string; kind?: string } = {}) => call<{ artifacts: ArtifactDto[] }>('GET', `/artifacts${query({ job_id: filter.jobId, kind: filter.kind })}`),
    createArtifact: (body: ArtifactCreateInput) => call<{ artifact: ArtifactDto }>('POST', '/artifacts', body),
    /** Several artifacts for one job, all or none (one transaction). */
    createArtifactSet: (body: ArtifactSetInput) => call<{ artifacts: ArtifactDto[] }>('POST', '/artifacts/batch', body),
    getArtifact: (artifactId: string) => call<{ artifact: ArtifactDto }>('GET', `/artifacts/${id(artifactId)}`),
    updateArtifact: (artifactId: string, body: ArtifactPatchInput) => call<{ artifact: ArtifactDto }>('PATCH', `/artifacts/${id(artifactId)}`, body),
    deleteArtifact: (artifactId: string) => call<null>('DELETE', `/artifacts/${id(artifactId)}`),
    /** `{visibility:'link'}` (a fresh token each time: «Cambiar enlace») or `{visibility:'public', slug, indexable?}`. */
    publishArtifact: (artifactId: string, body: PublishInput) => call<{ artifact: ArtifactDto }>('POST', `/artifacts/${id(artifactId)}/publish`, body),
    unpublishArtifact: (artifactId: string) => call<{ artifact: ArtifactDto }>('POST', `/artifacts/${id(artifactId)}/unpublish`),

    // W4-I: import, export, deletion.
    /** The confirmed import: items (and chosen header fields), all or none. */
    importItems: (body: ItemBatchInput) => call<{ profile: ProfileDto; items: ItemDto[] }>('POST', '/profile/items/batch', body),
    /** Everything the person holds (`full`) or their profile as JSON Resume; the parsed document. */
    exportMine: (format: 'full' | 'json-resume' = 'full') => call<Record<string, unknown>>('GET', `/me/export${query({ format: format === 'full' ? undefined : format })}`),
    /** Deletes every row the person holds (profile, items, jobs, documents, publications). */
    deleteMine: () => call<{ deleted: { profiles: number; items: number; jobs: number; artifacts: number } }>('DELETE', '/me', { confirm: 'delete-all-my-data' }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** The client the pages use. */
export const api: ApiClient = createApiClient();

/** The message a page shows for a failed call (copy/app.ts `states`). */
export function apiErrorMessage(error: ApiError, states: Record<'notConfigured' | 'notSignedIn' | 'notFound' | 'invalid' | 'conflict' | 'rateLimited' | 'unavailable' | 'network' | 'error', string>): string {
  switch (error.kind) {
    case 'not_configured':
      return states.notConfigured;
    case 'not_signed_in':
      return states.notSignedIn;
    case 'not_found':
      return states.notFound;
    case 'invalid':
      return states.invalid;
    case 'conflict':
      return states.conflict;
    case 'rate_limited':
      return states.rateLimited;
    case 'unavailable':
      return states.unavailable;
    case 'network':
      return states.network;
    default:
      return states.error;
  }
}
