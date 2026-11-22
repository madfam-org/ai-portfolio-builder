/**
 * What a shared page receives (lib/shared-page.ts sharedRenderData, used by both public reads): exactly what its
 * renderer prints. Read-proof: every kind × template × locale renders the SAME markup from the shared data as from the
 * owner's full data (with and without translations, with and without the document's own summary, with stored fields
 * the page never prints), and without translations the shared data still matches
 * test/fixtures/bilingual/render-baseline.json, extras included.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { register } from 'node:module';
import { test } from 'node:test';
import type { RenderData } from '../src/components/render/model.ts';
import { sharedRenderData } from '../src/lib/shared-page.ts';
import { localizeRenderData } from '../src/components/render/localize.ts';
import { CONTACT, data } from './render-fixtures.ts';
import { MATRIX_SELECTION, renderMatrix } from './render-matrix.ts';

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

/**
 * Stored content the page never prints: an override (and a reference) of an item deleted since, an override of an item
 * of a kind no renderer draws, a field of an override no renderer reads, a blank text block, an unknown top-level field
 * and, on every kind but a presentation, slides (MATRIX_SELECTION already stores `intro`, `greeting` and `closing` on
 * every kind, and a highlights override the cover letter does not print). None of it changes the owner's own render.
 */
const NOT_PRINTED = ['Título de un elemento borrado', 'borrado-1', 'Elemento de tipo desconocido', 'Nota privada de la adaptación', 'Nota interna del documento', 'Diapositiva que no se imprime'];
function withStoredExtras(d: RenderData): RenderData {
  const content = d.artifact.content as Record<string, unknown>;
  const refs = (content.items as { itemId: string; override?: Record<string, unknown> }[]).map((r) =>
    r.itemId === 'e1' ? { ...r, override: { ...r.override, note: 'Nota privada de la adaptación' } } : r,
  );
  return {
    ...d,
    artifact: {
      ...d.artifact,
      content: {
        ...content,
        items: [...refs, { itemId: 'borrado-1', override: { title: 'Título de un elemento borrado', summary: 'x', highlights: ['y'] } }, { itemId: 'u1', override: { title: 'z' } }],
        blocks: [...(content.blocks as unknown[]), { heading: '   ', body: '  ' }],
        internalNote: 'Nota interna del documento',
        ...(d.artifact.kind === 'presentation' ? {} : { slides: [{ title: 'Diapositiva que no se imprime', itemIds: ['e1'] }] }),
      },
    },
    items: [...d.items, { id: 'u1', kind: 'unknown_kind', content: { name: 'Elemento de tipo desconocido' } }],
  };
}

/** A recommendation with an override (never applied) and a repeated reference (printed twice, as the owner sees it). */
function withRecommendation(d: RenderData): RenderData {
  const content = d.artifact.content as Record<string, unknown>;
  const refs = content.items as unknown[];
  return {
    ...d,
    artifact: { ...d.artifact, content: { ...content, items: [...refs, { itemId: 'r1', override: { title: 'Título que no se aplica', summary: 's' } }, { itemId: 'e2' }] } },
    items: [...d.items, { id: 'r1', kind: 'recommendation', content: { name: 'Berta Ejemplo', relationship: 'Jefa directa', text: 'Muy buena colega.' } }],
  };
}

/** Slides of its own on every kind (only a presentation prints them, and then not the text blocks or the selection). */
function withOwnSlides(d: RenderData): RenderData {
  const extras = withStoredExtras(d);
  const slides = [{ title: 'Mi trayectoria', body: 'Texto de la diapositiva', itemIds: ['e1', 'borrado-1', 'u1', 'p1'] }, { title: '', itemIds: [] }];
  return { ...extras, artifact: { ...extras.artifact, content: { ...(extras.artifact.content as object), slides } } };
}

test('every kind × template × locale renders the same markup from the shared data as from the owner data (read-proof)', () => {
  const variants: [string, (d: RenderData) => RenderData][] = [
    ['plain', (d) => d],
    ['no own summary', withoutOwnSummary],
    ['translated', (d) => translated(d)],
    ['translated, no own summary', (d) => translated(withoutOwnSummary(d))],
    ['English primary', (d) => translated(withoutOwnSummary(d), 'en')],
    ['stored extras', withStoredExtras],
    ['stored extras, translated, no own summary', (d) => translated(withStoredExtras(withoutOwnSummary(d)))],
    ['recommendation override, repeated reference', withRecommendation],
    ['slides of its own', withOwnSlides],
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
  assert.ok(compared >= 9 * 32, `cases compared: ${compared}`);
});

test('without translations the shared data renders the committed render baseline', () => {
  const now = renderMatrix((d) => render(sharedRenderData(d)), templatesFor);
  const { hashes } = JSON.parse(readFileSync(BASELINE, 'utf8')) as { hashes: Record<string, string> };
  assert.ok(Object.keys(hashes).length >= 32, `baseline cases: ${Object.keys(hashes).length}`);
  assert.deepEqual(Object.keys(now).sort(), Object.keys(hashes).sort());
  for (const [key, hash] of Object.entries(hashes)) assert.equal(now[key], hash, key);
  const extras = renderMatrix((d) => render(sharedRenderData(withStoredExtras(d))), templatesFor);
  for (const [key, hash] of Object.entries(hashes)) assert.equal(extras[key], hash, `stored extras: ${key}`);
});

test('the content carries only what the renderer of its kind reads; only the items it references are carried', () => {
  const kinds = ['cv', 'portfolio', 'presentation', 'cover_letter'] as const;
  const shared = Object.fromEntries(kinds.map((k) => [k, sharedRenderData(withStoredExtras(data(k, { ...MATRIX_SELECTION }, { contact: CONTACT })))])) as Record<(typeof kinds)[number], ReturnType<typeof sharedRenderData>>;
  for (const kind of kinds) {
    const json = JSON.stringify(shared[kind]);
    for (const text of NOT_PRINTED) assert.equal(json.includes(text), false, `${kind}: ${text}`);
    assert.equal(json.includes('showContact'), false, `${kind}: showContact`);
  }
  const keys = (k: (typeof kinds)[number]) => Object.keys(shared[k].artifact.content as object).sort();
  const ids = (k: (typeof kinds)[number]) => shared[k].items.map((i) => i.id);
  assert.deepEqual(keys('cv'), ['blocks', 'items', 'summary']);
  assert.deepEqual(keys('portfolio'), ['blocks', 'intro', 'items'], 'the intro is printed in place of the summary');
  assert.deepEqual(keys('presentation'), ['blocks', 'items'], 'no slide prints a summary or an intro');
  assert.deepEqual(keys('cover_letter'), ['blocks', 'closing', 'greeting', 'items', 'summary']);
  assert.equal(shared.portfolio.profile.summary, '');
  assert.equal(shared.presentation.profile.summary, '');
  assert.deepEqual(ids('cv'), ['e1', 'e2', 'd1', 's1', 's2', 'l1', 'p1', 'c1', 'x1']);
  assert.deepEqual(ids('cover_letter'), ['e1', 'e2', 'p1'], 'the letter lists at most three roles or projects');
  assert.deepEqual((shared.cover_letter.artifact.content as { items: unknown[] }).items, [{ itemId: 'e1', override: { title: 'Líder de datos' } }, { itemId: 'e2' }, { itemId: 'p1' }]);
  assert.deepEqual((shared.cv.artifact.content as { items: unknown[] }).items[0], { itemId: 'e1', override: { title: 'Líder de datos', highlights: ['Logro adaptado'] } });

  const deck = sharedRenderData(withOwnSlides(data('presentation', { ...MATRIX_SELECTION })));
  assert.deepEqual(deck.artifact.content, {
    items: [{ itemId: 'e1', override: { title: 'Líder de datos', highlights: ['Logro adaptado'] } }],
    slides: [{ title: 'Mi trayectoria', body: 'Texto de la diapositiva', itemIds: ['e1', 'p1'] }, { title: '', itemIds: [] }],
  });
  assert.deepEqual(deck.items.map((i) => i.id), ['e1', 'p1']);
  const rec = sharedRenderData(withRecommendation(data('cv', { items: [] })));
  assert.deepEqual(rec.artifact.content, { items: [{ itemId: 'r1' }, { itemId: 'e2' }], blocks: [] }, 'a recommendation is never overridden');
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

test('a cover letter with a body of its own carries the body, but neither summary; a body reaches a shared page only in a letter', () => {
  const letter = sharedRenderData(translated(data('cover_letter', { summary: 'Resumen propio', body: 'Cuerpo propio de la carta.', items: [] }, { locale: 'en' })));
  assert.equal((letter.artifact.content as Record<string, unknown>).body, 'Cuerpo propio de la carta.');
  assert.equal('summary' in (letter.artifact.content as object), false, 'the document summary is not printed under a body, so it is not carried');
  assert.equal(letter.profile.summary, '');
  for (const notPrinted of ['Resumen propio', 'Resumen del perfil', 'Profile summary (en)']) assert.equal(JSON.stringify(letter).includes(notPrinted), false, `not carried: ${notPrinted}`);
  // Nor is the profile summary's missing English counted in «Faltan N textos en inglés»: the letter does not print it.
  const untranslated = (d: RenderData): RenderData => ({ ...d, profile: { ...d.profile, locale: 'es-MX', translations: { en: { headline: 'Advisor' } } } });
  const headerMissing = (content: Record<string, unknown>) => localizeRenderData(untranslated(data('cover_letter', content, { locale: 'en' }))).missing.find((m) => m.itemId === null)?.fields ?? [];
  assert.deepEqual(headerMissing({ body: 'Cuerpo propio.', items: [] }), []);
  assert.deepEqual(headerMissing({ items: [] }), ['summary'], 'without a body the letter prints the profile summary, so its English is missing');

  const noBody = sharedRenderData(data('cover_letter', { summary: 'Resumen propio', body: '  ', items: [] }));
  assert.equal((noBody.artifact.content as Record<string, unknown>).summary, 'Resumen propio', 'a blank body: the letter prints its summary, as before');
  assert.equal('body' in (noBody.artifact.content as object), false, 'and a blank body is not carried');

  // Content the API would refuse (a body outside a letter) still never reaches a shared page.
  for (const kind of ['cv', 'portfolio', 'presentation']) {
    const shared = sharedRenderData(data(kind, { summary: 'Resumen propio', body: 'Cuerpo que no se imprime', items: [] }));
    assert.equal(JSON.stringify(shared).includes('Cuerpo que no se imprime'), false, kind);
    assert.equal((shared.artifact.content as Record<string, unknown>).summary, 'Resumen propio', `${kind}: its summary stays`);
  }
  // Nothing to drop: the content is passed on as it is.
  const plain = data('cover_letter', { summary: 'Resumen propio', items: [] });
  assert.equal(sharedRenderData(plain).artifact.content, plain.artifact.content);
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
