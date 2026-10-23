/**
 * W7 (B4): the profile forms' other-language text (components/profile/translation-form.ts), the tailoring workspace's
 * per-language overrides and missing-text report (components/jobs/tailoring.ts), the import's file language
 * (components/import/language.ts) and the JSON Resume export per language (server/api/portability.ts).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ITEM_TRANSLATIONS, profileTranslations } from '../src/server/api/validation.ts';
import { HEADER_TEXT_SPECS, copyPrimary, emptyTranslations, formToTranslations, itemTextSpecs, translationsToForm } from '../src/components/profile/translation-form.ts';
import { anchorTarget, translateAnchor } from '../src/components/profile/translate-anchor.ts';
import { EMPTY_OVERRIDE, buildArtifactSet, restoreLanguage, stashLanguage, tailorMissing, type SelectionEntry } from '../src/components/jobs/tailoring.ts';
import { importLanguagePlan } from '../src/components/import/language.ts';
import { exportFilename, toJsonResume } from '../src/server/api/portability.ts';
import { PROFILE_ITEM_KINDS } from '../src/server/db/schema.ts';
import type { ItemKind } from '../src/lib/copy/app.ts';

test('translation form: per kind, only word fields, never required; values round-trip into what the API accepts', () => {
  let checked = 0;
  for (const kind of PROFILE_ITEM_KINDS) {
    const specs = itemTextSpecs(kind as ItemKind);
    assert.ok(specs.every((s) => !s.required && ['text', 'textarea', 'bullets'].includes(s.type)), kind);
    const values = Object.fromEntries(specs.map((s) => [s.name, s.type === 'bullets' ? 'One\n\nTwo' : `${s.name} in English`]));
    const { translations, errors } = formToTranslations(specs, values, 'en');
    assert.deepEqual(errors, {}, kind);
    if (specs.length === 0) assert.equal(translations, null, kind);
    else {
      assert.equal(ITEM_TRANSLATIONS[kind].safeParse(translations).success, true, kind);
      assert.deepEqual(translationsToForm(specs, translations, 'en'), { ...values, ...Object.fromEntries(specs.filter((s) => s.type === 'bullets').map((s) => [s.name, 'One\nTwo'])) }, kind);
    }
    checked += specs.length;
  }
  assert.ok(checked >= 20, `checked ${checked} word fields`);
  const header = formToTranslations(HEADER_TEXT_SPECS, { headline: 'Advisor', summary: ' ', location: 'Mexico City' }, 'en');
  assert.deepEqual(header.translations, { en: { headline: 'Advisor', location: 'Mexico City' } });
  assert.equal(profileTranslations.safeParse(header.translations).success, true);
  assert.equal(formToTranslations(HEADER_TEXT_SPECS, { headline: '', summary: '', location: '' }, 'en').translations, null, 'all empty: null clears');
  assert.equal(formToTranslations(HEADER_TEXT_SPECS, { headline: 'x'.repeat(201), summary: '', location: '' }, 'en').errors.headline?.code, 'tooLong');
});

test('«Copiar el texto en español»: fills only empty fields; the marks list what still lacks the other language', () => {
  const specs = itemTextSpecs('experience');
  const primary = { role: 'Asesora', location: 'CDMX', summary: '', highlights: 'Uno\nDos' };
  const typed = { role: 'Advisor', location: '', summary: '', highlights: '' };
  assert.deepEqual(emptyTranslations(specs, typed, primary), ['location', 'highlights']);
  const copied = copyPrimary(specs, typed, primary);
  assert.deepEqual(copied, { role: 'Advisor', location: 'CDMX', summary: '', highlights: 'Uno\nDos' });
  assert.deepEqual(emptyTranslations(specs, copied, primary), []);
});

test('deep links: the flag points at the item (or the header) the editor opens in the other language', () => {
  const id = '6f1c2a3b-0000-4000-8000-000000000001';
  assert.equal(anchorTarget(`#${translateAnchor(id)}`), id);
  assert.equal(anchorTarget(`#${translateAnchor(null)}`), 'header');
  assert.equal(anchorTarget('#traducir-<script>'), null);
  assert.equal(anchorTarget(''), null);
});

const SEL: SelectionEntry[] = [
  { itemId: 'e1', override: { title: 'Título', summary: '', highlights: 'Uno' } },
  { itemId: 's1', override: { ...EMPTY_OVERRIDE } },
];

test('tailoring: overrides are per language; switching stashes this language’s texts and restores the other’s', () => {
  const es = stashLanguage(SEL, { summary: 'Resumen', greeting: 'Hola:', closing: 'Saludos,' });
  const toEn = restoreLanguage(SEL, undefined);
  assert.deepEqual(toEn.selection.map((e) => e.itemId), ['e1', 's1'], 'the selection and its order are shared');
  assert.ok(toEn.selection.every((e) => e.override.title === '' && e.override.summary === '' && e.override.highlights === ''));
  assert.deepEqual([toEn.summary, toEn.greeting, toEn.closing], ['', '', '']);
  const back = restoreLanguage(toEn.selection, es);
  assert.deepEqual(back.selection, SEL);
  assert.deepEqual([back.summary, back.greeting, back.closing], ['Resumen', 'Hola:', 'Saludos,']);
  // An item added while in the other language starts empty when the person comes back.
  assert.deepEqual(restoreLanguage([...toEn.selection, { itemId: 'x9', override: { ...EMPTY_OVERRIDE } }], es).selection[2]!.override, EMPTY_OVERRIDE);
});

const PROFILE = { headline: 'Asesora', summary: 'Resumen', locale: 'es-MX' as const, contact: { location: 'CDMX' }, translations: { en: { headline: 'Advisor' } } };
const ITEMS = [
  { id: 'e1', kind: 'experience' as const, content: { role: 'Asesora', organization: 'Maison', summary: 'Texto', highlights: ['Uno'] }, translations: { en: { role: 'Advisor' } } },
  { id: 's1', kind: 'skill' as const, content: { name: 'Ventas' } },
  { id: 'l1', kind: 'language' as const, content: { name: 'Inglés' } },
];

test('tailoring: the missing texts of the documents about to be created, with overrides and the job summary considered', () => {
  const sel = (ids: string[]): SelectionEntry[] => ids.map((itemId) => ({ itemId, override: { ...EMPTY_OVERRIDE } }));
  const base = { profile: PROFILE, items: ITEMS, locale: 'en' as const, summary: '', showContact: false };
  const all = tailorMissing({ ...base, selection: sel(['e1', 's1', 'l1']) });
  assert.deepEqual(
    all.map((m) => [m.itemId, m.fields]),
    [
      [null, ['summary']],
      ['e1', ['summary', 'highlights']],
      ['s1', ['name']],
      ['l1', ['code']],
    ],
  );
  assert.deepEqual(tailorMissing({ ...base, selection: sel(['e1']), summary: 'Job summary in English', showContact: true }).map((m) => [m.itemId, m.fields]), [
    [null, ['location']],
    ['e1', ['summary', 'highlights']],
  ]);
  const overridden: SelectionEntry[] = [{ itemId: 'e1', override: { title: '', summary: 'For this job', highlights: 'One' } }];
  assert.deepEqual(tailorMissing({ ...base, selection: overridden }).map((m) => m.itemId), [null], 'an override needs no translation');
  assert.deepEqual(tailorMissing({ ...base, locale: 'es-MX', selection: sel(['e1', 's1', 'l1']) }), [], 'the primary language lacks nothing');
  // The overrides stored are the ones of the chosen language only (one language per set of documents).
  const built = buildArtifactSet({
    jobId: 'j',
    jobTitle: 'Client Advisor',
    company: 'Maison',
    kinds: ['cv'],
    template: 'base',
    locale: 'en',
    selection: overridden,
    summary: '',
    showContact: false,
    greeting: '',
    closing: '',
    kindLabels: { cv: 'CV', portfolio: 'Portafolio', presentation: 'Presentación', cover_letter: 'Carta' },
  });
  assert.ok(built.ok);
  assert.equal(built.body.locale, 'en');
  assert.deepEqual((built.body.artifacts[0]!.content as { items: unknown }).items, [{ itemId: 'e1', override: { summary: 'For this job', highlights: ['One'] } }]);
});

test('import: the file language fills the main text; an empty profile takes it as primary; otherwise it is refused', () => {
  assert.equal(importLanguagePlan('es-MX', 'es-MX', false), 'same');
  assert.equal(importLanguagePlan('en', 'es-MX', true), 'becomes_primary');
  assert.equal(importLanguagePlan('en', 'es-MX', false), 'blocked');
  assert.equal(importLanguagePlan('es-MX', 'en', false), 'blocked');
});

test('JSON Resume: one language per document; the other language falls back field by field; names from codes', () => {
  const now = new Date('2026-10-22T12:00:00Z');
  const row = { ownerSub: 'x', profileId: 'p', position: 0, tags: [], createdAt: now, updatedAt: now };
  const data = {
    profile: { id: 'p', ownerSub: 'x', displayName: 'Valeria', headline: 'Asesora', summary: 'Resumen', locale: 'es-MX', contact: { location: 'CDMX' }, translations: { en: { headline: 'Advisor', location: 'Mexico City' } }, createdAt: now, updatedAt: now },
    items: [
      { ...row, id: 'e1', kind: 'experience', content: { role: 'Asesora', organization: 'Maison', summary: 'Texto' }, translations: { en: { role: 'Advisor' } } },
      { ...row, id: 'l1', kind: 'language', content: { code: 'en', name: 'Inglés', level: 'C1' }, translations: null },
      { ...row, id: 'l2', kind: 'language', content: { name: 'Náhuatl', level: 'native' }, translations: null },
    ],
    jobs: [],
    artifacts: [],
  };
  const es = toJsonResume(data, now);
  assert.deepEqual([es.basics.label, es.basics.summary, es.basics.location?.address], ['Asesora', 'Resumen', 'CDMX']);
  assert.deepEqual(es.languages?.map((l) => l.language), ['Inglés', 'Náhuatl']);
  const en = toJsonResume(data, now, 'en');
  assert.deepEqual([en.basics.label, en.basics.summary, en.basics.location?.address, en.basics.name], ['Advisor', 'Resumen', 'Mexico City', 'Valeria']);
  assert.deepEqual([en.work?.[0]?.position, en.work?.[0]?.name, en.work?.[0]?.summary], ['Advisor', 'Maison', 'Texto']);
  assert.deepEqual(en.languages?.map((l) => l.language), ['English', 'Náhuatl']);
  assert.deepEqual(toJsonResume(data, now, 'es-MX'), es, 'the primary language asked explicitly is the default document');
  assert.equal(exportFilename('json-resume', now), 'cv-json-resume-2026-10-22.json');
  assert.equal(exportFilename('json-resume', now, 'en'), 'cv-json-resume-en-2026-10-22.json');
  assert.equal(exportFilename('json-resume', now, 'es-MX'), 'cv-json-resume-es-2026-10-22.json');
  assert.equal(exportFilename('full', now, 'en'), 'cv-mis-datos-2026-10-22.json');
});
