/**
 * Paper, as Pliego knows it (W5-P). Pliego (pliego.madfam.io, github.com/madfam-org/pliego) OWNS paper physics; cv
 * consumes a pinned slice of it at build time and never re-derives it:
 *
 * - the stock cards `copy-80` (bond 80 g/m²) and `cardstock-160` (cartulina 160 g/m²), byte-for-byte copies of
 *   Pliego's `materials/<slug>/stock.json`: name, grammage, caliper, face colour, bending stiffness, scoring rule;
 * - the letter fold (tri-fold, rolled in) of a Carta and an A4 sheet in each stock, as Pliego's kernel computes it
 *   when it runs the commons cartridge `print-folds` (style `letter`, presets `us-letter` and `a4`).
 *
 * Both live in `vendor/` (CERN-OHL-W-2.0; provenance and pins in `vendor/LOCK.json` and `vendor/README.md`), are
 * refreshed only by `scripts/pliego/sync_pliego_data.py`, and `test/pliego-data.test.ts` fails when a copy drifts from
 * its pinned blob. Everything here is a screen-only enhancement: no value from this module reaches the print or PDF
 * output of a document.
 *
 * Server-only by convention: the pages import it and hand the small views below to client components, so the cards
 * never ship in client JavaScript. No React import.
 */
import cardstock160 from './vendor/materials/cardstock-160.stock.json' with { type: 'json' };
import copy80 from './vendor/materials/copy-80.stock.json' with { type: 'json' };
import printFoldsLetter from './vendor/print-folds-letter.json' with { type: 'json' };
import lock from './vendor/LOCK.json' with { type: 'json' };
import type { Paper } from '../copy/render.ts';

export type PaperStockId = 'copy-80' | 'cardstock-160';
/** The stock the preview shows and the print view starts on: office bond, the default of Pliego's print folds. */
export const DEFAULT_STOCK: PaperStockId = 'copy-80';

interface StockCard {
  stock: { slug: string; name: { es: string; en: string }; color: string };
  physical: { gsm: { value: number }; caliper_um: { value: number; status: string } };
  fabrication: { score: string | null };
  appearance: { front: string };
  derived: { thickness: number; D_md: number };
}

const CARDS: Record<PaperStockId, StockCard> = { 'copy-80': copy80, 'cardstock-160': cardstock160 };

/** What a screen needs from a stock card (plain data: safe to pass to a client component). */
export interface PaperStockView {
  id: PaperStockId;
  name: { es: string; en: string };
  gsm: number;
  /** Caliper in mm, from the card's derived block (estimated on both cards). */
  caliperMm: number;
  caliperEstimated: boolean;
  /** Bending stiffness along the grain relative to bond 80 (D_md / D_md of copy-80), one decimal. */
  stiffnessVsBond: number;
  /** The card says every fold must be scored first (its `fabrication.score` begins «required»). */
  scoreBeforeFolding: boolean;
  /** Screen-only appearance: the face colour, and an edge whose width follows the caliper (×10, so it shows). */
  look: { face: string; edgePx: number };
}

const HEX = /^#[0-9a-f]{6}$/i;

function view(id: PaperStockId): PaperStockView {
  const card = CARDS[id];
  const bond = CARDS['copy-80'];
  const caliperMm = card.derived.thickness;
  return {
    id,
    name: { es: card.stock.name.es, en: card.stock.name.en },
    gsm: card.physical.gsm.value,
    caliperMm,
    caliperEstimated: card.physical.caliper_um.status !== 'measured',
    stiffnessVsBond: Math.round((card.derived.D_md / bond.derived.D_md) * 10) / 10,
    scoreBeforeFolding: (card.fabrication.score ?? '').startsWith('required'),
    look: {
      face: HEX.test(card.appearance.front) ? card.appearance.front.toLowerCase() : '#ffffff',
      edgePx: Math.min(3, Math.max(1, Math.round(caliperMm * 10))),
    },
  };
}

/** Every stock cv offers, bond first. */
export function paperStocks(): PaperStockView[] {
  return (Object.keys(CARDS) as PaperStockId[]).map(view);
}

export function paperStock(id: PaperStockId): PaperStockView {
  return view(id);
}

export function isPaperStockId(v: unknown): v is PaperStockId {
  return typeof v === 'string' && Object.hasOwn(CARDS, v);
}

/**
 * A letter fold on a portrait page. Pliego folds along the sheet's long side; cv reads its first panel (the cover,
 * folded last) as the TOP of the page and its last, shorter panel (the tuck, folded first) as the BOTTOM, the usual
 * way a letter is folded: the bottom third up, then the top third down over it.
 */
export interface LetterFoldView {
  paper: Paper;
  stock: PaperStockId;
  /** Portrait page size, mm. */
  pageMm: { width: number; height: number };
  /** Fold lines measured from the TOP edge, mm. */
  foldsFromTopMm: [number, number];
  /** Top (cover), middle, bottom (tuck) panel heights, mm. */
  panelsMm: [number, number, number];
  /** How much shorter the tucked panel is, mm. */
  tuckShorterByMm: number;
  /** `crease` (a plain fold) or `score` (score first), per fold line, as Pliego assigns it. */
  treatment: 'crease' | 'score';
  /** The generated document's digest (Pliego's `pliego:meta.digest`), so anyone can re-derive these numbers. */
  digest: string;
}

interface FoldCase {
  paper: string;
  stock: string;
  sheet_mm: { fold_axis: number; across: number };
  folds: { at_mm: number; treatment: string }[];
  panels_mm: number[];
  digest: string;
}

export function letterFold(paper: Paper, stock: PaperStockId): LetterFoldView {
  const c = (printFoldsLetter.cases as FoldCase[]).find((x) => x.paper === paper && x.stock === stock);
  if (!c || c.folds.length !== 2 || c.panels_mm.length !== 3) throw new Error(`pliego: no letter fold for ${paper}/${stock}`);
  const [top, middle, bottom] = c.panels_mm as [number, number, number];
  const treatment = c.folds.every((f) => f.treatment === 'score') ? 'score' : 'crease';
  return {
    paper,
    stock,
    pageMm: { width: c.sheet_mm.across, height: c.sheet_mm.fold_axis },
    foldsFromTopMm: [c.folds[0]!.at_mm, c.folds[1]!.at_mm],
    panelsMm: [top, middle, bottom],
    tuckShorterByMm: Math.round((top - bottom) * 1e6) / 1e6,
    treatment,
    digest: c.digest,
  };
}

/** Every letter fold cv carries (each paper size × each stock), for the print view of a cover letter. */
export function letterFolds(): LetterFoldView[] {
  const out: LetterFoldView[] = [];
  for (const paper of ['letter', 'a4'] as const) for (const s of paperStocks()) out.push(letterFold(paper, s.id));
  return out;
}

/** The pinned sources, for the attribution line. */
export const PLIEGO_PINS = { pliego: lock.pliego.commit, commons: lock.commons.commit } as const;
