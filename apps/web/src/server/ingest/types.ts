/**
 * W5-J: the intake PREVIEW (a draft job, never stored) that `POST /api/v1/jobs/intake` returns. Each structured field
 * carries where it came from, so the person sees «de JSON-LD», «del texto» … next to it and corrects it before saving.
 * Type-only for the browser (lib/client/types.ts re-exports it).
 */
import type { EmploymentType, Provenance, SalaryPeriod, SourceKind, WorkMode } from './vocab.ts';

export interface DraftField<T> {
  value: T;
  from: Provenance;
}

export interface DraftFields {
  title?: DraftField<string>;
  company?: DraftField<string>;
  location?: DraftField<string>;
  countryCode?: DraftField<string>;
  stateCode?: DraftField<string>;
  employmentType?: DraftField<EmploymentType>;
  workMode?: DraftField<WorkMode>;
  salaryMin?: DraftField<number>;
  salaryMax?: DraftField<number>;
  salaryCurrency?: DraftField<string>;
  salaryPeriod?: DraftField<SalaryPeriod>;
  datePosted?: DraftField<string>;
  validThrough?: DraftField<string>;
}

/** The public ATS APIs cv reads (ats.ts), each documented as public and key-free by its provider. */
export const ATS_PROVIDERS = ['greenhouse', 'lever', 'smartrecruiters', 'ashby', 'workable', 'recruitee', 'pinpoint'] as const;
export type AtsProvider = (typeof ATS_PROVIDERS)[number];

/** Notes shown with the preview (copy/ingest.ts). */
export type IntakeNote =
  | 'several_postings'
  | 'text_truncated'
  | 'title_missing'
  | 'no_structured_data'
  | 'ats_fallback'
  | 'salary_partial';

export interface IntakeDraft {
  sourceKind: SourceKind;
  /** The posting's address, when it came from a link or a capture (https or http, shown and stored as a reference). */
  sourceUrl: string | null;
  /** The ATS whose public API answered, if any. */
  provider: AtsProvider | null;
  fields: DraftFields;
  /** The posting text (the job's `sourceText`; the match reads it). */
  sourceText: string;
  sourceTextFrom: Provenance;
  notes: IntakeNote[];
}

/** Why an intake produced no draft (copy/ingest.ts says it honestly and offers paste, upload or capture). */
export type IntakeFailure =
  | 'unreadable'
  | 'capture_only'
  | 'robots_disallowed'
  | 'robots_unreachable'
  | 'invalid_url'
  | 'not_https'
  | 'bad_port'
  | 'credentials'
  | 'blocked_host'
  | 'private_address'
  | 'dns_failed'
  | 'too_many_redirects'
  | 'http_status'
  | 'blocked_by_site'
  | 'unsupported_type'
  | 'too_large'
  | 'timeout'
  | 'network';
