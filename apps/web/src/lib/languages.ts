/**
 * W7 (B4): the languages a person can list in the profile, as ISO 639 codes. A language item stores its `code`; the
 * NAME a document prints comes from the code in the document's own language («Inglés» in a Spanish CV, «English» in an
 * English one), so it is never stored text that would need translating. The names come from the runtime's `Intl`
 * (CLDR data), never from a list typed here.
 *
 * Only codes for which CLDR has a real name in both Spanish and English are offered (test/profile-text.test.ts checks
 * every one). A language item stored before W7-B4 has a `name` and no `code`: it keeps printing its name, byte for
 * byte, and the bilingual flag asks the person to pick it from the list.
 *
 * Shared by the server (validation), the renderers and the editor: no server or React import here.
 */
export const LANGUAGE_CODES = [
  'es',
  'en',
  'fr',
  'it',
  'de',
  'pt',
  'zh',
  'ja',
  'ko',
  'ar',
  'ru',
  'nl',
  'sv',
  'no',
  'da',
  'fi',
  'pl',
  'tr',
  'he',
  'hi',
  'el',
  'ca',
  'cs',
  'hu',
  'ro',
  'uk',
  'th',
  'vi',
  'id',
  'eu',
  'gl',
  'zap',
] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

/** `Intl` locale of the names, per content locale of a document or a profile. */
const INTL: Record<string, string> = { 'es-MX': 'es-MX', es: 'es-MX', en: 'en-US' };

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && (LANGUAGE_CODES as readonly string[]).includes(value);
}

/** «Inglés» / «English»: the code's name in `locale` ('es-MX', 'es' or 'en'), capitalised as a list entry. */
export function languageName(code: LanguageCode, locale: string): string {
  const intl = INTL[locale] ?? 'es-MX';
  const name = new Intl.DisplayNames([intl], { type: 'language', fallback: 'code' }).of(code) ?? code;
  return name.charAt(0).toLocaleUpperCase(intl) + name.slice(1);
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .trim();

/** A few names people write that CLDR words differently. */
const ALIASES: Record<string, LanguageCode> = { castellano: 'es', mandarin: 'zh', 'chino mandarin': 'zh', 'mandarin chinese': 'zh', holandes: 'nl', noruego: 'no', vasco: 'eu' };

let byName: Map<string, LanguageCode> | null = null;

/**
 * The code of a language written as a name in Spanish or English («Inglés», «english», «Portugués (Brasil)»), or null.
 * Used by the import (LinkedIn, JSON Resume) and to suggest the code in the editor; never to rewrite stored data.
 */
export function languageCodeFromName(name: string): LanguageCode | null {
  if (!byName) {
    byName = new Map();
    for (const code of LANGUAGE_CODES) {
      byName.set(code, code);
      for (const locale of ['es-MX', 'en']) byName.set(fold(languageName(code, locale)), code);
    }
    for (const [alias, code] of Object.entries(ALIASES)) byName.set(alias, code);
  }
  return byName.get(fold(name)) ?? null;
}
