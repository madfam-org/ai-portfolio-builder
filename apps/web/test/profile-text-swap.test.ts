/**
 * W7 (B4): changing the profile's primary language swaps the texts field by field (lib/profile-text-swap.ts):
 * partial translations, none, recommendations, both directions, the round trip, and the rule that every document
 * renders the same text in both languages before and after (localizeItem / localizeHeader).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ItemKind } from '../src/lib/copy/app.ts';
import { ITEM_TEXT_FIELDS, localizeHeader, localizeItem, type ContentLocale } from '../src/lib/profile-text.ts';
import { swapHeaderTexts, swapItemTexts, swapPrimaryTexts } from '../src/lib/profile-text-swap.ts';

const EXPERIENCE = {
  role: 'Asesora de ventas',
  organization: 'Maison Ejemplo',
  location: 'Ciudad de México',
  startDate: '2021-02',
  summary: 'Atención a clientes nacionales e internacionales.',
  highlights: ['Cumplí el 112 % de mi meta.', 'Formé una cartera de 150 clientes.'],
};
const EXPERIENCE_EN = { en: { role: 'Sales advisor', location: 'Mexico City', highlights: ['Reached 112% of my target.', 'Built a book of 150 clients.'] } };

test('partial translations: translated fields swap, the old text moves to the old language, untranslated fields stay', () => {
  const r = swapItemTexts('experience', EXPERIENCE, EXPERIENCE_EN, 'es-MX', 'en');
  assert.equal(r.changed, true);
  assert.deepEqual(r.content, {
    ...EXPERIENCE,
    role: 'Sales advisor',
    location: 'Mexico City',
    highlights: ['Reached 112% of my target.', 'Built a book of 150 clients.'],
  });
  assert.equal(r.content.summary, EXPERIENCE.summary, 'no translation: the field keeps its value');
  assert.equal(r.content.organization, 'Maison Ejemplo', 'a proper name never moves');
  assert.deepEqual(r.translations, { 'es-MX': { role: EXPERIENCE.role, location: EXPERIENCE.location, highlights: EXPERIENCE.highlights } }, 'nothing added for summary');
  assert.equal(Object.keys(r.translations ?? {}).includes('en'), false, 'the new primary language entry is removed');
});

test('no translations: nothing changes and nothing is written', () => {
  for (const tr of [null, undefined, {}, { 'es-MX': {} }]) {
    const r = swapItemTexts('experience', EXPERIENCE, tr, 'es-MX', 'en');
    assert.equal(r.changed, false, JSON.stringify(tr));
    assert.deepEqual(r.content, EXPERIENCE);
    assert.equal(r.translations, null);
  }
  const same = swapItemTexts('experience', EXPERIENCE, EXPERIENCE_EN, 'en', 'en');
  assert.equal(same.changed, false, 'the language did not change');
  assert.deepEqual(same.content, EXPERIENCE);
});

test('recommendations: only role and relationship swap; the recommender\'s words and name never do', () => {
  const content = { name: 'Ana Ficticia', role: 'Gerente de tienda', organization: 'Maison Ejemplo', relationship: 'Fue mi jefa directa', text: 'Una vendedora excepcional.' };
  const tr = { en: { role: 'Store manager', relationship: 'She was my direct manager', text: 'An exceptional seller.', name: 'Ann' } };
  const r = swapItemTexts('recommendation', content, tr, 'es-MX', 'en');
  assert.deepEqual(r.content, { ...content, role: 'Store manager', relationship: 'She was my direct manager' });
  assert.equal(r.content.text, 'Una vendedora excepcional.', 'verbatim words untouched');
  assert.equal(r.content.name, 'Ana Ficticia');
  assert.deepEqual(r.translations, { 'es-MX': { role: 'Gerente de tienda', relationship: 'Fue mi jefa directa' } });
  assert.deepEqual(ITEM_TEXT_FIELDS.recommendation, ['role', 'relationship']);
});

test('language items carry no word fields: nothing moves', () => {
  const r = swapItemTexts('language', { code: 'en', name: 'Inglés', level: 'C1' }, null, 'es-MX', 'en');
  assert.equal(r.changed, false);
  assert.deepEqual(r.content, { code: 'en', name: 'Inglés', level: 'C1' });
});

test('both directions: en → es-MX swaps the same way', () => {
  const content = { role: 'Sales advisor', organization: 'Maison Ejemplo', summary: 'Clienteling.' };
  const r = swapItemTexts('experience', content, { 'es-MX': { role: 'Asesora de ventas', summary: 'Atención personalizada.' } }, 'en', 'es-MX');
  assert.deepEqual(r.content, { role: 'Asesora de ventas', organization: 'Maison Ejemplo', summary: 'Atención personalizada.' });
  assert.deepEqual(r.translations, { en: { role: 'Sales advisor', summary: 'Clienteling.' } });
});

test('round trip es-MX → en → es-MX returns the original rows (items and header)', () => {
  const kinds: [ItemKind, Record<string, unknown>, unknown][] = [
    ['experience', EXPERIENCE, EXPERIENCE_EN],
    ['skill', { name: 'Atención al cliente', level: 'expert' }, { en: { name: 'Customer service' } }],
    ['recommendation', { name: 'Ana', role: 'Gerente', relationship: 'Jefa', text: 'Excelente.' }, { en: { role: 'Manager' } }],
    ['education', { institution: 'UNAM', degree: 'Licenciatura', field: 'Mercadotecnia' }, null],
  ];
  for (const [kind, content, tr] of kinds) {
    const there = swapItemTexts(kind, content, tr, 'es-MX', 'en');
    const back = swapItemTexts(kind, there.content, there.translations, 'en', 'es-MX');
    assert.deepEqual(back.content, content, kind);
    assert.deepEqual(back.translations, tr, kind);
  }
  const header = { headline: 'Asesora de ventas de lujo', summary: 'Cinco años en boutique.', location: 'Ciudad de México' };
  const headerEn = { en: { headline: 'Luxury sales advisor', location: 'Mexico City' } };
  const there = swapHeaderTexts(header, headerEn, 'es-MX', 'en');
  assert.deepEqual(there.header, { headline: 'Luxury sales advisor', summary: 'Cinco años en boutique.', location: 'Mexico City' });
  assert.deepEqual(there.translations, { 'es-MX': { headline: 'Asesora de ventas de lujo', location: 'Ciudad de México' } });
  const back = swapHeaderTexts(there.header, there.translations, 'en', 'es-MX');
  assert.deepEqual(back.header, header);
  assert.deepEqual(back.translations, headerEn);
});

test('header without a place keeps none; a stale entry of the old primary language is repaired by switching back', () => {
  const r = swapHeaderTexts({ headline: 'Asesora', summary: '' }, { en: { headline: 'Advisor' } }, 'es-MX', 'en');
  assert.deepEqual(r.header, { headline: 'Advisor', summary: '' });
  assert.deepEqual(r.translations, { 'es-MX': { headline: 'Asesora' } });
  // Saved before this rule: primary `en`, Spanish text in the fields, the English text still stored under `en`.
  const stale = swapHeaderTexts({ headline: 'Asesora', summary: '' }, { en: { headline: 'Advisor' } }, 'en', 'es-MX');
  assert.equal(stale.changed, false, 'no es-MX translation: nothing moves');
  assert.deepEqual(stale.translations, { en: { headline: 'Advisor' } }, 'the English text is the other language again');
});

test('a translation of a field that was empty becomes its text; a shape mismatch is not moved', () => {
  const r = swapPrimaryTexts(['headline', 'summary'], { headline: '', summary: 'Resumen' }, { en: { headline: 'Advisor' } }, 'es-MX', 'en');
  assert.deepEqual(r.content, { headline: 'Advisor', summary: 'Resumen' });
  assert.equal(r.translations, null, 'nothing to keep: the old value was empty');
  const m = swapPrimaryTexts(['highlights'], { highlights: ['Uno'] }, { en: { highlights: 'One' } }, 'es-MX', 'en');
  assert.deepEqual(m.content, { highlights: ['Uno'] });
  assert.equal(m.translations, null);
});

test('every document renders the same text in both languages before and after the switch (read-proof)', () => {
  const items: [ItemKind, Record<string, unknown>, unknown][] = [
    ['experience', EXPERIENCE, EXPERIENCE_EN],
    ['project', { name: 'Vitrina', role: 'Líder', summary: 'Rediseño.', highlights: ['Uno'] }, { en: { name: 'Showcase', highlights: ['One'] } }],
    ['skill', { name: 'Atención al cliente' }, null],
    ['recommendation', { name: 'Ana', role: 'Gerente', relationship: 'Jefa', text: 'Excelente.' }, { en: { relationship: 'Manager' } }],
    ['language', { code: 'fr', name: 'Francés', level: 'B2' }, null],
  ];
  let compared = 0;
  const locales: ContentLocale[] = ['es-MX', 'en'];
  for (const [kind, content, tr] of items) {
    const after = swapItemTexts(kind, content, tr, 'es-MX', 'en');
    for (const target of locales) {
      const was = localizeItem(kind, content, tr, 'es-MX', target);
      const now = localizeItem(kind, after.content, after.translations, 'en', target);
      assert.deepEqual(now.content, was.content, `${kind} in ${target}`);
      compared += Object.keys(was.content).length;
    }
  }
  const header = { headline: 'Asesora de ventas de lujo', summary: 'Cinco años en boutique.', location: 'Ciudad de México' };
  const headerTr = { en: { headline: 'Luxury sales advisor' } };
  const after = swapHeaderTexts(header, headerTr, 'es-MX', 'en');
  for (const target of locales) {
    assert.deepEqual(localizeHeader(after.header, after.translations, 'en', target).header, localizeHeader(header, headerTr, 'es-MX', target).header, `header in ${target}`);
    compared += 3;
  }
  assert.ok(compared >= 40, `compared ${compared} rendered fields`);
});
