/**
 * Request bodies, validated with zod. Every object is `.strict()`: an unknown field is a 400, never silently stored
 * (no mass assignment). `owner_sub`, ids, status, visibility, share tokens, slugs (except where the publish body
 * names one) and timestamps are never accepted from a body: the server sets them.
 */
import { z } from 'zod';
import { isAllowedSlug } from '../../lib/api-routes.ts';
import { ARTIFACT_KINDS, ARTIFACT_STATUSES, JOB_STATUSES, LOCALES, PROFILE_ITEM_KINDS, SOURCE_TEXT_MAX } from '../db/schema.ts';
import { isTemplateFor } from '../../lib/templates.ts';
import { LANGUAGE_CODES } from '../../lib/languages.ts';
import { HEADER_TEXT_FIELDS, ITEM_TEXT_FIELDS } from '../../lib/profile-text.ts';
import {
  COUNTRY_CODE_PATTERN,
  CURRENCY_PATTERN,
  EMPLOYMENT_TYPES,
  MX_STATE_CODES,
  SALARY_MAX_AMOUNT,
  SALARY_PERIODS,
  SOURCE_KINDS,
  STATE_CODE_PATTERN,
  WORK_MODES,
} from '../ingest/vocab.ts';

const text = (max: number) => z.string().trim().max(max);
const required = (max: number) => z.string().trim().min(1).max(max);
const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'must be an http(s) URL');
/** YYYY, YYYY-MM or YYYY-MM-DD. */
const partialDate = z.string().regex(/^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/, 'YYYY, YYYY-MM or YYYY-MM-DD');
const bullets = z.array(text(500)).max(30);
const tags = z.array(z.string().trim().min(1).max(60)).max(50);
const link = z.object({ label: required(120), url: httpUrl }).strict();

export const contactSchema = z
  .object({
    email: z.string().trim().max(320).email().optional(),
    phone: text(60).optional(),
    location: text(200).optional(),
    links: z.array(link).max(20).optional(),
  })
  .strict();

export const profileBody = z
  .object({
    /** Omitted on the first PUT: prefilled from the Janua `name` claim; omitted later: kept. */
    displayName: text(200).optional(),
    headline: text(200).default(''),
    summary: text(5000).default(''),
    locale: z.enum(LOCALES).default('es-MX'),
    contact: contactSchema.default({}),
    /** W7 (B4): the header's text in the other language; omitted keeps the stored one, null clears it. */
    translations: z.lazy(() => profileTranslations).nullable().optional(),
  })
  .strict();

const span = { startDate: partialDate.optional(), endDate: partialDate.nullable().optional() };

/** One content schema per profile item kind; dates live inside the content. */
export const ITEM_CONTENT: Record<(typeof PROFILE_ITEM_KINDS)[number], z.ZodType> = {
  experience: z
    .object({
      role: required(200),
      organization: required(200),
      employmentType: z.enum(['full_time', 'part_time', 'contract', 'freelance', 'internship', 'volunteer', 'other']).optional(),
      location: text(200).optional(),
      ...span,
      current: z.boolean().optional(),
      summary: text(3000).optional(),
      highlights: bullets.optional(),
    })
    .strict(),
  education: z
    .object({ institution: required(200), degree: text(200).optional(), field: text(200).optional(), ...span, summary: text(3000).optional(), highlights: bullets.optional() })
    .strict(),
  skill: z.object({ name: required(120), level: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(), years: z.number().int().min(0).max(80).optional() }).strict(),
  project: z
    .object({ name: required(200), role: text(200).optional(), url: httpUrl.optional(), links: z.array(link).max(20).optional(), ...span, summary: text(3000).optional(), highlights: bullets.optional() })
    .strict(),
  certification: z
    .object({ name: required(200), issuer: text(200).optional(), date: partialDate.optional(), expiresOn: partialDate.optional(), url: httpUrl.optional(), credentialId: text(200).optional() })
    .strict(),
  achievement: z.object({ title: required(200), date: partialDate.optional(), summary: text(3000).optional() }).strict(),
  // W7 (B4): `code` (ISO 639, lib/languages.ts) gives the name in each document's language; `name` stays the fallback.
  language: z.object({ code: z.enum(LANGUAGE_CODES).optional(), name: required(80), level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'native']).optional() }).strict(),
  publication: z.object({ title: required(300), publisher: text(200).optional(), date: partialDate.optional(), url: httpUrl.optional(), summary: text(3000).optional() }).strict(),
  volunteering: z.object({ role: required(200), organization: required(200), ...span, summary: text(3000).optional() }).strict(),
  award: z.object({ title: required(200), issuer: text(200).optional(), date: partialDate.optional(), summary: text(3000).optional() }).strict(),
  link: link,
};

export const itemCreateBody = z
  .object({
    kind: z.enum(PROFILE_ITEM_KINDS),
    position: z.number().int().min(0).max(10_000).default(0),
    content: z.unknown(),
    tags: tags.default([]),
    /** W7 (B4): validated per kind by the handler (`ITEM_TRANSLATIONS`). */
    translations: z.unknown().optional(),
  })
  .strict();
/** «Subir» / «Bajar»: the owner's item ids in their new order (positions 0..n-1). */
export const itemReorderBody = z.object({ itemIds: z.array(z.uuid()).min(1).max(500) }).strict();

export const itemPatchBody = z
  .object({
    position: z.number().int().min(0).max(10_000).optional(),
    content: z.unknown().optional(),
    tags: tags.optional(),
    /** W7 (B4): omitted keeps the stored translations, null clears them; validated per kind by the handler. */
    translations: z.unknown().optional(),
  })
  .strict();

/**
 * W5-J: the typed posting fields of a job (ingest/vocab.ts; all optional and nullable, so old clients keep working).
 * A state code must be a real Mexican entity when it starts with `MX-`. Amounts have at most two decimals.
 */
const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'not a calendar date');
const money = z
  .number()
  .positive()
  .max(SALARY_MAX_AMOUNT)
  .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, 'at most two decimals');
export const jobPostingFields = {
  sourceKind: z.enum(SOURCE_KINDS).nullable(),
  countryCode: z.string().regex(COUNTRY_CODE_PATTERN, 'ISO 3166-1 alpha-2').nullable(),
  stateCode: z
    .string()
    .regex(STATE_CODE_PATTERN, 'ISO 3166-2')
    .refine((v) => !v.startsWith('MX-') || (MX_STATE_CODES as readonly string[]).includes(v), 'not a Mexican state code')
    .nullable(),
  employmentType: z.enum(EMPLOYMENT_TYPES).nullable(),
  workMode: z.enum(WORK_MODES).nullable(),
  salaryMin: money.nullable(),
  salaryMax: money.nullable(),
  salaryCurrency: z.string().regex(CURRENCY_PATTERN, 'ISO 4217').nullable(),
  salaryPeriod: z.enum(SALARY_PERIODS).nullable(),
  datePosted: isoDay.nullable(),
  validThrough: isoDay.nullable(),
};
type SalaryShape = { salaryMin?: number | null; salaryMax?: number | null; salaryCurrency?: string | null; salaryPeriod?: string | null };
/** The salary rules the database also enforces (min ≤ max; a currency or period needs an amount). Null when fine. */
export function salaryIssue(v: SalaryShape): { path: string; message: string } | null {
  if (v.salaryMin != null && v.salaryMax != null && v.salaryMin > v.salaryMax) return { path: 'salaryMax', message: 'must be at least salaryMin' };
  if ((v.salaryCurrency != null || v.salaryPeriod != null) && v.salaryMin == null && v.salaryMax == null) return { path: 'salaryMin', message: 'a currency or period needs an amount' };
  return null;
}
const salaryRule = (v: SalaryShape, ctx: z.RefinementCtx) => {
  const issue = salaryIssue(v);
  if (issue) ctx.addIssue({ code: 'custom', path: [issue.path], message: issue.message });
};

export const jobCreateBody = z
  .object({
    title: required(200),
    company: text(200).default(''),
    location: text(200).default(''),
    sourceUrl: httpUrl.nullable().default(null),
    sourceText: required(SOURCE_TEXT_MAX),
    status: z.enum(JOB_STATUSES).default('saved'),
    notes: text(5000).default(''),
    sourceKind: jobPostingFields.sourceKind.default(null),
    countryCode: jobPostingFields.countryCode.default(null),
    stateCode: jobPostingFields.stateCode.default(null),
    employmentType: jobPostingFields.employmentType.default(null),
    workMode: jobPostingFields.workMode.default(null),
    salaryMin: jobPostingFields.salaryMin.default(null),
    salaryMax: jobPostingFields.salaryMax.default(null),
    salaryCurrency: jobPostingFields.salaryCurrency.default(null),
    salaryPeriod: jobPostingFields.salaryPeriod.default(null),
    datePosted: jobPostingFields.datePosted.default(null),
    validThrough: jobPostingFields.validThrough.default(null),
  })
  .strict()
  .superRefine(salaryRule);
export const jobPatchBody = z
  .object({
    title: required(200).optional(),
    company: text(200).optional(),
    location: text(200).optional(),
    sourceUrl: httpUrl.nullable().optional(),
    sourceText: required(SOURCE_TEXT_MAX).optional(),
    status: z.enum(JOB_STATUSES).optional(),
    notes: text(5000).optional(),
    // The source kind records how the job arrived; it is set at creation only.
    countryCode: jobPostingFields.countryCode.optional(),
    stateCode: jobPostingFields.stateCode.optional(),
    employmentType: jobPostingFields.employmentType.optional(),
    workMode: jobPostingFields.workMode.optional(),
    salaryMin: jobPostingFields.salaryMin.optional(),
    salaryMax: jobPostingFields.salaryMax.optional(),
    salaryCurrency: jobPostingFields.salaryCurrency.optional(),
    salaryPeriod: jobPostingFields.salaryPeriod.optional(),
    datePosted: jobPostingFields.datePosted.optional(),
    validThrough: jobPostingFields.validThrough.optional(),
  })
  .strict();

/** A reference to one of the owner's profile items, with optional per-artifact overrides. */
const itemRef = z
  .object({ itemId: z.uuid(), override: z.object({ title: text(300).optional(), summary: text(3000).optional(), highlights: bullets.optional() }).strict().optional() })
  .strict();
const block = z.object({ heading: text(200).optional(), body: text(10_000) }).strict();
const baseContent = { summary: text(5000).optional(), items: z.array(itemRef).max(200).default([]), blocks: z.array(block).max(50).default([]), showContact: z.boolean().default(false) };

/** The tailored document, per artifact kind: ordered profile item ids + overrides + free text blocks. */
export const ARTIFACT_CONTENT: Record<(typeof ARTIFACT_KINDS)[number], z.ZodType<ArtifactContent>> = {
  cv: z.object(baseContent).strict(),
  portfolio: z.object({ ...baseContent, intro: text(3000).optional() }).strict(),
  presentation: z.object({ ...baseContent, slides: z.array(z.object({ title: text(200), body: text(3000).optional(), itemIds: z.array(z.uuid()).max(20).default([]) }).strict()).max(60).default([]) }).strict(),
  cover_letter: z.object({ ...baseContent, greeting: text(200).optional(), closing: text(500).optional() }).strict(),
};

export interface ArtifactContent {
  summary?: string;
  items: { itemId: string; override?: { title?: string; summary?: string; highlights?: string[] } }[];
  blocks: { heading?: string; body: string }[];
  showContact: boolean;
  slides?: { title: string; body?: string; itemIds: string[] }[];
  [key: string]: unknown;
}

/** Every profile item id an artifact's content references (items and presentation slides). */
export function referencedItemIds(content: ArtifactContent): string[] {
  const ids = new Set(content.items.map((i) => i.itemId));
  for (const slide of content.slides ?? []) for (const id of slide.itemIds) ids.add(id);
  return [...ids];
}

export const artifactCreateBody = z
  .object({
    jobId: z.uuid().nullable().default(null),
    kind: z.enum(ARTIFACT_KINDS),
    title: required(200),
    locale: z.enum(LOCALES).default('es-MX'),
    template: z.string().regex(/^[a-z0-9-]{1,40}$/).default('base'),
    content: z.unknown().default({}),
  })
  .strict()
  .superRefine((b, ctx) => templateAllowed(b.kind, b.template, ['template'], ctx));
/**
 * Several artifacts at once, in one transaction (the tailoring workspace's «Crear CV, portafolio y presentación para
 * este empleo»): same job, locale and template; each with its kind, title and content (validated per kind).
 */
export const artifactSetBody = z
  .object({
    jobId: z.uuid().nullable().default(null),
    locale: z.enum(LOCALES).default('es-MX'),
    template: z.string().regex(/^[a-z0-9-]{1,40}$/).default('base'),
    artifacts: z
      .array(
        z
          .object({
            kind: z.enum(ARTIFACT_KINDS),
            title: required(200),
            content: z.unknown().default({}),
            // W4-T: each document of a set may pick its own template; absent → the set's `template`.
            template: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(4),
  })
  .strict()
  .superRefine((b, ctx) =>
    b.artifacts.forEach((a, i) => templateAllowed(a.kind, a.template ?? b.template, a.template === undefined ? ['template'] : ['artifacts', i, 'template'], ctx)),
  );

export const artifactPatchBody = z
  .object({
    title: required(200).optional(),
    locale: z.enum(LOCALES).optional(),
    template: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
    status: z.enum(ARTIFACT_STATUSES.filter((s) => s !== 'published') as ['draft', 'ready']).optional(),
    content: z.unknown().optional(),
  })
  .strict();

export const publishBody = z.discriminatedUnion('visibility', [
  z.object({ visibility: z.literal('link') }).strict(),
  z
    .object({
      visibility: z.literal('public'),
      slug: z.string().refine(isAllowedSlug, '3-64 characters: a-z, 0-9 and inner hyphens; not a reserved word'),
      indexable: z.boolean().default(false),
    })
    .strict(),
]);

// ---- W4-I: import, export, deletion (data portability and data rights) --------------------------------------------

/** The most profile items one import may add (`POST /profile/items/batch`, one transaction). */
export const ITEM_BATCH_MAX = 300;
/**
 * An import the person confirmed: items (each validated against its kind's content schema by the handler), and the
 * header fields they chose to take. Positions are assigned by the server (after the existing items, in order).
 * All or none.
 */
export const itemBatchBody = z
  .object({
    items: z
      .array(z.object({ kind: z.enum(PROFILE_ITEM_KINDS), content: z.unknown(), tags: tags.default([]) }).strict())
      .max(ITEM_BATCH_MAX)
      .default([]),
    profile: z
      .object({ displayName: text(200).optional(), headline: text(200).optional(), summary: text(5000).optional(), contact: contactSchema.optional() })
      .strict()
      .optional(),
  })
  .strict()
  .refine((b) => b.items.length > 0 || (b.profile !== undefined && Object.keys(b.profile).length > 0), { message: 'nothing to import', path: ['items'] });

/** `DELETE /me` body: an explicit, fixed confirmation (the UI asks the person to type «ELIMINAR» / «DELETE» first). */
export const DELETE_ME_CONFIRMATION = 'delete-all-my-data';
export const deleteMeBody = z.object({ confirm: z.literal(DELETE_ME_CONFIRMATION) }).strict();

/**
 * W4-T: the template allowlist, from the registry (`lib/templates.ts`). The shape check (`^[a-z0-9-]{1,40}$`) above
 * stays; on top of it a template must be one its kind offers. A PATCH carries no kind, so the handler checks it
 * against the stored artifact's kind with `templateIssue`. Rows stored before the allowlist keep rendering (the
 * renderer falls back to `base`) and can still be edited without sending `template`.
 */
export function templateIssue(kind: string, template: string): string | null {
  return isTemplateFor(kind, template) ? null : `unknown template for ${kind}`;
}

function templateAllowed(kind: string, template: string, path: (string | number)[], ctx: z.RefinementCtx): void {
  const message = templateIssue(kind, template);
  if (message) ctx.addIssue({ code: 'custom', path, message });
}

// ---- W7 (B4): bilingual profile text (lib/profile-text.ts) ---------------------------------------------------------

/**
 * The header's text in another language: `{ "en": { headline?, summary?, location? } }`, each with the limit of the
 * field it translates. At most one entry per content locale (the handler refuses the profile's own primary locale).
 */
export const profileTranslations = z.partialRecord(
  z.enum(LOCALES),
  z.object({ headline: text(200).optional(), summary: text(5000).optional(), location: text(200).optional() }).strict(),
);

/** The item content schema of `kind`, as a ZodObject (every ITEM_CONTENT entry is one). */
const contentObject = (kind: (typeof PROFILE_ITEM_KINDS)[number]) => ITEM_CONTENT[kind] as unknown as z.ZodObject<Record<string, z.ZodType>>;

/**
 * Per item kind, its translations: `{ "en": { <word field>?: … } }`, only the kind's word fields (ITEM_TEXT_FIELDS),
 * each with the limit and type of the field it translates (strings, or highlight lines), all optional. A translation
 * of a field that is not written in words (an organisation, a date, a URL, a level) is a 400.
 */
export const ITEM_TRANSLATIONS = Object.fromEntries(
  PROFILE_ITEM_KINDS.map((kind) => {
    const shape = contentObject(kind).shape;
    const fields = Object.fromEntries(ITEM_TEXT_FIELDS[kind].map((f) => [f, (shape[f] as z.ZodType).optional()]));
    return [kind, z.partialRecord(z.enum(LOCALES), z.object(fields).strict()).nullable()];
  }),
) as unknown as Record<(typeof PROFILE_ITEM_KINDS)[number], z.ZodType<Partial<Record<(typeof LOCALES)[number], Record<string, string | string[]>>> | null>>;

/** The header fields a translation may carry (in step with `profileTranslations`). */
export const PROFILE_TEXT_FIELDS: readonly string[] = HEADER_TEXT_FIELDS;
