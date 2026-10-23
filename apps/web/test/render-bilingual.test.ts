/**
 * W7 (B4): the renderers and bilingual profile text. First, the no-translation guarantee: every (kind, template,
 * locale) renders the same markup, byte for byte, as `main` did before translations existed (hashes written by the
 * same matrix at f1ca3530; `CV_WRITE_RENDER_BASELINE=1` rewrites them, only ever from main's source). Markup from
 * react-dom/server in Node: no fonts and no layout, so the hashes do not depend on the machine (dates come from Node's
 * ICU, the Node version pinned in .nvmrc).
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { register } from 'node:module';
import { test } from 'node:test';
import { renderMatrix } from './render-matrix.ts';

register('./render-loader.mjs', import.meta.url);
const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { ArtifactView, templatesFor } = await import('../src/components/render/ArtifactView.tsx');

const BASELINE = join(import.meta.dirname, 'fixtures', 'bilingual', 'render-baseline.json');
// Test-only: the renderer takes the fixture's RenderData.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const render = (d: any) => renderToStaticMarkup(createElement(ArtifactView, { data: d }));

test('without translations, every kind × template × locale renders the markup main rendered (read-proof)', () => {
  const now = renderMatrix(render, templatesFor);
  if (process.env.CV_WRITE_RENDER_BASELINE === '1') {
    writeFileSync(BASELINE, `${JSON.stringify({ source: 'main@f1ca3530 (before W7-B4)', hashes: now }, null, 2)}\n`);
    return;
  }
  const { hashes } = JSON.parse(readFileSync(BASELINE, 'utf8')) as { hashes: Record<string, string> };
  assert.ok(Object.keys(hashes).length >= 32, `baseline cases: ${Object.keys(hashes).length}`);
  assert.deepEqual(Object.keys(now).sort(), Object.keys(hashes).sort(), 'same cases');
  for (const [key, hash] of Object.entries(hashes)) assert.equal(now[key], hash, `${key}: same markup as main`);
});

// ---- with translations ------------------------------------------------------------------------------------------------

const { MATRIX_KINDS } = await import('./render-matrix.ts');
const { data } = await import('./render-fixtures.ts');
const { localizeRenderData } = await import('../src/components/render/localize.ts');
const { MissingTranslations } = await import('../src/components/render/MissingTranslations.tsx');

/** The fixtures' profile with an English version of every word field, and the language with its ISO 639 code. */
const ENGLISH: Record<string, Record<string, unknown>> = {
  e1: { role: 'Data engineer', location: 'Mexico City', summary: 'English summary', highlights: ['English highlight'] },
  e2: { role: 'Analyst' },
  d1: { degree: 'Engineering', field: 'Computer science' },
  s1: { name: 'Python (en)' },
  s2: { name: 'SQL (en)' },
  p1: { name: 'Dashboard' },
  c1: { name: 'Certificate' },
  x1: { label: 'Website' },
};
// Test-only: the renderer takes the fixture's RenderData.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function translated(d: any) {
  return {
    ...d,
    profile: { ...d.profile, locale: 'es-MX', translations: { en: { headline: 'Data engineer', summary: 'Profile summary', location: 'Cuernavaca (en)' } } },
    // Test-only: fixture items.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: d.items.map((i: any) => (ENGLISH[i.id] ? { ...i, translations: { en: ENGLISH[i.id] } } : i)),
  };
}

test('with translations stored, every Spanish document still renders the markup main rendered (the primary language reads no translation)', () => {
  const now = renderMatrix((d) => render(translated(d)), templatesFor);
  const { hashes } = JSON.parse(readFileSync(BASELINE, 'utf8')) as { hashes: Record<string, string> };
  let same = 0;
  for (const [key, hash] of Object.entries(hashes)) {
    if (!key.includes('/es-MX/')) continue;
    assert.equal(now[key], hash, `${key}: same markup as main`);
    same += 1;
  }
  assert.equal(same, Object.keys(hashes).length / 2, 'every Spanish case was compared');
  for (const [key, hash] of Object.entries(hashes)) if (key.includes('/en/')) assert.notEqual(now[key], hash, `${key}: the English document changed`);
});

test('an English document prints the English text of every kind, proper names kept, the language from its code', () => {
  const content = { items: ['e1', 'e2', 'd1', 's1', 'l1', 'p1', 'c1', 'x1'].map((itemId) => ({ itemId })), blocks: [], showContact: true };
  for (const kind of MATRIX_KINDS) {
    const d = translated(data(kind, content, { locale: 'en', contact: { location: 'Cuernavaca' } }));
    d.items = d.items.map((i: { id: string; content: Record<string, unknown> }) => (i.id === 'l1' ? { ...i, content: { ...i.content, code: 'en' } } : i));
    const html = render(d);
    for (const en of ['Data engineer', 'English summary', 'English highlight', 'Analyst', 'Engineering, Computer science', 'Python (en)', 'Dashboard', 'Certificate', 'Website', 'English']) {
      assert.ok(html.includes(en), `${kind}: ${en}`);
    }
    for (const es of ['Ingeniera de datos', 'Original summary', 'Original highlight', 'Analista', 'Computación', 'Inglés', 'Tablero', 'Sitio']) assert.ok(!html.includes(es), `${kind}: no «${es}»`);
    for (const kept of ['Acme', 'UNAM', 'Org']) assert.ok(html.includes(kept), `${kind}: proper name ${kept}`);
    if (kind !== 'presentation') assert.ok(html.includes('Mexico City'), `${kind}: the item's place`);
  }
});

test('the flag: what falls back is listed per item with links to the profile; nothing when the document is complete', () => {
  const content = { items: [{ itemId: 'e1' }, { itemId: 's2' }, { itemId: 'l1' }], blocks: [], showContact: true };
  const partial = data('cv', content, { locale: 'en', contact: { location: 'Cuernavaca' } });
  partial.profile = { ...partial.profile, locale: 'es-MX', translations: { en: { headline: 'Data engineer' } } };
  partial.items = partial.items.map((i) => (i.id === 'e1' ? { ...i, translations: { en: { role: 'Data engineer' } } } : i));
  const { missing, target, primary, data: localized } = localizeRenderData(partial);
  assert.deepEqual(
    missing.map((m) => [m.itemId, m.fields]),
    [
      [null, ['summary', 'location']],
      ['e1', ['location', 'summary', 'highlights']],
      ['s2', ['name']],
      ['l1', ['code']],
    ],
  );
  assert.equal(localized.items.find((i) => i.id === 'e1')?.content && (localized.items.find((i) => i.id === 'e1')!.content as { role: string }).role, 'Data engineer');
  const flag = renderToStaticMarkup(createElement(MissingTranslations, { locale: 'es', missing, target, primary, id: 'f' }));
  assert.match(flag, /Faltan 7 textos en inglés/);
  assert.match(flag, /href="\/perfil#traducir-encabezado"/);
  assert.match(flag, /href="\/perfil#traducir-e1"/);
  assert.match(flag, /elige el idioma de la lista/);
  assert.match(flag, /no aparece en el documento impreso/);
  const en = renderToStaticMarkup(createElement(MissingTranslations, { locale: 'en', missing: missing.slice(2, 3), target, primary, id: 'f' }));
  assert.match(en, /1 text missing in English/);
  assert.match(en, /href="\/en\/perfil#traducir-s2"/);
  assert.equal(renderToStaticMarkup(createElement(MissingTranslations, { locale: 'es', missing: [], target, primary, id: 'f' })), '');
  // The printed document never carries the flag's words.
  const html = render(partial);
  assert.ok(!/Faltan|traducir|missing/i.test(html));
  // A Spanish document of the same profile lacks nothing.
  assert.deepEqual(localizeRenderData({ ...partial, artifact: { ...partial.artifact, locale: 'es-MX' } }).missing, []);
});
