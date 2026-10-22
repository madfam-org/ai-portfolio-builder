/**
 * Bakes the deck's page turn with Pliego's published engine (W5-P phase 3):
 *
 *   node scripts/pliego-page-turn.ts           # write src/lib/pliego/generated/page-turn-deck.json
 *   node scripts/pliego-page-turn.ts --check   # exit 1 unless the committed file is what the engine gives now
 *
 * Input: the sheet document Pliego's kernel generates for the commons cartridge `page-turn` (one leaf of bond 80
 * hinged at its spine, 300 × 168.75 mm, the deck's 16:9; vendored byte for byte by scripts/pliego/sync_pliego_data.py).
 * The engine (`@pliego/engine`, Tier C: compliant paper with real bending stiffness, gravity and air drag) turns the leaf
 * with its `turn` control from 0° to 180° over 32 frames at 60 Hz (smoothstep), then lets it settle for 16 frames. Each
 * frame keeps the leaf's cross-section at mid-height, sampled at 25 points across its width, as fractions of the width
 * (1e-4 units). Pliego's determinism contract makes the run reproducible; test/page-turn.test.ts re-runs it.
 *
 * Why baked, not run in the browser: a frame of this leaf (about 1,050 simulation vertices) takes about 190 ms
 * median on a laptop, so one 0.8 s turn costs 10–16 s of computation. Baking keeps the physics Pliego's and the page
 * free of it: the viewer only plays the frames.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { loadDocument, World } from '@pliego/engine';

export const DRIVE_FRAMES = 32;
export const SETTLE_FRAMES = 16;
export const SAMPLES = 25;
export const SCALE = 10_000;

const SRC = new URL('../src/lib/pliego/', import.meta.url);
export const DOC_URL = new URL('vendor/page-turn-deck.fold.json', SRC);
export const OUT_URL = new URL('generated/page-turn-deck.json', SRC);

export interface PageTurnBake {
  _provenance: string;
  engine: string;
  document: { path: string; digest: string; stock: string; widthMm: number; heightMm: number };
  /** The verso colour of the leaf, from the stock's Pliego card (`appearance.back`). */
  verso: string;
  fps: number;
  driveFrames: number;
  settleFrames: number;
  samples: number;
  scale: number;
  maxStrain: number;
  /** One row per frame (rest first): x0, y0, x1, y1, … in 1e-4 of the width; x from the spine, y towards the reader. */
  frames: number[][];
}

const smooth = (s: number) => s * s * (3 - 2 * s);

export function bakePageTurn(docText: string): PageTurnBake {
  const raw = JSON.parse(docText);
  const doc = loadDocument(raw);
  const meta = raw['pliego:meta'] as { digest: string; params: { width: number; height: number; stock: string } };
  const { width, height, stock } = meta.params;
  const card = JSON.parse(readFileSync(new URL(`vendor/materials/${stock}.stock.json`, SRC), 'utf8')) as { appearance: { back: string } };
  const world = new World(doc);
  const rest = Float64Array.from(world.positions);
  const n = rest.length / 3;
  // The mid-height band of the mesh (world z = −v), ordered from the spine (x = 0) to the fore-edge.
  const zMid = -height / 2;
  let band: number[] = [];
  for (let tol = 1; band.length < 8 && tol < 20; tol *= 2) {
    band = [];
    for (let i = 0; i < n; i++) if (Math.abs(rest[3 * i + 2]! - zMid) <= tol) band.push(i);
  }
  band.sort((a, b) => rest[3 * a]! - rest[3 * b]!);
  const sample = (p: Float64Array | number[]): number[] => {
    const row: number[] = [];
    for (let k = 0; k < SAMPLES; k++) {
      const u = (width * k) / (SAMPLES - 1);
      let j = 0;
      while (j < band.length - 2 && rest[3 * band[j + 1]!]! < u) j++;
      const a = band[j]!;
      const b = band[j + 1]!;
      const ua = rest[3 * a]!;
      const ub = rest[3 * b]!;
      const t = ub === ua ? 0 : Math.min(1, Math.max(0, (u - ua) / (ub - ua)));
      const x = p[3 * a]! + (p[3 * b]! - p[3 * a]!) * t;
      const y = p[3 * a + 1]! + (p[3 * b + 1]! - p[3 * a + 1]!) * t;
      row.push(Math.round((x / width) * SCALE), Math.round((y / width) * SCALE));
    }
    return row;
  };
  const frames = [sample(rest)];
  let maxStrain = 0;
  for (let f = 1; f <= DRIVE_FRAMES + SETTLE_FRAMES; f++) {
    world.setControl('turn', 180 * smooth(Math.min(1, f / DRIVE_FRAMES)));
    world.step(1 / 60);
    maxStrain = Math.max(maxStrain, world.stats().maxStrain);
    frames.push(sample(world.positions));
  }
  return {
    _provenance:
      'Baked by apps/web/scripts/pliego-page-turn.ts with @pliego/engine (AGPL-3.0-only) from the vendored Pliego page-turn ' +
      'document (CERN-OHL-W-2.0). Do not edit: re-run the script.',
    engine: 'pliego-engine 0.1.0',
    document: { path: 'vendor/page-turn-deck.fold.json', digest: meta.digest, stock, widthMm: width, heightMm: height },
    verso: /^#[0-9a-f]{6}$/i.test(card.appearance.back) ? card.appearance.back.toLowerCase() : '#ffffff',
    fps: 60,
    driveFrames: DRIVE_FRAMES,
    settleFrames: SETTLE_FRAMES,
    samples: SAMPLES,
    scale: SCALE,
    maxStrain: Math.round(maxStrain * 1e6) / 1e6,
    frames,
  };
}

export function serialise(bake: PageTurnBake): string {
  const { frames, ...head } = bake;
  const body = JSON.stringify(head, null, 2).replace(/\n}$/, '');
  return `${body},\n  "frames": [\n${frames.map((r) => `    ${JSON.stringify(r)}`).join(',\n')}\n  ]\n}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const text = serialise(bakePageTurn(readFileSync(DOC_URL, 'utf8')));
  if (process.argv.includes('--check')) {
    const same = readFileSync(OUT_URL, 'utf8') === text;
    process.stdout.write(`page-turn: check ${same ? 'OK' : 'FAIL (re-run without --check)'}\n`);
    process.exit(same ? 0 : 1);
  }
  writeFileSync(OUT_URL, text);
  process.stdout.write(`page-turn: wrote ${OUT_URL.pathname.split('/apps/web/')[1]}\n`);
}
