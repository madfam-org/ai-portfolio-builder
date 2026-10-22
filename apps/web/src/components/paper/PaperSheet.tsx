'use client';

import { useCallback, type ReactNode } from 'react';
import type { PaperStockView } from '@/lib/pliego/paper';
import css from './paper.module.css';

/**
 * A document on a sheet of real paper, on SCREEN only (W5-P): the stock's face colour and an edge that follows its
 * caliper, both from Pliego's stock card. The values reach CSS as custom properties set through the CSSOM (allowed by
 * the nonce CSP; never a `style` attribute in the server markup). Without script the sheet stays the plain white one.
 * Print and PDF ignore all of it: the rules live in `@media screen` (paper.module.css).
 */
export function PaperSheet({ look, stock, className, paper, children }: { look: PaperStockView['look']; stock: PaperStockView['id']; className?: string; paper?: string; children: ReactNode }) {
  const { face, edgePx } = look;
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      el.style.setProperty('--paper-face', face);
      el.style.setProperty('--paper-edge', `${edgePx}px`);
    },
    [face, edgePx],
  );
  return (
    <div ref={ref} className={[className, css.paper].filter(Boolean).join(' ')} data-paper-stock={stock} data-paper={paper}>
      {children}
    </div>
  );
}
