import { ButtonLink } from '@/components/ui/Button';
import { Badge, EmptyState } from '@/components/ui/States';
import { appPath } from '@/lib/app-routes';
import type { ItemDto, MatchDto } from '@/lib/client/types';
import { fmt, JOBS_COPY } from '@/lib/copy/jobs';
import type { Locale } from '@/lib/routing';
import { itemLabel } from './tailoring';
import s from './jobs.module.css';

/**
 * The AI-free match of `GET /api/v1/jobs/:id/match`, explained: the rule in plain words (labelled «sin IA»), the
 * API's own counts (no percentage it does not return), each item with its score and exactly which tags and words of
 * the posting it matched, and the posting's terms no item covers.
 */
export function MatchPanel({ locale, match, items, headingId }: { locale: Locale; match: MatchDto; items: readonly ItemDto[]; headingId: string }) {
  const t = JOBS_COPY[locale];
  const byId = new Map(items.map((i) => [i.id, i]));
  const ranked = match.items.filter((m) => m.score > 0 && byId.has(m.itemId));
  const unmatched = match.items.filter((m) => m.score === 0 && byId.has(m.itemId));
  const points = (n: number) => fmt(n === 1 ? t.match.point : t.match.points, { n });
  const label = (id: string) => {
    const item = byId.get(id)!;
    return itemLabel(item, t.itemKind[item.kind]);
  };

  return (
    <section className={s.section} aria-labelledby={headingId} data-testid="match-panel">
      <h2 id={headingId}>{t.matchLabel}</h2>
      <p className="muted">{fmt(t.match.explain, { algorithm: match.algorithm })}</p>
      <p className="small muted">{t.match.normalised}</p>
      {items.length === 0 ? (
        <EmptyState title={t.match.noItems} action={<ButtonLink href={appPath.profile(locale)}>{t.match.noItemsAction}</ButtonLink>} />
      ) : (
        <>
          <p data-testid="match-coverage">
            <strong>{fmt(t.match.coverage, { jobTerms: match.jobTerms, coveredTerms: match.coveredTerms })}</strong>
          </p>
          {ranked.length > 0 ? (
            <>
              <h3>{t.match.ranked}</h3>
              <ol className={s.ranked} data-testid="match-ranked">
                {ranked.map((m) => (
                  <li key={m.itemId}>
                    <div className={s.rankHead}>
                      <strong>{label(m.itemId)}</strong>
                      <Badge>{t.itemKind[m.kind]}</Badge>
                      <span className={s.score}>{points(m.score)}</span>
                    </div>
                    {m.matchedTags.length > 0 ? (
                      <div>
                        <span className="small muted">{t.match.matchedTags} </span>
                        <ul className={s.chips} aria-label={t.match.matchedTags}>
                          {m.matchedTags.map((tag) => (
                            <li key={tag} className={s.chip}>
                              {tag}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {m.matchedTerms.length > 0 ? (
                      <p className="small">
                        <span className="muted">{t.match.matchedTerms}</span> {m.matchedTerms.join(', ')}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </>
          ) : null}
          {unmatched.length > 0 ? (
            <details>
              <summary>{fmt(t.match.unmatched, { n: unmatched.length })}</summary>
              <ul className={s.plain}>
                {unmatched.map((m) => (
                  <li key={m.itemId}>
                    {label(m.itemId)} <Badge>{t.itemKind[m.kind]}</Badge>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
      <h3>{t.match.missing}</h3>
      {match.missingTerms.length === 0 ? (
        <p className="muted">{t.match.missingNone}</p>
      ) : (
        <>
          <p className="small muted">{t.match.missingHint}</p>
          <ul className={s.chips} data-testid="match-missing">
            {match.missingTerms.map((term) => (
              <li key={term} className={s.chip}>
                {term}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
