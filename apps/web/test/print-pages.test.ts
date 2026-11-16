/** The print view's page estimate (components/paper/print-pages.ts): pagination with unsplittable units. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PRINT_AREA_MM, PX_PER_MM, paginate } from '../src/components/paper/print-pages.ts';

test('paginate: flowing content, a unit that moves whole to the next page, a unit taller than a page', () => {
  assert.equal(paginate([], 0, 1000), 1, 'never fewer than one page');
  assert.equal(paginate([], 1000, 1000), 1);
  assert.equal(paginate([], 1001, 1000), 2);
  assert.equal(paginate([], 2500, 1000), 3);
  // A unit crossing the end of page 1 starts page 2; what follows shifts with it.
  assert.equal(paginate([{ top: 900, bottom: 1100 }], 1100, 1000), 2);
  assert.equal(paginate([{ top: 900, bottom: 1100 }, { top: 1100, bottom: 1950 }], 1950, 1000), 3, '1950 + the 100 px pushed down');
  // A unit taller than a page flows instead of moving.
  assert.equal(paginate([{ top: 100, bottom: 1600 }], 1600, 1000), 2);
  assert.equal(paginate([{ top: 0, bottom: 10 }], 10, 0), 1, 'a degenerate page height is one page');
});

test('the printable areas follow the named pages (margins 15mm × 16mm)', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(PRINT_AREA_MM).map(([k, v]) => [k, [Math.round(v.width * 10) / 10, Math.round(v.height * 10) / 10]])),
    { letter: [183.9, 249.4], a4: [178, 267] },
  );
  assert.ok(Math.abs(PX_PER_MM - 3.7795) < 0.001);
});
