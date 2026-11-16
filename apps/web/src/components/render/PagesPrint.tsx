'use client';

import { useSyncExternalStore } from 'react';
import { PAGES_COPY } from '@/lib/copy/pages';
import type { Locale } from '@/lib/routing';
import s from './render.module.css';

const noop = () => () => undefined;

/**
 * Batch 4 (critique #9): the recruiter's way to keep a published document — «Guardar como PDF» opens the browser's
 * print dialog, whose print rules give the same plain page as the owner's own PDF (real text, A4 / Carta). Rendered only
 * once the page's script runs, so a page without script never shows a button that does nothing. Never printed.
 */
export function PagesPrint({ locale }: { locale: Locale }) {
  const enhanced = useSyncExternalStore(noop, () => true, () => false);
  if (!enhanced) return null;
  return (
    <div className={s.pagesPrint}>
      <button type="button" className={s.deckButton} onClick={() => window.print()}>
        {PAGES_COPY[locale].savePdf}
      </button>
    </div>
  );
}
