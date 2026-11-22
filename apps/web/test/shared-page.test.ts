/**
 * What a shared page receives (lib/shared-page.ts sharedRenderData, used by both public reads): exactly what its
 * renderer prints. Read-proof: every kind × template × locale renders the SAME markup from the shared data as from the
 * owner's full data (with and without translations, with and without the document's own summary), and without
 * translations the shared data still matches test/fixtures/bilingual/render-baseline.json.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { register } from 'node:module';
import { test } from 'node:test';
import type { RenderData } from '../src/components/render/model.ts';
import { sharedRenderData } from '../src/lib/shared-page.ts';
import { CONTACT, data } from './render-fixtures.ts';
import { renderMatrix } from './render-matrix.ts';

register('./render-loader.mjs', import.meta.url);
const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { ArtifactView, templatesFor } = await import('../src/components/render/ArtifactView.tsx');

const render = (d: RenderData) => renderToStaticMarkup(createElement(ArtifactView, { data: d }));
const BASELINE = join(import.meta.dirname, 'fixtures', 'bilingual', 'render-baseline.json');

/** An English version of the fixtures' word fields (some left out on purpose: they fall back to the Spanish text). */
const ENGLISH: Record<string, Record<string, unknown>> = {
  e1: { role: 'Data engineer', location: 'Mexico City', summary: 'English summary', highlights: ['English highlight'] },
  d1: { degree: 'Engineering' },
  s1: { name: 'Python (en)' },
  p1: { name: 'Dashboard' },
  x1: { label: 'Website' },
};
const LANGUAGE = { id: 'l2', kind: 'language', content: { code: 'fr', name: 'Francés', level: 'B1' } };

function translated(d: RenderData, primary = 'es-MX'): RenderData {
  const content = d.artifact.content as Record<string, unknown>;
  return {
    ...d,
    artifact: { ...d.artifact, content: { ...content, items: [...(content.items as unknown[]), { itemId: 'l2' }] } },
    profile: { ...d.profile, locale: primary, translations: { en: { headline: 'Data engineer (en)', summary: 'Profile summary (en)', location: 'Cuernavaca (en)' } } },
    items: [...d.items.map((i) => (ENGLISH[i.id] ? { ...i, translations: { en: ENGLISH[i.id] } } : i)), LANGUAGE],
  };
}

function withoutOwnSummary(d: RenderData): RenderData {
  const content = { ...(d.artifact.content as Record<string, unknown>) };
  delete content.summary;
  return { ...d, artifact: { ...d.artifact, content } };
}

test('every kind × template × locale renders the same markup from the shared data as from the owner data (read-proof)', () => {
  const variants: [string, (d: RenderData) => RenderData][] = [
    ['plain', (d) => d],
    ['no own summary', withoutOwnSummary],
    ['translated', (d) => translated(d)],
    ['translated, no own summary', (d) => translated(withoutOwnSummary(d))],
    ['English primary', (d) => translated(withoutOwnSummary(d), 'en')],
  ];
  let compared = 0;
  for (const [name, variant] of variants) {
    const full = renderMatrix((d) => render(variant(d)), templatesFor);
    const shared = renderMatrix((d) => render(sharedRenderData(variant(d))), templatesFor);
    assert.deepEqual(Object.keys(shared).sort(), Object.keys(full).sort());
    for (const [key, hash] of Object.entries(full)) {
      assert.equal(shared[key], hash, `${name}: ${key}`);
      compared += 1;
    }
  }
  assert.ok(compared >= 5 * 32, `cases compared: ${compared}`);
});

test('without translations the shared data renders the committed render baseline', () => {
  const now = renderMatrix((d) => render(sharedRenderData(d)), templatesFor);
  const { hashes } = JSON.parse(readFileSync(BASELINE, 'utf8')) as { hashes: Record<string, string> };
  assert.ok(Object.keys(hashes).length >= 32, `baseline cases: ${Object.keys(hashes).length}`);
  assert.deepEqual(Object.keys(now).sort(), Object.keys(hashes).sort());
  for (const [key, hash] of Object.entries(hashes)) assert.equal(now[key], hash, key);
});

test('the title is never carried, even when the input has one', () => {
  const d = data('cv', { items: [{ itemId: 'e1' }] });
  Object.assign(d.artifact, { title: 'CV · Empresa Confidencial Ejemplo' });
  const shared = sharedRenderData(d);
  assert.deepEqual(Object.keys(shared.artifact).sort(), ['content', 'kind', 'locale', 'template']);
  assert.equal(JSON.stringify(shared).includes('Empresa Confidencial'), false);
});

test('a document with its own summary does not carry the profile summary, nor its translation', () => {
  const own = sharedRenderData(translated(data('cv', { summary: 'Resumen propio', items: [] }, { locale: 'en' })));
  assert.equal(own.profile.summary, '');
  assert.equal(JSON.stringify(own).includes('Resumen del perfil'), false);
  assert.equal(JSON.stringify(own).includes('Profile summary (en)'), false);
  const blank = sharedRenderData(data('cv', { summary: '   ', items: [] }));
  assert.equal(blank.profile.summary, 'Resumen del perfil', 'a blank summary of its own prints the profile summary');
  assert.equal(sharedRenderData(data('cv', { items: [] })).profile.summary, 'Resumen del perfil');
});

test('text arrives in the document language: translations replace the primary text, untranslated fields keep it, nothing else is carried', () => {
  const en = sharedRenderData(translated(data('cv', { items: [{ itemId: 'e1' }, { itemId: 'e2' }, { itemId: 'd1' }], showContact: true }, { locale: 'en', contact: CONTACT })));
  assert.deepEqual(en.profile, { displayName: 'Ana Prueba', headline: 'Data engineer (en)', summary: 'Profile summary (en)', contact: { ...CONTACT, location: 'Cuernavaca (en)' } });
  const byId = new Map(en.items.map((i) => [i.id, i]));
  assert.deepEqual(byId.get('e1')?.content, { ...data('cv', {}).items[0]!.content as object, role: 'Data engineer', location: 'Mexico City', summary: 'English summary', highlights: ['English highlight'] });
  assert.equal((byId.get('e2')?.content as { role: string }).role, 'Analista', 'no translation: the primary text, which is what the page prints');
  assert.deepEqual(byId.get('d1')?.content, { institution: 'UNAM', degree: 'Engineering', field: 'Computación', startDate: '2014', endDate: '2018' });
  assert.equal((byId.get('l2')?.content as { name: string }).name, 'French', 'a language from its ISO 639 code');
  for (const item of en.items) assert.deepEqual(Object.keys(item).sort(), ['content', 'id', 'kind'], 'no translations per item');
  assert.equal('locale' in en.profile || 'translations' in en.profile, false, 'no primary language, no translations');
  const json = JSON.stringify(en);
  for (const spanish of ['Ingeniera de datos', 'Original summary', 'Original highlight', 'Ingeniería', 'Francés']) assert.equal(json.includes(spanish), false, `not carried: ${spanish}`);

  const es = sharedRenderData(translated(data('cv', { items: [{ itemId: 'e1' }] }, { locale: 'es-MX' })));
  assert.equal(es.profile.headline, 'Ingeniera de datos', 'a document in the primary language reads the stored text');
  assert.equal(JSON.stringify(es).includes('(en)'), false, 'and carries no other language');
});
