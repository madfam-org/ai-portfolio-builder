/**
 * W5-J: the intake call (`POST /api/v1/jobs/intake` through cv-app's same-origin proxy) and the preview → job body
 * mapping. Results, not exceptions, like lib/client/api.ts; the failure keeps the API's `reason`, `board`, `status` and
 * `retryAfter` so the page can say exactly what happened.
 */
import { errorKind, type ApiErrorKind } from '../../../lib/client/api.ts';
import type { EmploymentType, IntakeDraft, IntakeFailure, IntakeInput, JobCreateInput, SalaryPeriod, WorkMode } from '../../../lib/client/types.ts';

export type IntakeOutcome =
  | { ok: true; draft: IntakeDraft }
  | { ok: false; kind: ApiErrorKind; code: string | null; reason: IntakeFailure | null; board: string | null; status: number | null; retryAfter: number | null; resource: string | null };

export async function postIntake(body: IntakeInput, fetchImpl: typeof fetch = (i, init) => fetch(i, init)): Promise<IntakeOutcome> {
  let res: Response;
  try {
    res = await fetchImpl('/api/v1/jobs/intake', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, kind: 'network', code: null, reason: null, board: null, status: null, retryAfter: null, resource: null };
  }
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  if (res.ok && json.draft) return { ok: true, draft: json.draft as IntakeDraft };
  const code = typeof json.error === 'string' ? json.error : null;
  return {
    ok: false,
    kind: errorKind(res.status, code),
    code,
    reason: typeof json.reason === 'string' ? (json.reason as IntakeFailure) : null,
    board: typeof json.board === 'string' ? json.board : null,
    status: typeof json.status === 'number' ? json.status : null,
    retryAfter: typeof json.retryAfter === 'number' ? json.retryAfter : null,
    resource: typeof json.resource === 'string' ? json.resource : null,
  };
}

/** The editable preview, as strings (what the form holds). */
export interface PreviewValues {
  title: string;
  company: string;
  location: string;
  countryCode: string;
  stateCode: string;
  employmentType: string;
  workMode: string;
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  salaryPeriod: string;
  datePosted: string;
  validThrough: string;
  sourceUrl: string;
  sourceText: string;
}

export type PreviewKey = keyof PreviewValues;
export const DRAFT_KEYS = ['title', 'company', 'location', 'countryCode', 'stateCode', 'employmentType', 'workMode', 'salaryMin', 'salaryMax', 'salaryCurrency', 'salaryPeriod', 'datePosted', 'validThrough'] as const;

export function previewFromDraft(d: IntakeDraft): PreviewValues {
  const f = d.fields;
  const s = (v: string | number | undefined) => (v === undefined ? '' : String(v));
  return {
    title: s(f.title?.value),
    company: s(f.company?.value),
    location: s(f.location?.value),
    countryCode: s(f.countryCode?.value),
    stateCode: s(f.stateCode?.value),
    employmentType: s(f.employmentType?.value),
    workMode: s(f.workMode?.value),
    salaryMin: s(f.salaryMin?.value),
    salaryMax: s(f.salaryMax?.value),
    salaryCurrency: s(f.salaryCurrency?.value),
    salaryPeriod: s(f.salaryPeriod?.value),
    datePosted: s(f.datePosted?.value),
    validThrough: s(f.validThrough?.value),
    sourceUrl: d.sourceUrl ?? '',
    sourceText: d.sourceText,
  };
}

const nul = (v: string) => (v.trim() === '' ? null : v.trim());
const amount = (v: string) => {
  const t = v.trim().replace(/,/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

/** The job body the preview saves (the API validates it again; invalid values come back as field issues). */
export function jobFromPreview(v: PreviewValues, sourceKind: IntakeDraft['sourceKind']): JobCreateInput {
  return {
    title: v.title.trim(),
    company: v.company.trim(),
    location: v.location.trim(),
    sourceUrl: nul(v.sourceUrl),
    sourceText: v.sourceText.trim(),
    status: 'saved',
    sourceKind,
    countryCode: nul(v.countryCode)?.toUpperCase() ?? null,
    stateCode: nul(v.stateCode),
    employmentType: nul(v.employmentType) as EmploymentType | null,
    workMode: nul(v.workMode) as WorkMode | null,
    salaryMin: amount(v.salaryMin),
    salaryMax: amount(v.salaryMax),
    salaryCurrency: nul(v.salaryCurrency)?.toUpperCase() ?? null,
    salaryPeriod: nul(v.salaryPeriod) as SalaryPeriod | null,
    datePosted: nul(v.datePosted),
    validThrough: nul(v.validThrough),
  };
}
