/**
 * The jobs pipeline, as pure data (W3-3): the order of the statuses, the columns of the board, the client-side checks
 * of the intake form and the mapping of the API's zod issues onto those fields. No React and no server import, so the
 * unit tests run it directly (relative `.ts` imports only).
 */
import type { JobStatus } from '../../lib/copy/app.ts';

/** The pipeline, in order (W2 `JOB_STATUSES`; a unit test keeps them equal). */
export const PIPELINE: readonly JobStatus[] = ['saved', 'applying', 'applied', 'interview', 'offer', 'rejected', 'archived'];

/** Size cap of a pasted posting, in characters (W2 `SOURCE_TEXT_MAX`; a unit test keeps them equal). */
export const POSTING_MAX = 50_000;
export const TITLE_MAX = 200;
export const NOTES_MAX = 5_000;

export interface PipelineColumn<J> {
  status: JobStatus;
  jobs: J[];
}

/**
 * One column per status, in pipeline order, each with its jobs (newest change first). `archived` is a column only
 * when `showArchived` is on; the count of archived jobs is returned either way so the toggle can say how many hide.
 */
export function pipelineColumns<J extends { status: JobStatus; updatedAt: string }>(
  jobs: readonly J[],
  showArchived: boolean,
): { columns: PipelineColumn<J>[]; archivedCount: number } {
  const byStatus = new Map<JobStatus, J[]>(PIPELINE.map((s) => [s, []]));
  for (const job of jobs) byStatus.get(job.status)?.push(job);
  for (const list of byStatus.values()) list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const columns = PIPELINE.filter((s) => s !== 'archived' || showArchived).map((status) => ({ status, jobs: byStatus.get(status) ?? [] }));
  return { columns, archivedCount: byStatus.get('archived')?.length ?? 0 };
}

export type JobField = 'title' | 'company' | 'location' | 'sourceUrl' | 'sourceText' | 'notes';
export type JobFieldError = 'required' | 'tooLong' | 'url';

export interface JobFormValues {
  title: string;
  company: string;
  location: string;
  sourceUrl: string;
  sourceText: string;
  notes: string;
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** The same rules as W2's `jobCreateBody`, checked before sending so errors sit next to their fields. */
export function checkJobForm(v: JobFormValues): Partial<Record<JobField, JobFieldError>> {
  const errors: Partial<Record<JobField, JobFieldError>> = {};
  if (v.title.trim() === '') errors.title = 'required';
  else if (v.title.trim().length > TITLE_MAX) errors.title = 'tooLong';
  if (v.company.trim().length > TITLE_MAX) errors.company = 'tooLong';
  if (v.location.trim().length > TITLE_MAX) errors.location = 'tooLong';
  if (v.sourceUrl.trim() !== '' && !isHttpUrl(v.sourceUrl.trim())) errors.sourceUrl = 'url';
  if (v.sourceText.trim() === '') errors.sourceText = 'required';
  else if (v.sourceText.trim().length > POSTING_MAX) errors.sourceText = 'tooLong';
  if (v.notes.trim().length > NOTES_MAX) errors.notes = 'tooLong';
  return errors;
}

/** The request body of a create or a full edit (empty URL → null: the link is optional). */
export function jobBody(v: JobFormValues): { title: string; company: string; location: string; sourceUrl: string | null; sourceText: string; notes: string } {
  return {
    title: v.title.trim(),
    company: v.company.trim(),
    location: v.location.trim(),
    sourceUrl: v.sourceUrl.trim() === '' ? null : v.sourceUrl.trim(),
    sourceText: v.sourceText.trim(),
    notes: v.notes.trim(),
  };
}

/** The API's zod issues (`path` = the body field) as field errors; anything else stays a page-level error. */
export function issuesToFields(issues: readonly { path: string; message: string }[] | undefined): Partial<Record<JobField, JobFieldError>> {
  const out: Partial<Record<JobField, JobFieldError>> = {};
  const fields: readonly JobField[] = ['title', 'company', 'location', 'sourceUrl', 'sourceText', 'notes'];
  for (const issue of issues ?? []) {
    const field = fields.find((f) => issue.path === f);
    if (!field || out[field]) continue;
    out[field] = field === 'sourceUrl' ? 'url' : /too[_ ]big|at most|<=|maximum/i.test(issue.message) ? 'tooLong' : 'required';
  }
  return out;
}

/** The visible host of a reference link (never fetched; shown so the person sees where it points). */
export function linkHost(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}
