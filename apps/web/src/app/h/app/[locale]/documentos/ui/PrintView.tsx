'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { FoldGuide } from '@/components/paper/FoldGuide';
import { PaperSheet } from '@/components/paper/PaperSheet';
import { estimatePrintedPages } from '@/components/paper/print-pages';
import { cvTemplateClass } from '@/components/render/template-classes';
import { useToast } from '@/components/ui/Toast';
import { api, apiErrorMessage } from '@/lib/client/api';
import type { ArtifactKind } from '@/lib/client/types';
import { APP_COPY } from '@/lib/copy/app';
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
/** The denser CV template the print view offers to a CV of three pages or more. */
const COMPACT_TEMPLATE = 'compacto';

export function PrintView({
  locale,
  slides,
  backHref,
  stocks,
  folds,
  artifact,
  children,
}: {
  locale: Locale;
  slides: boolean;
  backHref: string;
  stocks: PaperStockView[];
  folds: LetterFoldView[] | null;
  /** The document: a CV of three pages or more is offered the denser template when it would print shorter. */
  artifact?: { id: string; kind: ArtifactKind; template: string };
  children: ReactNode;
}) {
  const d = DOCUMENTS_COPY[locale];
  const router = useRouter();
  const toast = useToast();
  const [size, setSize] = useState<Paper>('letter');
  const [stockId, setStockId] = useState<PaperStockId>('copy-80');
  const stock = stocks.find((s) => s.id === stockId) ?? stocks[0];
  const fold = folds?.find((f) => f.paper === size && f.stock === stockId) ?? null;
  const sheetClass = `${css.sheet} ${slides ? '' : size === 'a4' ? paper.paperA4 : paper.paperLetter}`;
  // «Aprox. N páginas»: the document laid out with the print rules at the printable width (components/paper/print-pages.ts).
  const [pages, setPages] = useState<number | null>(null);
  // A long CV in another template: the same estimate as if it used Compacta (shown only when that is shorter).
  const [compact, setCompact] = useState<number | null>(null);
  const [switching, setSwitching] = useState(false);
  const kind = artifact?.kind;
  const template = artifact?.template;
  useEffect(() => {
    if (slides) return;
    let live = true;
    const run = () => {
      const el = document.querySelector<HTMLElement>(`[data-paper="${size}"]`);
      if (!el || !live) return;
      try {
        const now = estimatePrintedPages(el, size);
        setPages(now);
        const offer = kind === 'cv' && template !== COMPACT_TEMPLATE && now >= 3;
        const alt = offer ? estimatePrintedPages(el, size, { from: cvTemplateClass(template ?? 'base'), to: cvTemplateClass(COMPACT_TEMPLATE) }) : null;
        setCompact(alt !== null && alt < now ? alt : null);
      } catch {
        setPages(null);
        setCompact(null);
      }
    };
    void document.fonts.ready.then(run);
    return () => {
      live = false;
    };
  }, [size, slides, kind, template]);

  async function switchToCompact() {
    if (!artifact) return;
    setSwitching(true);
    const res = await api.updateArtifact(artifact.id, { template: COMPACT_TEMPLATE });
    setSwitching(false);
    if (!res.ok) {
      toast(apiErrorMessage(res.error, APP_COPY[locale].states), 'danger');
      return;
    }
    toast(d.printCompactDone);
    router.refresh();
  }
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
        {!slides && pages ? (
          <p className="small" data-testid="print-pages" data-pages={pages}>
            {d.printPages(pages, d.papers[size])}
          </p>
        ) : null}
        {compact !== null ? (
          <p className="small" data-testid="print-compact" data-pages={compact}>
            {d.printCompact(compact)}{' '}
            <Button size="small" variant="secondary" disabled={switching} onClick={() => void switchToCompact()}>
              {d.printCompactUse}
            </Button>
          </p>
        ) : null}
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
