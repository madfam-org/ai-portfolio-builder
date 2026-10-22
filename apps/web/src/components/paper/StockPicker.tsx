import { caliper, PAPER_COPY } from '@/lib/copy/paper';
import type { PaperStockId, PaperStockView } from '@/lib/pliego/paper';
import type { Locale } from '@/lib/routing';
import css from './paper.module.css';

/** The facts line of one stock, phrased from its Pliego card (grosor, rigidez relative to bond, folding rule). */
export function stockFacts(locale: Locale, stock: PaperStockView, bond: PaperStockView): string {
  return PAPER_COPY[locale].facts({
    name: stock.name[locale],
    caliper: caliper(locale, stock.caliperMm),
    stiffer: stock.stiffnessVsBond > 1 ? new Intl.NumberFormat(PAPER_COPY[locale].intl, { maximumFractionDigits: 1 }).format(stock.stiffnessVsBond) : null,
    bondName: bond.name[locale].charAt(0).toLowerCase() + bond.name[locale].slice(1),
    score: stock.scoreBeforeFolding,
  });
}

/**
 * Which paper the document is shown on (W5-P), native radios in a fieldset (arrow keys move within it), the chosen
 * stock's facts announced politely, and where the data comes from. Changes the screen and the advice only.
 */
export function StockPicker({ locale, stocks, value, onChange }: { locale: Locale; stocks: PaperStockView[]; value: PaperStockId; onChange: (id: PaperStockId) => void }) {
  const t = PAPER_COPY[locale];
  const bond = stocks.find((s) => s.id === 'copy-80') ?? stocks[0]!;
  const current = stocks.find((s) => s.id === value) ?? bond;
  return (
    <div className={css.picker}>
      <fieldset className={css.stocks} aria-describedby="paper-stock-hint">
        <legend>{t.stockLabel}</legend>
        {stocks.map((s) => (
          <label key={s.id}>
            <input type="radio" name="paper-stock" value={s.id} checked={value === s.id} onChange={() => onChange(s.id)} /> {s.name[locale]}
          </label>
        ))}
        <p id="paper-stock-hint" className={css.hint}>
          {t.stockHint}
        </p>
      </fieldset>
      <p className={css.facts} aria-live="polite" data-testid="paper-facts">
        {stockFacts(locale, current, bond)}
      </p>
      <p className={css.source}>
        {t.source}{' '}
        <a href="https://pliego.madfam.io/" rel="noopener">
          {t.sourceLink}
        </a>
      </p>
    </div>
  );
}
