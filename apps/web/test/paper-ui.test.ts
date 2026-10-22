/**
 * W5-P: the paper preview and the printing advice, as server markup (react-dom/server over the real components; JSX
 * through the test-only hooks in render-loader.mjs). No style attribute (the CSP), the numbers are Pliego's, the
 * drawing is decorative and the steps carry the content, both languages.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { test } from 'node:test';

register('./render-loader.mjs', import.meta.url);
const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { PaperSheet } = await import('../src/components/paper/PaperSheet.tsx');
const { FoldGuide } = await import('../src/components/paper/FoldGuide.tsx');
const { StockPicker, stockFacts } = await import('../src/components/paper/StockPicker.tsx');
const { letterFold, paperStock, paperStocks } = await import('../src/lib/pliego/paper.ts');

const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

test('PaperSheet: no style attribute in the server markup; the stock and the frame classes reach the sheet', () => {
  const bond = paperStock('copy-80');
  const html = renderToStaticMarkup(createElement(PaperSheet, { look: bond.look, stock: bond.id, className: 'sheet paperA4', paper: 'a4', children: createElement('article', null, 'Hola') }));
  assert.doesNotMatch(html, /\sstyle=/i);
  assert.match(html, /^<div class="sheet paperA4 paper" data-paper-stock="copy-80" data-paper="a4"><article>Hola<\/article><\/div>$/);
});

test('FoldGuide: Carta in bond, the bottom fold from the bottom edge and the top fold from the top, es-MX', () => {
  const html = renderToStaticMarkup(createElement(FoldGuide, { locale: 'es', fold: letterFold('letter', 'copy-80'), paperName: 'Carta (México y EE. UU.)' }));
  assert.doesNotMatch(html, /\sstyle=/i);
  assert.match(html, /<svg[^>]*aria-hidden="true"/, 'the drawing is decorative');
  const t = text(html);
  assert.match(t, /Dobla hacia arriba la parte de abajo, a 92\.1 mm del borde inferior\./);
  assert.match(t, /Dobla hacia abajo la parte de arriba, a 93\.7 mm del borde superior/);
  assert.match(t, /1\.6 mm más corta .* doblada mide 93\.7 × 215\.9 mm\./);
  assert.doesNotMatch(t, /marca las dos líneas/i, 'bond needs no scoring');
  assert.match(t, /Medidas para Carta \(México y EE\. UU\.\), calculadas por Pliego/);
  assert.match(html, /data-fold-at="93\.666667"/);
  assert.match(html, /data-fold-at="187\.333333"/);
});

test('FoldGuide: A4 in cartulina says to score, in English', () => {
  const t = text(renderToStaticMarkup(createElement(FoldGuide, { locale: 'en', fold: letterFold('a4', 'cardstock-160'), paperName: 'A4' })));
  assert.match(t, /Fold the bottom part up, 97\.9 mm from the bottom edge\./);
  assert.match(t, /Fold the top part down over it, 99\.5 mm from the top edge\./);
  assert.match(t, /score both lines before folding/);
});

test('StockPicker: native radios in a fieldset, the facts from the cards, a link to the source', () => {
  const stocks = paperStocks();
  const html = renderToStaticMarkup(createElement(StockPicker, { locale: 'es', stocks, value: 'cardstock-160', onChange: () => undefined }));
  assert.doesNotMatch(html, /\sstyle=/i);
  assert.match(html, /<fieldset[^>]*><legend>Papel<\/legend>/);
  assert.equal((html.match(/type="radio"/g) ?? []).length, 2);
  assert.match(html, /checked="" value="cardstock-160"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /href="https:\/\/pliego\.madfam\.io\/"/);
  const t = text(html);
  assert.match(t, /Cartulina 160 g\/m²: unos 0\.20 mm de grosor y unas 6\.5 veces más rígida a la flexión que el papel bond 80 g\/m² \(valores estimados\)\. Márcala antes de doblarla/);
  const bond = stocks[0]!;
  assert.equal(stockFacts('en', bond, bond), 'Copy paper 80 g/m²: about 0.10 mm thick (estimated values). A firm crease folds it; no scoring needed.');
});
