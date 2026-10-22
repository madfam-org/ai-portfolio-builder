/**
 * The document model (components/render/model.ts): order, overrides, sections, links, contact, dates and the
 * «invent nothing» rule, without React. The markup itself is tested in render-html.test.ts.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDocModel, formatPartialDate, httpLink, ownerRenderData, readContent } from '../src/components/render/model.ts';
import { CONTACT, data } from './render-fixtures.ts';

test('sections follow the owner\'s order (kind of first appearance), entries keep the selection order', () => {
  const m = buildDocModel(data('cv', { items: [{ itemId: 's1' }, { itemId: 'e2' }, { itemId: 'e1' }, { itemId: 's2' }, { itemId: 'l1' }] }));
  assert.deepEqual(m.sections.map((s) => s.kind), ['skill', 'experience', 'language']);
  assert.deepEqual(m.sections.map((s) => s.heading), ['Habilidades', 'Experiencia', 'Idiomas']);
  assert.deepEqual(m.sections[1]!.entries.map((e) => e.id), ['e2', 'e1']);
  assert.deepEqual(m.sections[0]!.entries.map((e) => e.id), ['s1', 's2']);
  assert.equal(m.sections[0]!.compact, true);
});

test('per-item overrides replace the title, summary and highlights; the rest stays the profile\'s', () => {
  const m = buildDocModel(data('cv', { items: [{ itemId: 'e1', override: { title: 'Líder de datos', summary: 'Resumen adaptado', highlights: ['Logro adaptado'] } }] }));
  const e = m.sections[0]!.entries[0]!;
  assert.equal(e.title, 'Líder de datos');
  assert.equal(e.summary, 'Resumen adaptado');
  assert.deepEqual(e.highlights, ['Logro adaptado']);
  assert.equal(e.subtitle, 'Acme');
  assert.deepEqual(e.meta, ['Tiempo completo', 'CDMX']);
  assert.equal(e.dates, 'ene 2022 – Actualidad');
});

test('items not in the data (deleted, or another person\'s) are skipped, never rendered empty', () => {
  const m = buildDocModel(data('cv', { items: [{ itemId: 'missing' }, { itemId: 'e2' }] }));
  assert.deepEqual(m.sections.flatMap((s) => s.entries.map((e) => e.id)), ['e2']);
});

test('only http(s) links survive; javascript: and data: are dropped; labels show the host', () => {
  assert.equal(httpLink('javascript:alert(1)'), null);
  assert.equal(httpLink('data:text/html,hi'), null);
  assert.equal(httpLink('mailto:a@b.co'), null);
  assert.equal(httpLink('nota un url'), null);
  assert.deepEqual(httpLink('https://example.test/a/', 'Web'), { href: 'https://example.test/a/', text: 'Web', host: 'example.test' });
  assert.deepEqual(httpLink('https://example.test/a/'), { href: 'https://example.test/a/', text: 'example.test/a', host: null });
  const m = buildDocModel(data('portfolio', { items: [{ itemId: 'p1' }] }));
  assert.deepEqual(m.sections[0]!.entries[0]!.links.map((l) => l.href), ['https://example.test/code']);
});

test('skills are words, never percentages; languages and certifications read as written', () => {
  const m = buildDocModel(data('cv', { items: [{ itemId: 's1' }, { itemId: 'l1' }, { itemId: 'c1' }] }));
  const [skill, lang, cert] = m.sections.map((s) => s.entries[0]!);
  assert.deepEqual(skill!.meta, ['Avanzado', '5 años']);
  assert.deepEqual(lang!.meta, ['C1']);
  assert.deepEqual(cert!.meta, ['Vence: may 2026', 'Folio: AB-1']);
  assert.equal(cert!.dates, '10 may 2023');
  for (const e of [skill, lang, cert]) assert.doesNotMatch(JSON.stringify(e), /%|undefined|null"/);
  const en = buildDocModel(data('cv', { items: [{ itemId: 's1' }] }, { locale: 'en' }));
  assert.deepEqual(en.sections[0]!.entries[0]!.meta, ['Advanced', '5 years']);
  assert.equal(en.sections[0]!.heading, 'Skills');
});

test('dates: partial dates as words of the document\'s language; anything else as written', () => {
  assert.equal(formatPartialDate('2020', 'es'), '2020');
  assert.equal(formatPartialDate('2020-03', 'en'), 'Mar 2020');
  assert.equal(formatPartialDate('  ', 'es'), null);
  assert.equal(formatPartialDate(undefined, 'es'), null);
  assert.equal(formatPartialDate('pronto', 'es'), 'pronto');
});

test('the contact appears only when the projection carries it; mailto/tel built here; bad links dropped', () => {
  assert.equal(buildDocModel(data('cv', { items: [] })).contact, null);
  const m = buildDocModel(data('cv', { items: [], showContact: true }, { contact: CONTACT }));
  assert.equal(m.contact?.email?.href, 'mailto:ana@example.test');
  assert.equal(m.contact?.phone?.href, 'tel:+525512345678');
  assert.deepEqual(m.contact?.links.map((l) => l.href), ['https://github.example.test/ana']);
  assert.equal(buildDocModel(data('cv', { items: [] }, { contact: { email: 'no es correo' } })).contact, null);
});

test('ownerRenderData mirrors the public projection: referenced items only, contact only with showContact', () => {
  const profile = { displayName: 'Ana', headline: 'H', summary: 'S', contact: CONTACT };
  const items = [{ id: 'a', kind: 'skill', content: {} }, { id: 'b', kind: 'skill', content: {} }, { id: 'c', kind: 'skill', content: {} }];
  const artifact = { kind: 'presentation', title: 'T', locale: 'es-MX', template: 'base', content: { items: [{ itemId: 'a' }], slides: [{ title: 'x', itemIds: ['c'] }] } };
  const hidden = ownerRenderData(artifact, profile, items);
  assert.deepEqual(hidden.items.map((i) => i.id), ['a', 'c']);
  assert.equal('contact' in hidden.profile, false);
  const shown = ownerRenderData({ ...artifact, content: { ...artifact.content, showContact: true } }, profile, items);
  assert.deepEqual(shown.profile.contact, CONTACT);
  assert.equal(ownerRenderData(artifact, null, []).profile.displayName, '');
});

test('presentation slides: the artifact\'s own (with their items) or one per section and per block', () => {
  const own = buildDocModel(data('presentation', { items: [{ itemId: 'e1', override: { title: 'Adaptado' } }], slides: [{ title: 'Por qué yo', body: 'Texto', itemIds: ['e1', 'missing'] }] }));
  assert.equal(own.slides.length, 1);
  assert.equal(own.slides[0]!.entries[0]!.title, 'Adaptado', 'a slide item keeps its override');
  const derived = buildDocModel(data('presentation', { items: [{ itemId: 'e1' }, { itemId: 's1' }], blocks: [{ heading: 'Cierre', body: 'Gracias' }] }));
  assert.deepEqual(derived.slides.map((s) => s.title), ['Experiencia', 'Habilidades', 'Cierre']);
});

test('empty and malformed content renders nothing invented', () => {
  const m = buildDocModel({ artifact: { kind: 'cv', title: 'T', locale: 'es-MX', template: 'base', content: null }, profile: { displayName: '', headline: '', summary: '' }, items: [] });
  assert.deepEqual([m.name, m.headline, m.summary, m.contact, m.sections.length, m.blocks.length], [null, null, null, null, 0, 0]);
  assert.deepEqual(readContent({ items: 'nope', blocks: [{ body: '' }], showContact: 'yes' }), { items: [], blocks: [], showContact: false, slides: [], summary: undefined });
  assert.equal(buildDocModel(data('unknown-kind', { items: [] })).kind, 'cv');
});
