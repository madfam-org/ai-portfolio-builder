'use client';

import { useState, type ReactNode } from 'react';
import { FoldGuide } from '@/components/paper/FoldGuide';
import { PaperSheet } from '@/components/paper/PaperSheet';
import { StockPicker } from '@/components/paper/StockPicker';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Notice } from '@/components/ui/States';
import { DOCUMENTS_COPY, type Paper } from '@/lib/copy/render';
import type { LetterFoldView, PaperStockId, PaperStockView } from '@/lib/pliego/paper';
import type { Locale } from '@/lib/routing';
import paper from '@/components/render/render.module.css';
import css from './documents.module.css';

/**
 * The print view's controls (never printed): how to get a PDF from the browser, the paper size (Carta by default, the
 * es-MX norm; A4) and the print button. The size is a named CSS page on the sheet (components/render/render.module.css),
 * so «Guardar como PDF» gets the right page without a server-side PDF (lane X §5, PDF decision).
 *
 * W5-P: the paper stock (Pliego's cards: bond 80 by default, cartulina 160) colours the sheet ON SCREEN and words the
 * advice; a cover letter also gets the letter-fold guide for the chosen size and stock. The printed page and the PDF
 * are the same whichever stock is chosen (paper.module.css keeps the look in `@media screen`).
 */
export function PrintView({ locale, slides, backHref, stocks, folds, children }: { locale: Locale; slides: boolean; backHref: string; stocks: PaperStockView[]; folds: LetterFoldView[] | null; children: ReactNode }) {
  const d = DOCUMENTS_COPY[locale];
  const [size, setSize] = useState<Paper>('letter');
  const [stockId, setStockId] = useState<PaperStockId>('copy-80');
  const stock = stocks.find((s) => s.id === stockId) ?? stocks[0];
  const fold = folds?.find((f) => f.paper === size && f.stock === stockId) ?? null;
  const sheetClass = `${css.sheet} ${slides ? '' : size === 'a4' ? paper.paperA4 : paper.paperLetter}`;
  return (
    <div className={css.printRoot}>
      <div className={`${css.noPrint} ${css.printHelp}`}>
        <div className={css.toolbar}>
          <ButtonLink variant="secondary" size="small" href={backHref}>
            {d.back}
          </ButtonLink>
        </div>
        <h1>{d.printTitle}</h1>
        <Notice>{slides ? d.printHowToSlides : d.printHowTo}</Notice>
        {slides ? null : (
          <fieldset className={css.paper}>
            <legend>{d.paperLabel}</legend>
            {(['letter', 'a4'] as const).map((p) => (
              <label key={p}>
                <input type="radio" name="paper" value={p} checked={size === p} onChange={() => setSize(p)} /> {d.papers[p]}
              </label>
            ))}
          </fieldset>
        )}
        {slides || !stock ? null : <StockPicker locale={locale} stocks={stocks} value={stock.id} onChange={setStockId} />}
        {fold ? <FoldGuide locale={locale} fold={fold} paperName={d.papers[size]} /> : null}
        <Button onClick={() => window.print()}>{d.printButton}</Button>
      </div>
      {slides || !stock ? (
        <div className={sheetClass} data-paper={slides ? 'slides' : size}>
          {children}
        </div>
      ) : (
        <PaperSheet className={sheetClass} paper={size} look={stock.look} stock={stock.id}>
          {children}
        </PaperSheet>
      )}
    </div>
  );
}
