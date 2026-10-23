/**
 * The owner-scoped data model (docs/PRODUCT.md; owner requirement 2026-10-22, replacing lane J §3.7's sketch):
 * ONE core profile per person, a range of jobs they apply to, and tailored artifacts (CV, portfolio, presentation,
 * cover letter) per job.
 *
 * Rules every table keeps:
 * - The owner is the Janua `sub` (`owner_sub` on EVERY row); there is no users table, Janua owns identity.
 * - Every parent has `unique (id, owner_sub)` and every child points at it with a composite FK
 *   `(parent_id, owner_sub)`, so a row that belongs to one person can never hang under another person's row, even
 *   if the repository is bypassed.
 * - Artifacts reference profile items inside `content` (jsonb); the repository checks, in the same transaction,
 *   that every referenced item id belongs to the same owner.
 * - Sharing is explicit: `visibility = 'link'` exactly when a share token exists, `visibility = 'public'` exactly when a
 *   slug exists, and neither unless the artifact is published (CHECK constraints below).
 */
import { sql } from 'drizzle-orm';
import { boolean, check, date, foreignKey, index, integer, jsonb, numeric, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { EMPLOYMENT_TYPES, SALARY_PERIODS, SOURCE_KINDS, WORK_MODES } from '../ingest/vocab.ts';

export const PROFILE_ITEM_KINDS = [
  'experience',
  'education',
  'skill',
  'project',
  'certification',
  'achievement',
  'language',
  'publication',
  'volunteering',
  'award',
  'link',
] as const;
export const JOB_STATUSES = ['saved', 'applying', 'applied', 'interview', 'offer', 'rejected', 'archived'] as const;
export const ARTIFACT_KINDS = ['cv', 'portfolio', 'presentation', 'cover_letter'] as const;
export const ARTIFACT_STATUSES = ['draft', 'ready', 'published'] as const;
export const VISIBILITIES = ['private', 'link', 'public'] as const;
export const LOCALES = ['es-MX', 'en'] as const;
/** W7 (B4): the stored translations of one profile or item, at most this many bytes of JSON (zod bounds every field). */
export const TRANSLATIONS_MAX_BYTES = 65_536;
/** Size cap of a pasted job posting (characters). */
export const SOURCE_TEXT_MAX = 50_000;

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerSub: text('owner_sub').notNull(),
    /** Whose CV it is. Prefilled from the Janua `name` claim when the profile is first created; editable. */
    displayName: text('display_name').notNull().default(''),
    headline: text('headline').notNull().default(''),
    summary: text('summary').notNull().default(''),
    locale: text('locale').notNull().default('es-MX'),
    contact: jsonb('contact').notNull().default({}),
    /**
     * W7 (B4, migration 0003): the header's text in the OTHER language, `{ "en": { headline, summary, location } }`
     * (lib/profile-text.ts). Null: none (every profile before W7-B4). `locale` above is the primary language.
     */
    translations: jsonb('translations'),
    ...timestamps,
  },
  (t) => [
    unique('profiles_owner_sub_unique').on(t.ownerSub),
    unique('profiles_id_owner_sub_unique').on(t.id, t.ownerSub),
    check('profiles_locale_check', sql`${t.locale} in (${inList(LOCALES)})`),
    check('profiles_translations_check', sql`${t.translations} is null or (jsonb_typeof(${t.translations}) = 'object' and octet_length(${t.translations}::text) <= ${sql.raw(String(TRANSLATIONS_MAX_BYTES))})`),
  ],
);

export const profileItems = pgTable(
  'profile_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerSub: text('owner_sub').notNull(),
    profileId: uuid('profile_id').notNull(),
    kind: text('kind').notNull(),
    position: integer('position').notNull().default(0),
    content: jsonb('content').notNull(),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    /** W7 (B4, migration 0003): the item's word fields in the profile's other language (lib/profile-text.ts); null: none. */
    translations: jsonb('translations'),
    ...timestamps,
  },
  (t) => [
    unique('profile_items_id_owner_sub_unique').on(t.id, t.ownerSub),
    index('profile_items_owner_profile_idx').on(t.ownerSub, t.profileId),
    foreignKey({ name: 'profile_items_profile_owner_fk', columns: [t.profileId, t.ownerSub], foreignColumns: [profiles.id, profiles.ownerSub] }).onDelete(
      'cascade',
    ),
    check('profile_items_kind_check', sql`${t.kind} in (${inList(PROFILE_ITEM_KINDS)})`),
    check('profile_items_translations_check', sql`${t.translations} is null or (jsonb_typeof(${t.translations}) = 'object' and octet_length(${t.translations}::text) <= ${sql.raw(String(TRANSLATIONS_MAX_BYTES))})`),
  ],
);

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerSub: text('owner_sub').notNull(),
    title: text('title').notNull(),
    company: text('company').notNull().default(''),
    location: text('location').notNull().default(''),
    sourceUrl: text('source_url'),
    sourceText: text('source_text').notNull(),
    /** Structured reading of the posting; filled later by Selva (W6). Null in W2. */
    parsed: jsonb('parsed'),
    status: text('status').notNull().default('saved'),
    notes: text('notes').notNull().default(''),
    // W5-J job intake (migration 0002, additive and nullable: rows from before keep working). Typed so W5-H (HCM
    // benchmarking) reads location, state and salary without parsing text; docs/PRODUCT.md "Job intake".
    /** How the job arrived (ingest/vocab.ts SOURCE_KINDS); null for rows created before W5-J. */
    sourceKind: text('source_kind'),
    /** ISO 3166-1 alpha-2 (`MX`), only when the posting states it. */
    countryCode: text('country_code'),
    /** ISO 3166-2 (`MX-JAL`), only when unambiguous (ingest/mx.ts). */
    stateCode: text('state_code'),
    employmentType: text('employment_type'),
    workMode: text('work_mode'),
    /** A STATED salary only (never an estimate): amounts in `salary_currency` (ISO 4217) per `salary_period`. */
    salaryMin: numeric('salary_min', { precision: 14, scale: 2, mode: 'number' }),
    salaryMax: numeric('salary_max', { precision: 14, scale: 2, mode: 'number' }),
    salaryCurrency: text('salary_currency'),
    salaryPeriod: text('salary_period'),
    datePosted: date('date_posted', { mode: 'string' }),
    validThrough: date('valid_through', { mode: 'string' }),
    ...timestamps,
  },
  (t) => [
    unique('jobs_id_owner_sub_unique').on(t.id, t.ownerSub),
    index('jobs_owner_sub_idx').on(t.ownerSub),
    check('jobs_status_check', sql`${t.status} in (${inList(JOB_STATUSES)})`),
    check('jobs_source_text_size_check', sql`char_length(${t.sourceText}) between 1 and ${sql.raw(String(SOURCE_TEXT_MAX))}`),
    check('jobs_source_kind_check', sql`${t.sourceKind} is null or ${t.sourceKind} in (${inList(SOURCE_KINDS)})`),
    check('jobs_country_code_check', sql`${t.countryCode} is null or ${t.countryCode} ~ '^[A-Z]{2}$'`),
    check('jobs_state_code_check', sql`${t.stateCode} is null or ${t.stateCode} ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$'`),
    check('jobs_employment_type_check', sql`${t.employmentType} is null or ${t.employmentType} in (${inList(EMPLOYMENT_TYPES)})`),
    check('jobs_work_mode_check', sql`${t.workMode} is null or ${t.workMode} in (${inList(WORK_MODES)})`),
    check('jobs_salary_currency_check', sql`${t.salaryCurrency} is null or ${t.salaryCurrency} ~ '^[A-Z]{3}$'`),
    check('jobs_salary_period_check', sql`${t.salaryPeriod} is null or ${t.salaryPeriod} in (${inList(SALARY_PERIODS)})`),
    check('jobs_salary_amounts_check', sql`(${t.salaryMin} is null or ${t.salaryMin} > 0) and (${t.salaryMax} is null or ${t.salaryMax} > 0) and (${t.salaryMin} is null or ${t.salaryMax} is null or ${t.salaryMin} <= ${t.salaryMax})`),
    check('jobs_salary_unit_needs_amount_check', sql`(${t.salaryCurrency} is null and ${t.salaryPeriod} is null) or ${t.salaryMin} is not null or ${t.salaryMax} is not null`),
  ],
);

export const artifacts = pgTable(
  'artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerSub: text('owner_sub').notNull(),
    /** Null: a general (untailored) artifact. Set: tailored to that job (composite FK, same owner). */
    jobId: uuid('job_id'),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    locale: text('locale').notNull().default('es-MX'),
    template: text('template').notNull().default('base'),
    status: text('status').notNull().default('draft'),
    visibility: text('visibility').notNull().default('private'),
    shareToken: text('share_token'),
    slug: text('slug'),
    content: jsonb('content').notNull(),
    /** Search indexing of a public page is the owner's explicit choice (default off; only for visibility 'public'). */
    indexable: boolean('indexable').notNull().default(false),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    /**
     * Moderation takedown short of deletion: a suspended artifact is never served publicly and its owner cannot
     * publish it again. Set and cleared only by an operator (docs/DEPLOYMENT.md "Moderation"); no API sets it.
     */
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    suspendedReason: text('suspended_reason'),
    ...timestamps,
  },
  (t) => [
    unique('artifacts_id_owner_sub_unique').on(t.id, t.ownerSub),
    unique('artifacts_share_token_unique').on(t.shareToken),
    unique('artifacts_slug_unique').on(t.slug),
    index('artifacts_owner_job_idx').on(t.ownerSub, t.jobId),
    // No ON DELETE action: deleting a job that still has artifacts is refused (409), never a silent cascade.
    foreignKey({ name: 'artifacts_job_owner_fk', columns: [t.jobId, t.ownerSub], foreignColumns: [jobs.id, jobs.ownerSub] }),
    check('artifacts_kind_check', sql`${t.kind} in (${inList(ARTIFACT_KINDS)})`),
    check('artifacts_status_check', sql`${t.status} in (${inList(ARTIFACT_STATUSES)})`),
    check('artifacts_visibility_check', sql`${t.visibility} in (${inList(VISIBILITIES)})`),
    check('artifacts_locale_check', sql`${t.locale} in (${inList(LOCALES)})`),
    check('artifacts_link_token_check', sql`(${t.visibility} = 'link') = (${t.shareToken} is not null)`),
    check('artifacts_public_slug_check', sql`(${t.visibility} = 'public') = (${t.slug} is not null)`),
    check('artifacts_indexable_public_check', sql`not ${t.indexable} or ${t.visibility} = 'public'`),
    check(
      'artifacts_shared_published_check',
      sql`(${t.visibility} = 'private') = (${t.status} <> 'published') and (${t.status} <> 'published' or ${t.publishedAt} is not null)`,
    ),
  ],
);
