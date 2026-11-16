import { mm, PAPER_COPY } from '@/lib/copy/paper';
import type { LetterFoldView } from '@/lib/pliego/paper';
import type { Locale } from '@/lib/routing';
import { FoldMotion } from './FoldMotion';
import css from './paper.module.css';

/**
 * How to fold a printed cover letter in three, with the fold lines Pliego's kernel computes for that page size and
 * stock (W5-P): the bottom part first, then the top over it; the bottom part ends shorter so it tucks in flat. Screen
 * only (the print view hides it): the letter itself never carries fold marks. The small sheet (FoldMotion) shows the
 * fold lines and plays Pliego's fold program; the written steps are the content.
 */
export function FoldGuide({ locale, fold, paperName }: { locale: Locale; fold: LetterFoldView; paperName: string }) {
  const t = PAPER_COPY[locale];
  const { width, height } = fold.pageMm;
  const [top, bottomFold] = fold.foldsFromTopMm;
  const fromBottom = height - bottomFold;
  return (
    <section className={css.fold} aria-labelledby="fold-guide-title" data-fold-guide={`${fold.paper}/${fold.stock}`}>
      <h2 id="fold-guide-title" className={css.foldTitle}>
        {t.foldTitle}
      </h2>
      <div className={css.foldBody}>
        <FoldMotion key={`${fold.paper}/${fold.stock}`} locale={locale} fold={fold} />
        <div>
          <p className={css.foldIntro}>{t.foldIntro}</p>
          <ol className={css.foldSteps}>
            <li data-step="bottom">{t.foldBottom(mm(locale, fromBottom))}</li>
            <li data-step="top">{t.foldTop(mm(locale, top))}</li>
          </ol>
          <p className={css.foldNote}>{t.foldTuck(mm(locale, fold.tuckShorterByMm), mm(locale, fold.panelsMm[0]), mm(locale, width))}</p>
          {fold.treatment === 'score' ? <p className={css.foldNote}>{t.foldScore}</p> : null}
          <p className={css.source}>{t.foldSource(paperName)}</p>
        </div>
      </div>
    </section>
  );
}
