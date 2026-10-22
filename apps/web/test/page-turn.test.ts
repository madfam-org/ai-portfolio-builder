/**
 * W5-P phase 3: the deck's page turn is what Pliego's published engine gives for Pliego's page-turn leaf, and the
 * viewer's geometry follows it. Re-runs the whole bake (about 15 s): the engine's determinism contract makes the
 * frames reproducible; a tolerance of 2 units (2e-4 of the width, 0.06 mm on the 300 mm leaf) absorbs a different
 * JavaScript engine's last-bit rounding, never a different motion.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { test } from 'node:test';
import { bakePageTurn, DOC_URL, OUT_URL } from '../scripts/pliego-page-turn.ts';

register('./render-loader.mjs', import.meta.url);
const { sectionAt, stripPose, TURN_MS } = await import('../src/components/render/page-turn/turn.ts');

const committed = JSON.parse(readFileSync(OUT_URL, 'utf8')) as ReturnType<typeof bakePageTurn>;

test('the committed frames are the engine\'s, re-run now from the vendored Pliego document', () => {
  const fresh = bakePageTurn(readFileSync(DOC_URL, 'utf8'));
  const { frames, maxStrain, ...head } = fresh;
  const { frames: cFrames, maxStrain: cStrain, ...cHead } = committed;
  assert.deepEqual(head, cHead);
  assert.ok(Math.abs(maxStrain - cStrain) < 1e-5);
  assert.equal(frames.length, cFrames.length);
  let worst = 0;
  frames.forEach((row, f) => row.forEach((v, i) => (worst = Math.max(worst, Math.abs(v - cFrames[f]![i]!)))));
  assert.ok(worst <= 2, `frames drifted by ${worst} units: re-run scripts/pliego-page-turn.ts`);
  const doc = JSON.parse(readFileSync(DOC_URL, 'utf8')) as { 'pliego:meta': { digest: string } };
  assert.equal(committed.document.digest, doc['pliego:meta'].digest);
  assert.equal(committed.engine, 'pliego-engine 0.1.0');
  const pkg = JSON.parse(readFileSync(new URL('../node_modules/@pliego/engine/package.json', import.meta.url), 'utf8')) as { version: string };
  assert.equal(`pliego-engine ${pkg.version}`, committed.engine, 'the bake names the installed engine');
});

test('the leaf starts flat, ends turned over the spine, and stays the same length (paper does not stretch)', () => {
  const first = sectionAt(0);
  const last = sectionAt(committed.frames.length - 1);
  for (let k = 0; k < first.length - 1; k++) {
    const p = stripPose(first, k);
    assert.ok(Math.abs(p.dx) < 1e-4 && p.depth === 0 && p.angle === 0, `strip ${k} is flat at rest`);
  }
  assert.ok(last.every(([x]) => x <= 0.012), 'every sample is back at the spine or past it (clipped there)');
  assert.ok(Math.min(...last.map(([x]) => x)) < -0.5, 'the fore-edge has turned over the spine');
  for (let f = 0; f < committed.frames.length; f += 0.5) {
    const sec = sectionAt(f);
    let length = 0;
    for (let k = 0; k < sec.length - 1; k++) length += Math.hypot(sec[k + 1]![0] - sec[k]![0], sec[k + 1]![1] - sec[k]![1]);
    assert.ok(Math.abs(length - 1) < 0.01, `frame ${f}: leaf length ${length.toFixed(4)} of its width`);
  }
  assert.ok(committed.maxStrain < 0.005, 'the engine kept stretch under 0.5 %');
  assert.equal(TURN_MS, 800);
});
