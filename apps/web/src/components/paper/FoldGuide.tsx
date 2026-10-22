import { mm, PAPER_COPY } from '@/lib/copy/paper';
import type { LetterFoldView } from '@/lib/pliego/paper';
import type { Locale } from '@/lib/routing';
import css from './paper.module.css';

/**
 * How to fold a printed cover letter in three, with the fold lines Pliego's kernel computes for that page size and
 * stock (W5-P): the bottom part first, then the top over it; the bottom part ends shorter so it tucks in flat. Screen
 * only (the print view hides it): the letter itself never carries fold marks. The drawing is decorative; the steps are
 * the content.
 */
export function FoldGuide({ locale, fold, paperName }: { locale: Locale; fold: LetterFoldView; paperName: string }) {
  const t = PAPER_COPY[locale];
  const { width, height } = fold.pageMm;
  const [top, bottomFold] = fold.foldsFromTopMm;
  const fromBottom = height - bottomFold;
  const lines = [18, 30, 42, 54, 66, 120, 132, 144, 156, 205, 217, 229];
  return (
    <section className={css.fold} aria-labelledby="fold-guide-title" data-fold-guide={`${fold.paper}/${fold.stock}`}>
      <h2 id="fold-guide-title" className={css.foldTitle}>
        {t.foldTitle}
      </h2>
      <div className={css.foldBody}>
        <svg className={css.foldArt} viewBox={`-2 -2 ${width + 4} ${height + 4}`} aria-hidden="true" focusable="false">
          <rect className={css.foldPage} x="0" y="0" width={width} height={height} />
          {lines
            .filter((y) => y < height - 20)
            .map((y) => (
              <line key={y} className={css.foldText} x1="20" x2={width - (y % 3 === 0 ? 60 : 20)} y1={y} y2={y} />
            ))}
          <line className={css.foldLine} x1="0" x2={width} y1={top} y2={top} data-fold-at={top} />
          <line className={css.foldLine} x1="0" x2={width} y1={bottomFold} y2={bottomFold} data-fold-at={bottomFold} />
        </svg>
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
