/**
 * Strings of the paper preview and the printing advice (W5-P), es-MX source and en. Every number they print comes
 * from Pliego's data (`lib/pliego/paper.ts`); these strings only phrase it (R85: no claim the data does not carry).
 */
import type { Locale } from '../routing.ts';

export interface PaperCopy {
  /** `Intl` locale for millimetres. */
  intl: string;
  stockLabel: string;
  stockHint: string;
  /** The facts line of a stock: grosor, rigidez relative to bond, folding rule. */
  facts: (p: { name: string; caliper: string; stiffer: string | null; bondName: string; score: boolean }) => string;
  source: string;
  sourceLink: string;
  previewOn: (stockName: string) => string;
  foldTitle: string;
  foldIntro: string;
  foldBottom: (mm: string) => string;
  foldTop: (mm: string) => string;
  foldTuck: (mm: string, width: string, height: string) => string;
  foldScore: string;
  foldSource: (paperName: string) => string;
}

export const PAPER_COPY: Record<Locale, PaperCopy> = {
  es: {
    intl: 'es-MX',
    stockLabel: 'Papel',
    stockHint: 'Cambia la vista en pantalla y los consejos de impresión; el PDF y la impresión no cambian.',
    facts: ({ name, caliper, stiffer, bondName, score }) =>
      `${name}: unos ${caliper} mm de grosor${stiffer ? ` y unas ${stiffer} veces más rígida a la flexión que el ${bondName}` : ''} (valores estimados). ` +
      (score ? 'Márcala antes de doblarla (hendido): sin marcar, se agrieta en el doblez.' : 'Se dobla con un pliegue firme; no hace falta marcarla.'),
    source: 'Datos del papel y de los dobleces: fichas y cálculos de Pliego, la plataforma de papel de MADFAM.',
    sourceLink: 'pliego.madfam.io',
    previewOn: (stockName) => `Vista en ${stockName.charAt(0).toLowerCase()}${stockName.slice(1)}. En «Imprimir o guardar PDF» puedes elegir otro papel.`,
    foldTitle: 'Para doblarla en tres (tipo carta)',
    foldIntro: 'Si la imprimes para entregarla en un sobre:',
    foldBottom: (mm) => `Dobla hacia arriba la parte de abajo, a ${mm} mm del borde inferior.`,
    foldTop: (mm) => `Dobla hacia abajo la parte de arriba, a ${mm} mm del borde superior, sobre la anterior.`,
    foldTuck: (mm, width, height) => `La parte de abajo queda ${mm} mm más corta para que entre sin abultar; doblada mide ${width} × ${height} mm.`,
    foldScore: 'En cartulina, marca las dos líneas antes de doblar.',
    foldSource: (paperName) => `Medidas para ${paperName}, calculadas por Pliego (doblez tipo carta del cartucho «print-folds»).`,
  },
  en: {
    intl: 'en',
    stockLabel: 'Paper',
    stockHint: 'Changes the on-screen view and the printing advice; the PDF and the printout do not change.',
    facts: ({ name, caliper, stiffer, bondName, score }) =>
      `${name}: about ${caliper} mm thick${stiffer ? ` and about ${stiffer} times stiffer to bend than ${bondName}` : ''} (estimated values). ` +
      (score ? 'Score it before folding: unscored, it cracks along the fold.' : 'A firm crease folds it; no scoring needed.'),
    source: 'Paper and fold data: stock cards and calculations from Pliego, MADFAM’s paper platform.',
    sourceLink: 'pliego.madfam.io',
    previewOn: (stockName) => `Shown on ${stockName}. Choose another paper under «Print or save PDF».`,
    foldTitle: 'Folding it in three (letter fold)',
    foldIntro: 'If you print it to hand over in an envelope:',
    foldBottom: (mm) => `Fold the bottom part up, ${mm} mm from the bottom edge.`,
    foldTop: (mm) => `Fold the top part down over it, ${mm} mm from the top edge.`,
    foldTuck: (mm, width, height) => `The bottom part ends ${mm} mm shorter so it tucks in flat; folded, it measures ${width} × ${height} mm.`,
    foldScore: 'On cardstock, score both lines before folding.',
    foldSource: (paperName) => `Measurements for ${paperName}, calculated by Pliego (the letter fold of its «print-folds» cartridge).`,
  },
};

/** Millimetres with one decimal, in the page's locale. */
export function mm(locale: Locale, v: number): string {
  return new Intl.NumberFormat(PAPER_COPY[locale].intl, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(v);
}

/** Caliper with two decimals (0.10 mm, 0.20 mm). */
export function caliper(locale: Locale, v: number): string {
  return new Intl.NumberFormat(PAPER_COPY[locale].intl, { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(v);
}
