/**
 * W4-T: every template of the registry (`lib/templates.ts`) through the real renderers. The registry and the
 * renderer table agree kind by kind; a template restyles, never restructures (the same headings, in the same order, as
 * `base`), so every CV template stays one column of real text; the W3-4 safety rules hold for every template; the
 * template CSS carries nothing that would break ATS reading or print (columns, floats, positioning, images, tables).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { test } from 'node:test';
import { CONTACT, XSS, data } from './render-fixtures.ts';
import { TEMPLATE_REGISTRY, templateIds } from '../src/lib/templates.ts';

register('./render-loader.mjs', import.meta.url);
const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { ArtifactView, renderableTemplates, templatesFor } = await import('../src/components/render/ArtifactView.tsx');
const { TemplatePicker } = await import('../src/components/render/TemplatePicker.tsx');

const KINDS = ['cv', 'portfolio', 'presentation', 'cover_letter'] as const;
const CONTENT: Record<(typeof KINDS)[number], Record<string, unknown>> = {
  cv: { summary: 'Resumen', items: [{ itemId: 'e1', override: { title: 'Líder de datos' } }, { itemId: 'd1' }, { itemId: 's1' }, { itemId: 's2' }, { itemId: 'x1' }], blocks: [{ heading: 'Por qué Acme', body: 'Texto' }], showContact: true },
  portfolio: { intro: 'Hola', items: [{ itemId: 'e1' }, { itemId: 'p1' }, { itemId: 's1' }], showContact: true },
  presentation: { items: [{ itemId: 'e1' }], slides: [{ title: 'Por qué yo', body: 'Porque sí', itemIds: ['e1'] }, { title: 'Herramientas', itemIds: ['s1', 'l1'] }], showContact: true },
  cover_letter: { greeting: 'Estimado equipo:', summary: 'Me interesa.', closing: 'Saludos,', items: [{ itemId: 'e1' }], blocks: [{ body: 'Cuerpo' }], showContact: true },
};

const render = (kind: string, template: string, content = CONTENT[kind as 'cv']) => renderToStaticMarkup(createElement(ArtifactView, { data: data(kind, content, { template, contact: CONTACT }), paper: 'letter' }));
const headings = (html: string) => [...html.matchAll(/<(h[1-4])\b[^>]*>(.*?)<\/\1>/g)].map((m) => `${m[1]}:${m[2]!.split(/<[^>]*>/).join('')}`);

test('the renderer table and the registry list the same templates, in the same order, for every kind', () => {
  for (const kind of KINDS) {
    assert.deepEqual(renderableTemplates(kind), templateIds(kind), kind);
    assert.deepEqual(templatesFor(kind), templateIds(kind), kind);
  }
  assert.deepEqual(templateIds('cv'), ['base', 'compacto', 'clasico']);
  assert.deepEqual(templateIds('portfolio'), ['base', 'lista']);
  assert.deepEqual(templateIds('presentation'), ['base', 'contraste']);
  assert.deepEqual(templateIds('cover_letter'), ['base', 'formal']);
});

test('the registry: ids fit the API shape, are unique per kind, base first; every label, description and CV/letter ATS note in es and en', () => {
  let checked = 0;
  for (const kind of KINDS) {
    const list = TEMPLATE_REGISTRY[kind];
    assert.equal(list[0]!.id, 'base');
    assert.equal(new Set(list.map((t) => t.id)).size, list.length);
    for (const t of list) {
      assert.match(t.id, /^[a-z0-9-]{1,40}$/);
      for (const locale of ['es', 'en'] as const) {
        assert.ok(t.label[locale].trim() && t.description[locale].trim(), `${kind}/${t.id} ${locale}`);
        if (kind === 'cv' || kind === 'cover_letter') assert.match(t.ats?.[locale] ?? '', /ATS/, `${kind}/${t.id} ${locale} ATS note`);
        else assert.equal(t.ats, null);
      }
      checked += 1;
    }
  }
  assert.equal(checked, 9, `read ${checked} templates`);
  // Nothing claims a layout the renderers do not have.
  assert.doesNotMatch(JSON.stringify(TEMPLATE_REGISTRY.cv), /dos columnas|two columns|two-column/i);
});

test('every template renders the SAME headings as base (restyle, never restructure), marks itself, and keeps every safety rule', () => {
  for (const kind of KINDS) {
    const base = headings(render(kind, 'base'));
    assert.ok(base.length >= 3, `${kind}: read ${base.length} headings`);
    for (const template of templateIds(kind)) {
      const html = render(kind, template);
      assert.deepEqual(headings(html), base, `${kind}/${template}`);
      assert.match(html, new RegExp(`data-template="${template}"`));
      if (template !== 'base') assert.match(html, /class="sheet paper[A-Za-z]+ [a-zA-Z]+"/, `${kind}/${template}: the template class reaches the sheet`);
      assert.doesNotMatch(html, /\sstyle=|<img\b|<table|<svg|undefined/i, `${kind}/${template}`);
      for (const a of html.match(/<a\b[^>]*>/g) ?? []) {
        assert.match(a, /href="(https?:\/\/|mailto:|tel:)/);
        assert.match(a, /rel="ugc nofollow noopener noreferrer"/);
      }
    }
  }
});

test('user text stays inert under every template', () => {
  for (const kind of KINDS) {
    for (const template of templateIds(kind)) {
      const d = data(kind, { summary: XSS, items: [{ itemId: 'e1', override: { title: XSS } }], blocks: [{ heading: XSS, body: XSS }], greeting: XSS, closing: XSS, intro: XSS, slides: [{ title: XSS, itemIds: [] }] }, { template });
      const html = renderToStaticMarkup(createElement(ArtifactView, { data: d }));
      assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'), `${kind}/${template}`);
      assert.doesNotMatch(html, /<img\b/);
    }
  }
});

test('the template CSS has nothing that breaks ATS reading or print: no columns, floats, positioning, tables, images or hidden overflow', () => {
  const css = readFileSync(new URL('../src/components/render/templates.module.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(css.length > 1000, `read ${css.length} characters`);
  for (const bad of [/columns?\s*:/, /grid-template-columns/, /float\s*:/, /position\s*:/, /display\s*:\s*(table|grid)/, /url\(/, /overflow\s*:\s*hidden/, /(^|[\s;{])content\s*:/, /@import/, /(^|[\s;{])(max-|min-)?height\s*:/]) {
    assert.doesNotMatch(css, bad, String(bad));
  }
  // Every template class the renderer uses is defined.
  for (const cls of ['cvCompacto', 'cvClasico', 'portfolioLista', 'presentationContraste', 'letterFormal']) assert.match(css, new RegExp(`\\.${cls}\\b`));
});

test('the picker: a labelled radio group per kind, each option tied to its trade-off; a stored legacy template stays listed', () => {
  const html = renderToStaticMarkup(createElement(TemplatePicker, { id: 'p', kind: 'cv', locale: 'es', value: 'compacto', onChange: () => undefined, current: 'compacto' }));
  assert.match(html, /<fieldset[^>]*id="p"/);
  assert.match(html, /<legend[^>]*>Plantilla<\/legend>/);
  assert.equal((html.match(/type="radio"/g) ?? []).length, 3);
  assert.match(html, /id="p-compacto"[^>]*checked=""|checked=""[^>]*id="p-compacto"/);
  assert.match(html, /aria-describedby="p-clasico-desc"/);
  assert.match(html, /Pensado para sistemas ATS/);
  const legacy = renderToStaticMarkup(createElement(TemplatePicker, { id: 'q', kind: 'portfolio', locale: 'en', value: 'retro', onChange: () => undefined, current: 'retro' }));
  assert.equal((legacy.match(/type="radio"/g) ?? []).length, 3);
  assert.match(legacy, /“retro” \(previous\)/);
  assert.doesNotMatch(legacy, /ATS/, 'no ATS line where ATS does not apply');
});
