/**
 * W7 (B4): the bilingual text model (lib/profile-text.ts), the language list (lib/languages.ts) and the API's
 * translation schemas (server/api/validation.ts ITEM_TRANSLATIONS, profileTranslations).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ITEM_CONTENT, ITEM_TRANSLATIONS, profileBody, profileTranslations } from '../src/server/api/validation.ts';
import { PROFILE_ITEM_KINDS } from '../src/server/db/schema.ts';
import { LANGUAGE_CODES, languageCodeFromName, languageName } from '../src/lib/languages.ts';
import {
  HEADER_TEXT_FIELDS,
  ITEM_TEXT_FIELDS,
  cleanTranslations,
  localizeHeader,
  localizeItem,
  otherLocale,
  projectTranslations,
  readTranslations,
  untranslatedFields,
} from '../src/lib/profile-text.ts';

test('languages: every listed ISO 639 code has a real name in Spanish and English (read-proof)', () => {
  assert.ok(LANGUAGE_CODES.length >= 30, `codes: ${LANGUAGE_CODES.length}`);
  for (const code of LANGUAGE_CODES) {
    for (const locale of ['es-MX', 'en']) {
      const name = languageName(code, locale);
      assert.notEqual(name.toLowerCase(), code, `${code} in ${locale}`);
      assert.equal(name.charAt(0), name.charAt(0).toLocaleUpperCase(), `${code} in ${locale} is capitalised`);
    }
  }
  assert.equal(languageName('en', 'es-MX'), 'Inglés');
  assert.equal(languageName('en', 'en'), 'English');
  assert.equal(languageName('es', 'es-MX'), 'Español');
  assert.equal(languageName('es', 'en'), 'Spanish');
});

test('languages: names written in Spanish or English give their code; anything else gives none', () => {
  assert.equal(languageCodeFromName('Inglés'), 'en');
  assert.equal(languageCodeFromName('ingles'), 'en');
  assert.equal(languageCodeFromName('English'), 'en');
  assert.equal(languageCodeFromName('Portugués (Brasil)'), 'pt');
  assert.equal(languageCodeFromName('Castellano'), 'es');
  assert.equal(languageCodeFromName('Mandarín'), 'zh');
  assert.equal(languageCodeFromName('fr'), 'fr');
  assert.equal(languageCodeFromName('Náhuatl'), null);
  assert.equal(languageCodeFromName(''), null);
});

test('word fields only: every translatable field exists in its kind and is a text or a list of lines; names stay single', () => {
  for (const kind of PROFILE_ITEM_KINDS) {
    const shape = (ITEM_CONTENT[kind] as unknown as { shape: Record<string, unknown> }).shape;
    for (const f of ITEM_TEXT_FIELDS[kind]) assert.ok(f in shape, `${kind}.${f}`);
    for (const single of ['organization', 'institution', 'issuer', 'publisher', 'url', 'links', 'startDate', 'endDate', 'date', 'level', 'credentialId', 'code']) {
      assert.ok(!ITEM_TEXT_FIELDS[kind].includes(single), `${kind}.${single} stays single`);
    }
  }
  assert.deepEqual(ITEM_TEXT_FIELDS.language, [], 'a language name comes from its code');
  assert.deepEqual([...HEADER_TEXT_FIELDS], ['headline', 'summary', 'location']);
});

test('validation: per-kind translation schemas accept word fields within limits and refuse everything else', () => {
  const ok = (kind: (typeof PROFILE_ITEM_KINDS)[number], v: unknown) => ITEM_TRANSLATIONS[kind].safeParse(v).success;
  assert.equal(ok('experience', { en: { role: 'Sales advisor', highlights: ['One', 'Two'] } }), true);
  assert.equal(ok('experience', null), true, 'null clears');
  assert.equal(ok('experience', { en: { organization: 'Maison' } }), false);
  assert.equal(ok('experience', { en: { role: '' } }), false, 'a present translation of a required field is not blank');
  assert.equal(ok('experience', { en: { summary: 'x'.repeat(3001) } }), false);
  assert.equal(ok('experience', { en: { highlights: ['x'.repeat(501)] } }), false);
  assert.equal(ok('experience', { fr: { role: 'x' } }), false, 'content locales only');
  assert.equal(ok('experience', ['en']), false);
  assert.equal(ok('language', { en: { name: 'English' } }), false);
  assert.equal(ok('skill', { en: { name: 'Consultative selling' } }), true);
  assert.equal(ok('link', { en: { label: 'Portfolio' } }), true);
  assert.equal(ok('link', { en: { url: 'https://example.test' } }), false);
  assert.equal(profileTranslations.safeParse({ en: { headline: 'x', summary: 'y', location: 'Mexico City' } }).success, true);
  assert.equal(profileTranslations.safeParse({ en: { displayName: 'x' } }).success, false);
  assert.equal(profileTranslations.safeParse({ en: { headline: 'x'.repeat(201) } }).success, false);
  assert.equal(profileBody.safeParse({ headline: 'h' }).data?.translations, undefined, 'omitted stays omitted (kept on PUT)');
  assert.equal(ITEM_CONTENT.language.safeParse({ code: 'en', name: 'Inglés' }).success, true);
  assert.equal(ITEM_CONTENT.language.safeParse({ code: 'xx', name: 'Inglés' }).success, false);
});

test('cleanTranslations: trimmed, blank and unknown fields dropped, empty locales dropped, null when nothing is left', () => {
  assert.deepEqual(cleanTranslations({ en: { role: '  Advisor ', summary: ' ', highlights: [' a ', '', 'b'], organization: 'X' } }, ['role', 'summary', 'highlights']), {
    en: { role: 'Advisor', highlights: ['a', 'b'] },
  });
  assert.equal(cleanTranslations({ en: { role: ' ' } }, ['role']), null);
  assert.equal(cleanTranslations(null, ['role']), null);
  assert.deepEqual(readTranslations({ en: { a: 1, b: 'x' }, fr: { c: 'y' } }), { en: { b: 'x' } });
});

const EXP = { role: 'Asesora', organization: 'Maison Ejemplo', location: 'Ciudad de México', summary: 'Resumen', highlights: ['Uno', 'Dos'] };

test('localizeItem: the primary language reads the stored content itself; the other reads translations, falling back with a report', () => {
  const same = localizeItem('experience', EXP, { en: { role: 'Advisor' } }, 'es-MX', 'es-MX');
  assert.equal(same.content, EXP, 'same object: nothing is copied for the primary language');
  assert.deepEqual(same.missing, []);
  const en = localizeItem('experience', EXP, { en: { role: 'Advisor', highlights: ['One', 'Two'] } }, 'es-MX', 'en');
  assert.equal(en.content.role, 'Advisor');
  assert.deepEqual(en.content.highlights, ['One', 'Two']);
  assert.equal(en.content.organization, 'Maison Ejemplo', 'proper names stay');
  assert.equal(en.content.summary, 'Resumen', 'falls back to the primary text');
  assert.deepEqual(en.missing, ['location', 'summary']);
  // A per-job override replaces the field: it needs no translation for that document.
  assert.deepEqual(localizeItem('experience', EXP, null, 'es-MX', 'en', { summary: 'Job summary', highlights: [] }).missing, ['role', 'location']);
  assert.deepEqual(localizeItem('education', { institution: 'UNAM', degree: 'Lic.', field: 'Mercadotecnia' }, null, 'es-MX', 'en', { title: 'BA' }).missing, []);
  // A list translation of a text field (or the other way round) is not used.
  assert.deepEqual(localizeItem('experience', { role: 'Asesora', highlights: ['Uno'] }, { en: { highlights: 'One' } }, 'es-MX', 'en').missing, ['role', 'highlights']);
  // An English-primary profile works the same way round.
  assert.equal(localizeItem('skill', { name: 'Consultative selling' }, { 'es-MX': { name: 'Ventas consultivas' } }, 'en', 'es-MX').content.name, 'Ventas consultivas');
  assert.deepEqual(untranslatedFields('experience', EXP, null, 'es-MX', 'en'), ['role', 'location', 'summary', 'highlights']);
});

test('localizeItem: a language prints its code’s name in the document language; one without a code is reported in the other', () => {
  assert.equal(localizeItem('language', { code: 'en', name: 'Inglés', level: 'C1' }, null, 'es-MX', 'en').content.name, 'English');
  assert.equal(localizeItem('language', { code: 'en', name: 'Inglés', level: 'C1' }, null, 'es-MX', 'es-MX').content.name, 'Inglés');
  assert.equal(localizeItem('language', { code: 'es', name: 'x' }, null, 'es-MX', 'es-MX').content.name, 'Español', 'the code wins over a stale name');
  const legacy = { name: 'Inglés', level: 'C1' };
  assert.equal(localizeItem('language', legacy, null, 'es-MX', 'es-MX').content, legacy, 'a row from before W7-B4 is untouched');
  const other = localizeItem('language', legacy, null, 'es-MX', 'en');
  assert.equal(other.content, legacy);
  assert.deepEqual(other.missing, ['code']);
});

test('localizeHeader: translated header fields, the fallback report, a document summary and a hidden contact', () => {
  const header = { headline: 'Asesora', summary: 'Resumen', location: 'Ciudad de México' };
  const r = localizeHeader(header, { en: { headline: 'Advisor' } }, 'es-MX', 'en');
  assert.deepEqual(r.header, { headline: 'Advisor', summary: 'Resumen', location: 'Ciudad de México' });
  assert.deepEqual(r.missing, ['summary', 'location']);
  assert.deepEqual(localizeHeader(header, null, 'es-MX', 'en', true).missing, ['headline', 'location'], 'the document has its own summary');
  assert.deepEqual(localizeHeader({ headline: 'Asesora', summary: '' }, null, 'es-MX', 'en').missing, ['headline'], 'no contact shown: no place');
  assert.equal(localizeHeader(header, { en: { headline: 'Advisor' } }, 'es-MX', 'es-MX').header, header);
  assert.equal(otherLocale('es-MX'), 'en');
  assert.equal(otherLocale('en'), 'es-MX');
});

test('projectTranslations: only the target language, only the allowed fields, nothing for the primary language', () => {
  const t = { en: { headline: 'H', summary: 'S', location: 'L' }, 'es-MX': { headline: 'x' } };
  assert.deepEqual(projectTranslations(t, 'es-MX', 'en', ['headline', 'summary']), { en: { headline: 'H', summary: 'S' } });
  assert.equal(projectTranslations(t, 'es-MX', 'es-MX', ['headline']), undefined);
  assert.equal(projectTranslations(null, 'es-MX', 'en', ['headline']), undefined);
  assert.equal(projectTranslations({ en: { location: 'L' } }, 'es-MX', 'en', ['headline']), undefined);
});
