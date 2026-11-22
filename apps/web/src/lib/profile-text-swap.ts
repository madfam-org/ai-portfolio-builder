/**
 * W7 (B4): changing the profile's PRIMARY language (`profiles.locale`). The fields hold the primary language's text and
 * `translations` hold the other one (lib/profile-text.ts), so a new primary language swaps the two, field by field, for
 * the header and for every item (server/db/repository.ts `putProfile` runs it in one transaction):
 *
 * - a field with a translation in the NEW primary language takes that translation as its value, and its previous value
 *   moves to `translations[<old primary>][field]` (nothing moves when the previous value was empty);
 * - a field without one keeps its value, and nothing is added;
 * - the new primary language's translation entry is then removed (it is the fields now).
 *
 * Only the word fields of each kind are touched (`ITEM_TEXT_FIELDS`, `HEADER_TEXT_FIELDS`): a recommendation's words
 * (`text`), names, dates, URLs, codes and levels never move. Every document therefore renders the same text in both
 * languages before and after the switch (a field without a translation fell back to the primary text before and
 * still does), and switching back returns the original rows. The one exception is a translation of a field that was
 * EMPTY in the old primary language (never printed, since nothing fell back to it): it becomes the field's text.
 *
 * A row saved while this rule did not exist (primary `en` with an `en` entry still stored, or the same for es-MX) is
 * repaired by switching back: the stale entry is then the other language again.
 *
 * Pure (test/profile-text-swap.test.ts); no server or React import.
 */
import type { ItemKind } from './copy/app.ts';
import { CONTENT_LOCALES, HEADER_TEXT_FIELDS, ITEM_TEXT_FIELDS, hasText, readTranslations, type ContentLocale, type FieldTexts, type Translations } from './profile-text.ts';

export interface SwappedTexts {
  content: Record<string, unknown>;
  /** Null when nothing is left (as stored for a row without translations). */
  translations: Translations | null;
  /** False when the row needs no write (no translation in the new primary language, or the language did not change). */
  changed: boolean;
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** The swap over `fields` of one row (`content` holds the primary text, `translations` the other languages). */
export function swapPrimaryTexts(fields: readonly string[], content: unknown, translations: unknown, from: ContentLocale, to: ContentLocale): SwappedTexts {
  const c = rec(content);
  const tr = readTranslations(translations);
  const incoming = tr[to];
  if (from === to || incoming === undefined) {
    return { content: c, translations: Object.keys(tr).length ? tr : null, changed: false };
  }
  const out: Record<string, unknown> = { ...c };
  const outgoing: FieldTexts = { ...(tr[from] ?? {}) };
  for (const field of fields) {
    const t = incoming[field];
    if (!hasText(t)) continue;
    const prev = c[field];
    // A translation whose shape differs from the field (text vs lines) was never printed (localizeItem): not moved.
    if (prev !== undefined && Array.isArray(prev) !== Array.isArray(t)) continue;
    out[field] = t;
    if (hasText(prev)) outgoing[field] = prev;
    else delete outgoing[field];
  }
  const next: Translations = {};
  for (const locale of CONTENT_LOCALES) {
    if (locale === to) continue;
    const entry = locale === from ? outgoing : tr[locale];
    if (entry && Object.keys(entry).length) next[locale] = entry;
  }
  return { content: out, translations: Object.keys(next).length ? next : null, changed: true };
}

/** One profile item's swap: only its kind's word fields. */
export function swapItemTexts(kind: ItemKind, content: unknown, translations: unknown, from: ContentLocale, to: ContentLocale): SwappedTexts {
  return swapPrimaryTexts(ITEM_TEXT_FIELDS[kind] ?? [], content, translations, from, to);
}

export interface HeaderTexts {
  headline: string;
  summary: string;
  /** The contact's free-text place (`contact.location`); undefined when the contact has none. */
  location?: string;
}

/** The header's swap: headline, summary and the contact's place. */
export function swapHeaderTexts(
  header: HeaderTexts,
  translations: unknown,
  from: ContentLocale,
  to: ContentLocale,
): { header: HeaderTexts; translations: Translations | null; changed: boolean } {
  const base: Record<string, unknown> = { headline: header.headline, summary: header.summary, ...(header.location === undefined ? {} : { location: header.location }) };
  const r = swapPrimaryTexts(HEADER_TEXT_FIELDS, base, translations, from, to);
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const location = r.content.location;
  return {
    header: { headline: str(r.content.headline), summary: str(r.content.summary), ...(typeof location === 'string' ? { location } : {}) },
    translations: r.translations,
    changed: r.changed,
  };
}
