import type { ReactNode } from 'react';
import { PaperStyle } from '@/components/paper/PaperStyle';
import paperCss from '@/components/paper/paper.module.css';
import { DEFAULT_STOCK, paperStock } from '@/lib/pliego/paper';
import styles from './pages.module.css';

/**
 * A published document on a sheet of bond 80 (Pliego's stock card), on SCREEN only (W5-P phase 2, owner ruling
 * 2026-10-22: «the paper look should extend there»). Server-rendered and script-free: the stock's colour and edge come
 * in a nonce'd `<style>` (PaperStyle), the look itself from `@media screen` rules, so print and «Save as PDF» get the
 * same plain page as before. Slides keep their own frame. Everything is served from this host: no font, image or CDN.
 */
export function PaperPage({ kind, children }: { kind: string; children: ReactNode }) {
  if (kind === 'presentation') return <>{children}</>;
  const bond = paperStock(DEFAULT_STOCK);
  return (
    <>
      <PaperStyle stocks={[bond]} />
      <div className={`${styles.sheet} ${paperCss.paper}`} data-paper-stock={bond.id}>
        {children}
      </div>
    </>
  );
}
