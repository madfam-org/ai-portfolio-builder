'use client';

import { useState, type ReactNode } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Notice } from '@/components/ui/States';
import { DOCUMENTS_COPY, type Paper } from '@/lib/copy/render';
import type { Locale } from '@/lib/routing';
import paper from '@/components/render/render.module.css';
import css from './documents.module.css';

/**
 * The print view's controls (never printed): how to get a PDF from the browser, the paper size (Carta by default, the
 * es-MX norm; A4) and the print button. The size is a named CSS page on the sheet (components/render/render.module.css),
 * so «Guardar como PDF» gets the right page without a server-side PDF (lane X §5, PDF decision).
 */
export function PrintView({ locale, slides, backHref, children }: { locale: Locale; slides: boolean; backHref: string; children: ReactNode }) {
  const d = DOCUMENTS_COPY[locale];
  const [size, setSize] = useState<Paper>('letter');
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
        <Button onClick={() => window.print()}>{d.printButton}</Button>
      </div>
      <div className={`${css.sheet} ${slides ? '' : size === 'a4' ? paper.paperA4 : paper.paperLetter}`} data-paper={slides ? 'slides' : size}>
        {children}
      </div>
    </div>
  );
}
