/**
 * Request bodies, validated with zod. Every object is `.strict()`: an unknown field is a 400, never silently stored
 * (no mass assignment). `owner_sub`, ids, status, visibility, share tokens, slugs (except where the publish body
 * names one) and timestamps are never accepted from a body: the server sets them.
 */
import { z } from 'zod';
import { isAllowedSlug } from '../../lib/api-routes.ts';
import { ARTIFACT_KINDS, ARTIFACT_STATUSES, JOB_STATUSES, LOCALES, PROFILE_ITEM_KINDS, SOURCE_TEXT_MAX } from '../db/schema.ts';

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
  language: z.object({ name: required(80), level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'native']).optional() }).strict(),
  publication: z.object({ title: required(300), publisher: text(200).optional(), date: partialDate.optional(), url: httpUrl.optional(), summary: text(3000).optional() }).strict(),
  volunteering: z.object({ role: required(200), organization: required(200), ...span, summary: text(3000).optional() }).strict(),
  award: z.object({ title: required(200), issuer: text(200).optional(), date: partialDate.optional(), summary: text(3000).optional() }).strict(),
  link: link,
};

export const itemCreateBody = z
  .object({ kind: z.enum(PROFILE_ITEM_KINDS), position: z.number().int().min(0).max(10_000).default(0), content: z.unknown(), tags: tags.default([]) })
  .strict();
/** «Subir» / «Bajar»: the owner's item ids in their new order (positions 0..n-1). */
export const itemReorderBody = z.object({ itemIds: z.array(z.uuid()).min(1).max(500) }).strict();

export const itemPatchBody = z.object({ position: z.number().int().min(0).max(10_000).optional(), content: z.unknown().optional(), tags: tags.optional() }).strict();

export const jobCreateBody = z
  .object({
    title: required(200),
    company: text(200).default(''),
    location: text(200).default(''),
    sourceUrl: httpUrl.nullable().default(null),
    sourceText: required(SOURCE_TEXT_MAX),
    status: z.enum(JOB_STATUSES).default('saved'),
    notes: text(5000).default(''),
  })
  .strict();
export const jobPatchBody = z
  .object({
    title: required(200).optional(),
    company: text(200).optional(),
    location: text(200).optional(),
    sourceUrl: httpUrl.nullable().optional(),
    sourceText: required(SOURCE_TEXT_MAX).optional(),
    status: z.enum(JOB_STATUSES).optional(),
    notes: text(5000).optional(),
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
  .strict();
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
      .array(z.object({ kind: z.enum(ARTIFACT_KINDS), title: required(200), content: z.unknown().default({}) }).strict())
      .min(1)
      .max(4),
  })
  .strict();

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
