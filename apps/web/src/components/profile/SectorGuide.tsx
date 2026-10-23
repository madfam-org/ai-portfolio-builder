'use client';

import type { SectorGuideCopy, SectorGuideKind } from '@/lib/copy/profile';
import s from './profile.module.css';

/**
 * W7 (B3): «Ideas para ventas de lujo y retail», folded (a native <details>, closed by default) inside the form of an
 * item kind the guide covers. Tips, the format of an example (figures marked illustrative) and keyword suggestions:
 * a keyword button adds it to the item's tags, nothing else is filled in for the person.
 */
export function SectorGuide({ copy, guide, tags, onAddKeyword }: { copy: SectorGuideCopy; guide: SectorGuideKind; tags: readonly string[]; onAddKeyword: (keyword: string) => void }) {
  const has = (k: string) => tags.some((t) => t.toLowerCase() === k.toLowerCase());
  return (
    <details className={s.guide} data-testid="sector-guide">
      <summary className={s.guideSummary}>{copy.summary}</summary>
      <p className={s.hint}>{copy.intro}</p>
      <ul className={s.guideList}>
        {guide.tips.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
      <p className={s.guideLabel}>
        {copy.examplesLabel}
      </p>
      <ul className={s.guideList}>
        {guide.examples.map((ex) => (
          <li key={ex} className={s.guideExample}>
            {ex}
          </li>
        ))}
      </ul>
      <p className={s.guideLabel}>
        {copy.keywordsLabel}
      </p>
      <p className={s.hint}>{copy.keywordsHint}</p>
      <ul className={s.chips}>
        {guide.keywords.map((k) => (
          <li key={k}>
            <button type="button" className={s.suggestion} aria-label={copy.addKeyword(k)} aria-pressed={has(k)} disabled={has(k)} onClick={() => onAddKeyword(k)}>
              + {k}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
