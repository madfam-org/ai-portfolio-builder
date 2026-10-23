/**
 * W7 (B3): the retail and luxury guide in the item forms: the same kinds in es-MX and en, real kinds only, every
 * suggested keyword a valid tag, every example marked illustrative by its label (R85), and no brand named.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ITEM_KIND_ORDER, TAG_MAX } from '../src/components/profile/fields.ts';
import { SECTOR_GUIDE_COPY } from '../src/lib/copy/profile.ts';

test('the guide covers the same item kinds in both languages, each with tips, examples and keywords', () => {
  const es = Object.keys(SECTOR_GUIDE_COPY.es.kinds).sort();
  const en = Object.keys(SECTOR_GUIDE_COPY.en.kinds).sort();
  assert.deepEqual(es, en);
  assert.deepEqual(es, ['achievement', 'certification', 'experience', 'language', 'project', 'skill']);
  for (const lang of ['es', 'en'] as const) {
    for (const [kind, g] of Object.entries(SECTOR_GUIDE_COPY[lang].kinds)) {
      assert.ok(ITEM_KIND_ORDER.includes(kind as never), kind);
      assert.ok(g!.tips.length > 0 && g!.examples.length > 0 && g!.keywords.length > 0, `${lang}/${kind}`);
      assert.equal(g!.tips.length, SECTOR_GUIDE_COPY[lang === 'es' ? 'en' : 'es'].kinds[kind as 'skill']!.tips.length, `${kind}: tips translated one to one`);
      for (const k of g!.keywords) assert.ok(k.length <= TAG_MAX && !/[,;\n]/.test(k), k);
    }
  }
});

test('examples are labelled illustrative; the guide names no brand or house', () => {
  assert.match(SECTOR_GUIDE_COPY.es.examplesLabel, /ilustrativas/);
  assert.match(SECTOR_GUIDE_COPY.en.examplesLabel, /illustrative/);
  const all = JSON.stringify(SECTOR_GUIDE_COPY);
  for (const brand of ['Louis Vuitton', 'Dior', 'Cartier', 'Chanel', 'Hermès', 'Rolex', 'Gucci', 'Tiffany', 'Salesforce', 'Palacio de Hierro', 'Liverpool']) assert.ok(!all.includes(brand), brand);
});
