'use client';

import { Notice } from '@/components/ui/States';
import type { BenchmarkDto } from '@/lib/client/types';
import { BENCHMARK_COPY, count, money, quarterLabel } from '@/lib/copy/benchmark';
import { fmt } from '@/lib/copy/jobs';
import type { Locale } from '@/lib/routing';
import { RangeChart } from './RangeChart';
import { stateName } from './states';
import s from './benchmark.module.css';

type Segment = NonNullable<BenchmarkDto['segment']>;

/**
 * The retail-industry view under the general range (W7): Symbiosis HCM's same ENOE statistic counting only people
 * whose employer is a store of the segment's industries. Rendered only when the route asked for it (the job's SINCO is
 * a retail-sales occupation). HCM's own label says what the segment holds, «no solo lujo»; n, the quarter and the
 * source sit next to the figures, as in the general block.
 */
export function SegmentSection({ locale, segment, sinco, minimumN, tailsMinimumN }: { locale: Locale; segment: Segment; sinco: string; minimumN: number; tailsMinimumN: number }) {
  const t = BENCHMARK_COPY[locale];
  return (
    <section className="stack" aria-labelledby="benchmark-segment-heading" data-testid="benchmark-segment">
      <h3 id="benchmark-segment-heading">{t.segmentHeading}</h3>
      <p className="small muted">
        {t.segmentIntro} {fmt(t.segmentWhy, { code: sinco })}
      </p>
      {segment.state === 'unavailable' ? (
        <Notice tone="warning">
          <span data-testid="benchmark-segment-unavailable">{t.segmentUnavailable}</span>
        </Notice>
      ) : (
        <Ready locale={locale} segment={segment} minimumN={minimumN} tailsMinimumN={tailsMinimumN} />
      )}
    </section>
  );
}

function Ready({ locale, segment, minimumN, tailsMinimumN }: { locale: Locale; segment: Extract<Segment, { state: 'ready' }>; minimumN: number; tailsMinimumN: number }) {
  const t = BENCHMARK_COPY[locale];
  const m = (n: number) => money(n, locale);
  const geo = segment.geography;
  const raw = segment.income?.percentiles;
  const n = segment.income?.n ?? segment.suppression?.n ?? 0;
  // HCM withholds what its floor does not allow; nothing is estimated in its place.
  const p = segment.status === 'ok' && raw && raw.p25 !== null && raw.p50 !== null && raw.p75 !== null ? { ...raw, p25: raw.p25, p50: raw.p50, p75: raw.p75 } : null;

  return (
    <>
      <p data-testid="benchmark-segment-label">{fmt(t.segmentLabel, { label: locale === 'en' ? segment.labelEn : segment.label })}</p>
      <p className="small">
        {geo.scope === 'state' ? fmt(t.scopeState, { state: stateName(geo.state) }) : null}
        {geo.scope === 'national' && geo.fallback_reason === 'state_cell_below_minimum_n'
          ? fmt(t.fallback, { state: stateName(geo.requested_state), n: geo.requested_state_n ?? 0, min: minimumN })
          : null}
        {geo.scope === 'national' && geo.fallback_reason === 'no_state_records' ? fmt(t.noStateRecords, { state: stateName(geo.requested_state) }) : null}
        {geo.scope === 'national' && !geo.fallback_reason ? t.scopeNational : null}
      </p>
      {p ? (
        <>
          <RangeChart
            p10={p.p10}
            p25={p.p25}
            p50={p.p50}
            p75={p.p75}
            p90={p.p90}
            posting={null}
            label={fmt(t.chartLabel, { p25: m(p.p25), p50: m(p.p50), p75: m(p.p75) })}
            format={m}
            testId="benchmark-segment-chart"
          />
          <dl className={s.figures} data-testid="benchmark-segment-figures">
            <div>
              <dt>{t.median}</dt>
              <dd data-testid="benchmark-segment-median">{fmt(t.perMonth, { amount: m(p.p50) })}</dd>
            </div>
            <div>
              <dt>{t.middle}</dt>
              <dd>
                {m(p.p25)} – {m(p.p75)}
              </dd>
            </div>
            <div>
              <dt>{t.wide}</dt>
              <dd>{p.p10 !== null && p.p90 !== null ? `${m(p.p10)} – ${m(p.p90)}` : fmt(t.tailsWithheld, { min: tailsMinimumN })}</dd>
            </div>
          </dl>
          {segment.position ? <p data-testid="benchmark-segment-posting">{fmt(t.segmentPosting, { position: t.positions[segment.position] })}</p> : null}
        </>
      ) : (
        <Notice tone="warning">
          <span data-testid="benchmark-segment-insufficient">{fmt(t.segmentInsufficient, { n: count(n, locale), min: minimumN })}</span>
        </Notice>
      )}
      <p className={s.source} data-testid="benchmark-segment-source">
        {fmt(t.sourceLine, { period: quarterLabel(segment.period.label, locale), n: count(n, locale) })}{' '}
        <a href={segment.source.program_url} rel="noopener noreferrer">
          {t.sourceLink}
        </a>
      </p>
      <details>
        <summary>{t.segmentIndustries}</summary>
        <ul className={s.list}>
          {segment.industries.map((industry) => (
            <li key={industry.code} className="small" lang="es-MX">
              {industry.code} {industry.title}
            </li>
          ))}
          {segment.scopeNote ? (
            <li className="small" lang="es-MX">
              {segment.scopeNote}
            </li>
          ) : null}
        </ul>
      </details>
    </>
  );
}
