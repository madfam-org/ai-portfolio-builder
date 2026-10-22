/**
 * The renderers' real markup, one test per kind (react-dom/server over the actual components; JSX through the
 * test-only hooks in render-loader.mjs). Snapshot-free: headings and their order, overrides applied, links safe, no
 * style attribute, no image, no «undefined», user text inert.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { test } from 'node:test';
import { CONTACT, XSS, data } from './render-fixtures.ts';

register('./render-loader.mjs', import.meta.url);
const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { ArtifactView, templatesFor } = await import('../src/components/render/ArtifactView.tsx');
const { nextIndex } = await import('../src/components/render/SlideDeck.tsx');

function render(d: ReturnType<typeof data>, paper?: 'letter' | 'a4'): string {
  return renderToStaticMarkup(createElement(ArtifactView, { data: d, paper }));
}

/** Headings in document order, as `h2:Experiencia`. */
function headings(html: string): string[] {
  // The heading's text nodes only (splitting on tags; a test reads markup, it never sanitises it).
  return [...html.matchAll(/<(h[1-4])\b[^>]*>(.*?)<\/\1>/g)].map((m) => `${m[1]}:${m[2]!.split(/<[^>]*>/).join('')}`);
}

/** Every safety rule of lane X §4 on one piece of markup. */
function assertSafe(html: string) {
  assert.doesNotMatch(html, /\sstyle=/i, 'no style attribute');
  assert.doesNotMatch(html, /<img\b/i, 'no image element');
  assert.doesNotMatch(html, /undefined|\[object Object\]|NaN/, 'nothing undefined printed');
  // Attribute NAMES only (a quoted value may legitimately contain the escaped text « onerror=»).
  const names = [...html.matchAll(/<[a-z][^>]*>/gi)].map((m) => m[0].replace(/"[^"]*"/g, '""'));
  assert.deepEqual(names.filter((tag) => /\son[a-z]+=/i.test(tag)), [], 'no event handler attribute on any element');
  const anchors = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
  for (const a of anchors) {
    const href = /href="([^"]*)"/.exec(a)?.[1] ?? '';
    assert.match(href, /^(https?:\/\/|mailto:|tel:)/, `unsafe href ${href}`);
    assert.match(a, /rel="ugc nofollow noopener noreferrer"/, `rel missing on ${a}`);
  }
  return anchors.length;
}

const SELECTION = {
  summary: 'Resumen adaptado al puesto',
  items: [{ itemId: 'e1', override: { title: 'Líder de datos', highlights: ['Logro adaptado'] } }, { itemId: 'e2' }, { itemId: 'd1' }, { itemId: 's1' }, { itemId: 'l1' }, { itemId: 'p1' }, { itemId: 'x1' }],
  blocks: [{ heading: 'Por qué Acme', body: 'Primer párrafo\n\nSegundo párrafo' }],
  showContact: true,
};

test('cv/base: one h1 (the person), h2 sections in the owner\'s order, h3 entries, overrides applied, ATS text', () => {
  const html = render(data('cv', SELECTION, { contact: CONTACT }), 'a4');
  assert.deepEqual(headings(html), [
    'h1:Ana Prueba',
    'h2:Perfil profesional',
    'h2:Experiencia',
    'h3:Líder de datos',
    'h3:Analista',
    'h2:Educación',
    'h3:Ingeniería, Computación',
    'h2:Habilidades',
    'h2:Idiomas',
    'h2:Proyectos',
    'h3:Tablero',
    'h2:Enlaces',
    'h2:Por qué Acme',
  ]);
  assert.ok(html.includes('Logro adaptado') && !html.includes('Original highlight'), 'override highlights replace the originals');
  assert.ok(html.includes('Original summary'), 'no summary override: the profile item\'s summary stays');
  assert.ok(html.includes('Resumen adaptado al puesto') && !html.includes('Resumen del perfil'));
  assert.match(html, /ene 2022 – Actualidad/);
  assert.match(html, /Python<\/span><span> — Avanzado, 5 años/);
  assert.doesNotMatch(html, /<table|<svg|%<\/|width="/i, 'no tables, icons or bars');
  assert.ok(html.includes('data-paper="a4"') && html.includes('paperA4'), 'the paper toggle reaches the sheet');
  assert.ok(assertSafe(html) >= 5, 'links were checked');
  assert.ok(!html.includes('javascript:') && !html.includes('data:text'), 'unsafe links are gone, not neutralised');
});

test('portfolio/base: intro, cards per section, blocks, contact last; same safety', () => {
  const html = render(data('portfolio', { ...SELECTION, intro: 'Hola, soy Ana' }, { contact: CONTACT }));
  const h = headings(html);
  assert.equal(h[0], 'h1:Ana Prueba');
  assert.deepEqual(h.filter((x) => x.startsWith('h2:')), ['h2:Experiencia', 'h2:Educación', 'h2:Habilidades', 'h2:Idiomas', 'h2:Proyectos', 'h2:Enlaces', 'h2:Por qué Acme', 'h2:Contacto']);
  assert.ok(html.includes('Hola, soy Ana') && html.includes('class="cards"'));
  assertSafe(html);
});

test('presentation/base: a title slide, then one <section> per slide (own slides with their items), keyboard map', () => {
  const html = render(
    data('presentation', { items: [{ itemId: 'e1', override: { title: 'Líder de datos' } }], slides: [{ title: 'Por qué yo', body: 'Porque sí', itemIds: ['e1'] }, { title: 'Habilidades clave', itemIds: ['s1', 'l1'] }] }, { contact: CONTACT }),
  );
  assert.deepEqual(headings(html), ['h1:Documento presentation', 'h2:Por qué yo', 'h3:Líder de datos', 'h2:Habilidades clave', 'h2:Contacto']);
  assert.equal((html.match(/<section class="slide/g) ?? []).length, 4);
  assert.match(html, /data-enhanced="false"/, 'the server render shows every slide (no script needed)');
  assert.ok(html.includes('paperSlides') && html.includes('data-paper="slides"'));
  assertSafe(html);
  assert.equal(nextIndex('ArrowRight', false, 0, 4), 1);
  assert.equal(nextIndex('ArrowRight', false, 3, 4), 3);
  assert.equal(nextIndex('ArrowLeft', false, 0, 4), 0);
  assert.equal(nextIndex(' ', true, 2, 4), 1);
  assert.equal(nextIndex('End', false, 0, 4), 3);
  assert.equal(nextIndex('Home', false, 3, 4), 0);
  assert.equal(nextIndex('a', false, 1, 4), null);
});

test('cover_letter/base: greeting, opening, blocks, relevant items, closing, signature; nothing added', () => {
  const html = render(data('cover_letter', { summary: 'Me interesa el puesto.', greeting: 'Estimado equipo de Acme:', closing: 'Saludos cordiales,', items: [{ itemId: 'e1' }], blocks: [{ body: 'Cuerpo de la carta' }] }));
  assert.deepEqual(headings(html), ['h1:Ana Prueba', 'h2:Experiencia relevante', 'h3:Ingeniera de datos']);
  const order = ['Estimado equipo de Acme:', 'Me interesa el puesto.', 'Cuerpo de la carta', 'Experiencia relevante', 'Saludos cordiales,', 'class="signature">Ana Prueba'].map((s) => html.indexOf(s));
  assert.ok(order.every((i) => i >= 0) && order.every((i, k) => k === 0 || i > order[k - 1]!), `order ${order}`);
  assert.doesNotMatch(html, /mailto:|tel:/, 'no contact unless shown');
  assertSafe(html);
});

test('user text is inert in every kind and every field; an empty document prints nothing invented', () => {
  for (const kind of ['cv', 'portfolio', 'presentation', 'cover_letter']) {
    const d = data(kind, { summary: XSS, items: [{ itemId: 'e1', override: { title: XSS, summary: XSS, highlights: [XSS] } }], blocks: [{ heading: XSS, body: XSS }], greeting: XSS, closing: XSS, intro: XSS, slides: [{ title: XSS, body: XSS, itemIds: ['e1'] }] });
    d.profile = { displayName: XSS, headline: XSS, summary: XSS };
    const html = render(d);
    assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'), kind);
    assertSafe(html);
    const empty = render({ artifact: { kind, title: 'Vacío', locale: 'es-MX', template: 'base', content: {} }, profile: { displayName: '', headline: '', summary: '' }, items: [] });
    assertSafe(empty);
    assert.match(empty, /<h1[^>]*>Vacío<\/h1>/, `${kind}: without a name the title is the heading`);
  }
});

test('the registry: one base template per kind; an unknown template falls back to its own kind and is logged', () => {
  assert.deepEqual(['cv', 'portfolio', 'presentation', 'cover_letter'].map((k) => templatesFor(k as 'cv')), [['base'], ['base'], ['base'], ['base']]);
  const warn = console.warn;
  const logged: string[] = [];
  console.warn = (m: string) => logged.push(m);
  try {
    const html = render(data('portfolio', { items: [] }, { template: 'no-existe' }));
    assert.match(html, /data-kind="portfolio"/);
  } finally {
    console.warn = warn;
  }
  assert.equal(logged.length, 1);
  assert.match(logged[0]!, /unknown template "no-existe" for portfolio/);
});

test('english documents use english labels and dates', () => {
  const html = render(data('cv', { items: [{ itemId: 'e1' }, { itemId: 's1' }] }, { locale: 'en' }));
  assert.deepEqual(headings(html).filter((h) => h.startsWith('h2:')), ['h2:Summary', 'h2:Experience', 'h2:Skills']);
  assert.match(html, /Jan 2022 – Present/);
  assert.match(html, /lang="en"/);
});
