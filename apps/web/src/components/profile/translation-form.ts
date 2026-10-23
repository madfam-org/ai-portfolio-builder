/**
 * W7 (B4): the profile forms' other-language text as pure data (no React; test/profile-translation.test.ts). The
 * descriptors are the SAME field specs as the primary text (components/profile/fields.ts), limited to the fields
 * written in words (lib/profile-text.ts) and never required: a translation is optional field by field.
 */
import type { ItemKind } from '../../lib/copy/app.ts';
import { HEADER_TEXT_FIELDS, ITEM_TEXT_FIELDS, cleanTranslations, readTranslations, type ContentLocale, type Translations } from '../../lib/profile-text.ts';
import { CONTACT_FIELDS, HEADER_FIELDS, ITEM_FIELDS, contentToForm, formToContent, type FieldErrors, type FieldSpec, type FormValues } from './fields.ts';

/** An item kind's translatable fields, in the form's order, all optional. */
export function itemTextSpecs(kind: ItemKind): FieldSpec[] {
  const names = new Set(ITEM_TEXT_FIELDS[kind]);
  return ITEM_FIELDS[kind].filter((f) => names.has(f.name)).map((f) => ({ ...f, required: false }));
}

/** The header's translatable fields (headline, summary, the contact's place), all optional. */
export const HEADER_TEXT_SPECS: readonly FieldSpec[] = [...HEADER_FIELDS, ...CONTACT_FIELDS]
  .filter((f) => (HEADER_TEXT_FIELDS as readonly string[]).includes(f.name))
  .map((f) => ({ ...f, required: false }));

/** Stored translations → the form values of `locale` (every spec gets a value, so inputs stay controlled). */
export function translationsToForm(specs: readonly FieldSpec[], translations: unknown, locale: ContentLocale): FormValues {
  return contentToForm(specs, readTranslations(translations)[locale] ?? {});
}

/**
 * Form values of `locale` → what the API stores for them: `{ [locale]: { … } }`, or null when every field is empty (a
 * save then clears the translations). The same checks as the primary fields (limits, lines), one error per field.
 */
export function formToTranslations(specs: readonly FieldSpec[], values: FormValues, locale: ContentLocale): { translations: Translations | null; errors: FieldErrors } {
  const { content, errors } = formToContent(specs, values);
  if (Object.keys(errors).length) return { translations: null, errors };
  return { translations: cleanTranslations({ [locale]: content }, specs.map((s) => s.name)), errors: {} };
}

/**
 * «Copiar el texto en español como punto de partida»: the primary values copied into the EMPTY translation fields only
 * (nothing the person already wrote is overwritten).
 */
export function copyPrimary(specs: readonly FieldSpec[], translated: FormValues, primary: FormValues): FormValues {
  const next = { ...translated };
  for (const s of specs) {
    const t = next[s.name];
    if (typeof t === 'string' && t.trim() === '' && typeof primary[s.name] === 'string') next[s.name] = primary[s.name]!;
  }
  return next;
}

/** The fields with primary text and an empty translation, as the form holds them («falta en inglés» marks). */
export function emptyTranslations(specs: readonly FieldSpec[], translated: FormValues, primary: FormValues): string[] {
  return specs
    .filter((s) => typeof primary[s.name] === 'string' && (primary[s.name] as string).trim() !== '' && String(translated[s.name] ?? '').trim() === '')
    .map((s) => s.name);
}
