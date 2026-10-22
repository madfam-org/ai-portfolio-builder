/**
 * W5-P: the Pliego data cv vendors stays EXACTLY what Pliego published at the pinned commits.
 *
 * - Each stock card is a byte-for-byte copy: its git blob id equals the LOCK's, which is the blob of
 *   `materials/<slug>/stock.json` at the pinned Pliego commit (`git rev-parse <commit>:<path>` in a Pliego clone shows
 *   the same id; `scripts/pliego/sync_pliego_data.py --pliego <clone>` re-checks every byte and re-runs the cartridge).
 * - The generated letter-fold file matches the sha256 the sync script recorded, so a hand edit fails here.
 * - The two Pliego sources agree with each other (the fold documents were generated with these cards' calipers), and
 *   the views cv derives from them are the numbers Pliego computed.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { letterFold, letterFolds, paperStock, paperStocks, PLIEGO_PINS } from '../src/lib/pliego/paper.ts';

const VENDOR = new URL('../src/lib/pliego/vendor/', import.meta.url);
const read = (rel: string) => readFileSync(new URL(rel, VENDOR));
const lock = JSON.parse(read('LOCK.json').toString('utf8')) as {
  licence: string;
  pliego: { commit: string };
  commons: { commit: string };
  copies: { path: string; source: string; git_blob: string }[];
  generated: { path: string; sha256: string; cartridge: string; cartridge_git_blobs: Record<string, string> }[];
};
const gitBlob = (data: Buffer) => createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
const HEX40 = /^[0-9a-f]{40}$/;

test('the LOCK pins full commits and the commons licence', () => {
  assert.match(lock.pliego.commit, HEX40);
  assert.match(lock.commons.commit, HEX40);
  assert.equal(lock.licence, 'CERN-OHL-W-2.0');
  assert.deepEqual(PLIEGO_PINS, { pliego: lock.pliego.commit, commons: lock.commons.commit });
  for (const blob of Object.values(lock.generated[0]!.cartridge_git_blobs)) assert.match(blob, HEX40);
});

test('every stock card is an untouched copy of the pinned Pliego blob', () => {
  assert.equal(lock.copies.length, 2, 'copies read (read-proof)');
  for (const c of lock.copies) {
    const data = read(c.path);
    assert.equal(gitBlob(data), c.git_blob, `${c.path} drifted from ${c.source} at pliego@${lock.pliego.commit.slice(0, 12)}`);
    const card = JSON.parse(data.toString('utf8')) as { stock: { slug: string }; provenance: { license: string } };
    assert.equal(`materials/${card.stock.slug}/stock.json`, c.source);
    assert.equal(card.provenance.license, 'CERN-OHL-W-2.0', 'the card carries its own licence');
  }
});

test('the generated letter folds are the bytes the sync script wrote', () => {
  assert.equal(lock.generated.length, 1);
  const g = lock.generated[0]!;
  assert.equal(g.cartridge, 'print-folds');
  assert.equal(createHash('sha256').update(read(g.path)).digest('hex'), g.sha256, `${g.path} was edited by hand: refresh it with the sync script`);
});

test('the folds were generated with the vendored cards (the two Pliego sources agree)', () => {
  const doc = JSON.parse(read('print-folds-letter.json').toString('utf8')) as { cases: { stock: string; caliper_mm: number; params: { stock: string; style: string }; digest: string }[] };
  assert.equal(doc.cases.length, 4, 'cases read (read-proof)');
  for (const c of doc.cases) {
    const card = JSON.parse(read(`materials/${c.stock}.stock.json`).toString('utf8')) as { derived: { thickness: number } };
    assert.equal(c.caliper_mm, card.derived.thickness, `${c.stock}: caliper`);
    assert.equal(c.params.stock, c.stock);
    assert.equal(c.params.style, 'letter');
    assert.match(c.digest, /^sha256:[0-9a-f]{64}$/);
  }
});

test('stock views: bond 80 and cartulina 160 as Pliego describes them', () => {
  const [bond, card] = paperStocks();
  assert.equal(bond!.id, 'copy-80');
  assert.deepEqual([bond!.gsm, bond!.caliperMm, bond!.look.face, bond!.look.edgePx, bond!.scoreBeforeFolding, bond!.stiffnessVsBond], [80, 0.1, '#f7f7f2', 1, false, 1]);
  assert.equal(bond!.name.es, 'Papel bond 80 g/m²');
  assert.equal(card!.id, 'cardstock-160');
  assert.deepEqual([card!.gsm, card!.caliperMm, card!.look.face, card!.look.edgePx, card!.scoreBeforeFolding], [160, 0.2, '#f4efe6', 2, true]);
  assert.equal(card!.stiffnessVsBond, 6.5, 'D_md 3281730 / 501376');
  assert.ok(bond!.caliperEstimated && card!.caliperEstimated, 'both calipers are estimates, and the copy says so');
  assert.deepEqual(paperStock('cardstock-160'), card);
});

test('letter fold on Carta and A4: two folds measured from the top, the tucked bottom panel shorter', () => {
  const carta = letterFold('letter', 'copy-80');
  assert.deepEqual(carta.pageMm, { width: 215.9, height: 279.4 });
  assert.deepEqual(carta.foldsFromTopMm, [93.666667, 187.333333]);
  assert.equal(carta.treatment, 'crease');
  assert.equal(carta.tuckShorterByMm, 1.6);
  const a4 = letterFold('a4', 'cardstock-160');
  assert.deepEqual(a4.pageMm, { width: 210, height: 297 });
  assert.deepEqual(a4.foldsFromTopMm, [99.533333, 199.066667]);
  assert.equal(a4.treatment, 'score', 'card is scored before folding');
  for (const f of letterFolds()) {
    const [top, middle, bottom] = f.panelsMm;
    assert.ok(Math.abs(top + middle + bottom - f.pageMm.height) < 1e-5, `${f.paper}/${f.stock}: panels fill the page`);
    assert.ok(Math.abs(f.foldsFromTopMm[0] - top) < 1e-5 && Math.abs(f.foldsFromTopMm[1] - (top + middle)) < 1e-5);
    assert.ok(bottom < top, 'the tuck is the shorter panel');
  }
  assert.equal(letterFolds().length, 4);
});
