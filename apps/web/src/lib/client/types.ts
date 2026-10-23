/**
 * The JSON shapes the cv API returns (docs/PRODUCT.md), as the browser sees them: timestamps are ISO strings, the
 * owner key is never present (the handler strips it). Request bodies are the zod INPUT types of
 * server/api/validation.ts, imported as types only, so no server code reaches a client bundle.
 */
import type { z } from 'zod';
import type {
  artifactCreateBody,
  artifactPatchBody,
  artifactSetBody,
  itemBatchBody,
  itemCreateBody,
  itemPatchBody,
  itemReorderBody,
  jobCreateBody,
  jobPatchBody,
  profileBody,
  publishBody,
  ArtifactContent,
} from '../../server/api/validation.ts';
import type { ArtifactKind, ArtifactStatus, ItemKind, JobStatus } from '../copy/app.ts';
import type { EmploymentType, Provenance, SalaryPeriod, SourceKind, WorkMode } from '../../server/ingest/vocab.ts';
import type { DraftField, DraftFields, IntakeDraft, IntakeFailure, IntakeNote } from '../../server/ingest/types.ts';
import type { IntakeBody } from '../../server/ingest/intake.ts';
import type { BenchmarkView } from '../../server/hcm/route.ts';
import type { Translations } from '../profile-text.ts';

export type { ArtifactContent, ArtifactKind, ArtifactStatus, ItemKind, JobStatus, Translations };
export type ContentLocale = 'es-MX' | 'en';

export interface ContactDto {
  email?: string;
  phone?: string;
  location?: string;
  links?: { label: string; url: string }[];
}

export interface ProfileDto {
  id: string;
  displayName: string;
  headline: string;
  summary: string;
  locale: ContentLocale;
  contact: ContactDto;
  /** W7 (B4): the header's text in the other language (lib/profile-text.ts); null or absent: none. */
  translations?: Translations | null;
  createdAt: string;
  updatedAt: string;
}

export interface ItemDto {
  id: string;
  profileId: string;
  kind: ItemKind;
  position: number;
  /** Per-kind content (server/api/validation.ts ITEM_CONTENT). */
  content: Record<string, unknown>;
  tags: string[];
  /** W7 (B4): the item's word fields in the other language (lib/profile-text.ts); null or absent: none. */
  translations?: Translations | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobDto {
  id: string;
  title: string;
  company: string;
  location: string;
  sourceUrl: string | null;
  sourceText: string;
  /** Filled by Selva in W6; null now. */
  parsed: unknown;
  status: JobStatus;
  notes: string;
  /** W5-J typed posting fields (null when not stated, and on jobs created before W5-J). */
  sourceKind: SourceKind | null;
  countryCode: string | null;
  stateCode: string | null;
  employmentType: EmploymentType | null;
  workMode: WorkMode | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: SalaryPeriod | null;
  datePosted: string | null;
  validThrough: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ArtifactDto {
  id: string;
  jobId: string | null;
  kind: ArtifactKind;
  title: string;
  locale: ContentLocale;
  template: string;
  status: ArtifactStatus;
  visibility: 'private' | 'link' | 'public';
  shareToken: string | null;
  slug: string | null;
  content: ArtifactContent;
  indexable: boolean;
  publishedAt: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `GET /api/v1/jobs/:id/match` (keyword-overlap-v1, no AI). */
export interface MatchDto {
  jobId: string;
  algorithm: 'keyword-overlap-v1';
  jobTerms: number;
  coveredTerms: number;
  items: { itemId: string; kind: ItemKind; score: number; matchedTags: string[]; matchedTerms: string[] }[];
  missingTerms: string[];
}

export type ProfileInput = z.input<typeof profileBody>;
export type ItemCreateInput = z.input<typeof itemCreateBody>;
export type ItemPatchInput = z.input<typeof itemPatchBody>;
export type ItemReorderInput = z.input<typeof itemReorderBody>;
export type JobCreateInput = z.input<typeof jobCreateBody>;
export type JobPatchInput = z.input<typeof jobPatchBody>;
export type ArtifactCreateInput = z.input<typeof artifactCreateBody>;
export type ArtifactSetInput = z.input<typeof artifactSetBody>;
export type ArtifactPatchInput = z.input<typeof artifactPatchBody>;
export type PublishInput = z.input<typeof publishBody>;
export type ItemBatchInput = z.input<typeof itemBatchBody>;

// W5-J job intake (POST /api/v1/jobs/intake): the preview and the request body, types only.
export type { DraftField, DraftFields, EmploymentType, IntakeDraft, IntakeFailure, IntakeNote, Provenance, SalaryPeriod, SourceKind, WorkMode };
export type IntakeInput = IntakeBody;
/**
 * W5-H: `GET /api/v1/jobs/:id/benchmark` — Symbiosis HCM's public INEGI ENOE income range for the job's occupation
 * and state, plus where the posting's own stated monthly MXN salary falls (server/hcm/route.ts BenchmarkView).
 */
export type BenchmarkDto = BenchmarkView;
