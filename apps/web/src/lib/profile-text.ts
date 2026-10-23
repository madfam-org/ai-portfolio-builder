/**
 * W7 (B4): bilingual profile text. The profile has ONE primary language (`profiles.locale`, Spanish by default); its
 * free text lives where it always did (the header columns, each item's `content`). The other language is optional,
 * field by field, in a nullable `translations` jsonb beside it (profiles and profile_items, migration 0003), keyed by
 * content locale:
 *
 *   profiles.translations      = { "en": { "headline": "…", "summary": "…", "location": "…" } }
 *   profile_items.translations = { "en": { "role": "…", "summary": "…", "highlights": ["…", "…"] } }
 *
 * Only words are translated: titles, descriptions, highlights, skill and link labels, free-text places. Proper names
 * (the person, organisations, schools, issuers, publishers), dates, URLs, codes and levels stay single. A language
 * item's name comes from its ISO 639 code (lib/languages.ts), never from stored text.
 *
 * A document prints the text of its own locale; a field without it falls back to the primary text and is reported as
 * missing (the preview and the tailoring workspace flag it; the printed document never does). A document in the
 * primary language reads exactly the stored text, so a profile without translations renders as it always did.
 *
 * Pure and shared (server validation, renderers, editor, tailoring, export): no server or React import here.
 */
import type { ItemKind } from './copy/app.ts';
import { isLanguageCode, languageName } from './languages.ts';

export const CONTENT_LOCALES = ['es-MX', 'en'] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];
export type TextValue = string | string[];
export type FieldTexts = Record<string, TextValue>;
export type Translations = Partial<Record<ContentLocale, FieldTexts>>;

/** The header's translatable text (the person's name stays single). `location` is the contact's free-text place. */
export const HEADER_TEXT_FIELDS = ['headline', 'summary', 'location'] as const;
export type HeaderTextField = (typeof HEADER_TEXT_FIELDS)[number];

/** Per item kind, the fields written in words (in the editor's order). Everything else stays single. */
export const ITEM_TEXT_FIELDS: Record<ItemKind, readonly string[]> = {
  experience: ['role', 'location', 'summary', 'highlights'],
  education: ['degree', 'field', 'summary', 'highlights'],
  skill: ['name'],
  project: ['name', 'role', 'summary', 'highlights'],
  certification: ['name'],
  achievement: ['title', 'summary'],
  // The name comes from the ISO 639 code, in the document's language.
  language: [],
  publication: ['title', 'summary'],
  volunteering: ['role', 'summary'],
  award: ['title', 'summary'],
  link: ['label'],
};

/** The fields a per-job title override replaces (components/render/model.ts buildEntry: the entry's title). */
const TITLE_FIELDS: Record<ItemKind, readonly string[]> = {
  experience: ['role'],
  education: ['degree', 'field'],
  skill: ['name'],
  project: ['name'],
  certification: ['name'],
  achievement: ['title'],
  language: [],
  publication: ['title'],
  volunteering: ['role'],
  award: ['title'],
  link: ['label'],
};

/** A language item without an ISO 639 code: its stored name cannot follow the document's language. */
export const LANGUAGE_CODE_FIELD = 'code';

export function otherLocale(locale: ContentLocale): ContentLocale {
  return locale === 'en' ? 'es-MX' : 'en';
}

export function contentLocale(value: unknown): ContentLocale {
  return value === 'en' ? 'en' : 'es-MX';
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** A text value with something in it: a non-blank string, or a list with at least one non-blank line. */
export function hasText(v: unknown): v is TextValue {
  if (typeof v === 'string') return v.trim() !== '';
  return Array.isArray(v) && v.some((x) => typeof x === 'string' && x.trim() !== '');
}

/** Stored translations, read defensively (validated on write): locale → field → text. */
export function readTranslations(raw: unknown): Translations {
  const out: Translations = {};
  for (const locale of CONTENT_LOCALES) {
    const fields = rec(rec(raw)[locale]);
    const kept: FieldTexts = {};
    for (const [k, v] of Object.entries(fields)) {
      if (typeof v === 'string') kept[k] = v;
      else if (Array.isArray(v)) kept[k] = v.filter((x): x is string => typeof x === 'string');
    }
    if (Object.keys(kept).length) out[locale] = kept;
  }
  return out;
}

/**
 * What is stored: only `allowed` fields, trimmed, blank strings and blank lines dropped, empty locales dropped; null when
 * nothing is left (so a profile without translations keeps `translations` null).
 */
export function cleanTranslations(raw: unknown, allowed: readonly string[]): Translations | null {
  const out: Translations = {};
  for (const [locale, fields] of Object.entries(readTranslations(raw)) as [ContentLocale, FieldTexts][]) {
    const kept: FieldTexts = {};
    for (const name of allowed) {
      const v = fields[name];
      if (typeof v === 'string' && v.trim() !== '') kept[name] = v.trim();
      else if (Array.isArray(v)) {
        const lines = v.map((x) => x.trim()).filter((x) => x !== '');
        if (lines.length) kept[name] = lines;
      }
    }
    if (Object.keys(kept).length) out[locale] = kept;
  }
  return Object.keys(out).length ? out : null;
}

export interface ItemOverride {
  title?: string;
  summary?: string;
  highlights?: string[];
}

/** Which of `kind`'s text fields a per-job override already replaces (those need no translation for that document). */
function overridden(kind: ItemKind, override: ItemOverride | undefined): Set<string> {
  const out = new Set<string>();
  if (!override) return out;
  if (hasText(override.title)) for (const f of TITLE_FIELDS[kind]) out.add(f);
  if (hasText(override.summary)) out.add('summary');
  if (override.highlights !== undefined) out.add('highlights');
  return out;
}

/**
 * One item's content in `target`: the primary text where `target` is the primary language; otherwise each text field
 * from the translation when there is one, else the primary text, listed in `missing`. A language item's name always
 * comes from its code when it has one (in the target language); without a code, `missing` names `code`.
 */
export function localizeItem(
  kind: ItemKind,
  content: unknown,
  translations: unknown,
  primary: ContentLocale,
  target: ContentLocale,
  override?: ItemOverride,
): { content: Record<string, unknown>; missing: string[] } {
  const c = rec(content);
  const missing: string[] = [];
  let out: Record<string, unknown> = c;
  if (kind === 'language') {
    if (isLanguageCode(c.code)) out = { ...c, name: languageName(c.code, target) };
    else if (target !== primary && hasText(c.name)) missing.push(LANGUAGE_CODE_FIELD);
    return { content: out, missing };
  }
  if (target === primary) return { content: c, missing };
  const texts = readTranslations(translations)[target] ?? {};
  const covered = overridden(kind, override);
  out = { ...c };
  for (const field of ITEM_TEXT_FIELDS[kind]) {
    if (!hasText(c[field])) continue;
    const t = texts[field];
    if (hasText(t) && Array.isArray(c[field]) === Array.isArray(t)) out[field] = t;
    else if (!covered.has(field)) missing.push(field);
  }
  return { content: out, missing };
}

export interface HeaderText {
  headline: string;
  summary: string;
  /** The contact's place; undefined when the document does not show the contact. */
  location?: string;
}

/** The header in `target`, with the same fallback rule. `summaryOverridden`: the document has its own summary. */
export function localizeHeader(
  header: HeaderText,
  translations: unknown,
  primary: ContentLocale,
  target: ContentLocale,
  summaryOverridden = false,
): { header: HeaderText; missing: HeaderTextField[] } {
  if (target === primary) return { header, missing: [] };
  const texts = readTranslations(translations)[target] ?? {};
  const out: HeaderText = { ...header };
  const missing: HeaderTextField[] = [];
  for (const field of HEADER_TEXT_FIELDS) {
    const primaryText = header[field];
    if (!hasText(primaryText)) continue;
    const t = texts[field];
    if (typeof t === 'string' && hasText(t)) out[field] = t;
    else if (!(field === 'summary' && summaryOverridden)) missing.push(field);
  }
  return { header: out, missing };
}

/**
 * The editor's «falta en inglés» marks: the fields of one item that have primary text and no translation in `target`
 * (no override considered: the profile is per person, not per job).
 */
export function untranslatedFields(kind: ItemKind, content: unknown, translations: unknown, primary: ContentLocale, target: ContentLocale): string[] {
  return localizeItem(kind, content, translations, primary, target).missing;
}

/**
 * What a reader of ONE document needs: the `target` locale's texts of `fields`, or undefined when the document is in the
 * primary language or there is nothing (the public projection never carries the other languages, nor hidden fields).
 */
export function projectTranslations(raw: unknown, primary: ContentLocale, target: ContentLocale, fields: readonly string[]): Translations | undefined {
  if (target === primary) return undefined;
  const texts = readTranslations(raw)[target];
  if (!texts) return undefined;
  const kept: FieldTexts = {};
  for (const f of fields) if (texts[f] !== undefined) kept[f] = texts[f];
  return Object.keys(kept).length ? { [target]: kept } : undefined;
}
