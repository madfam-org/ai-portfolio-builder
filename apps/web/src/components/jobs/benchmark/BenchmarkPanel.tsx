'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/States';
import { api, type ApiError } from '@/lib/client/api';
import type { BenchmarkDto } from '@/lib/client/types';
import { BENCHMARK_COPY, count, money, quarterLabel } from '@/lib/copy/benchmark';
import { fmt } from '@/lib/copy/jobs';
import type { Locale } from '@/lib/routing';
import { RangeChart } from './RangeChart';
import { stateName } from './states';
import jobs from '../jobs.module.css';
import s from './benchmark.module.css';

type State = { kind: 'loading' } | { kind: 'dormant' } | { kind: 'unavailable' } | { kind: 'ready'; data: BenchmarkDto };

function toState(error: ApiError): State {
  return error.kind === 'not_configured' ? { kind: 'dormant' } : { kind: 'unavailable' };
}

/**
 * `/empleos/:id` → «Rango de ingreso en el mercado»: Symbiosis HCM's INEGI ENOE range for the job's occupation and
 * state (`GET /api/v1/jobs/:id/benchmark`). Shows the range, the median, where the posting's stated monthly salary
 * falls, n, the quarter and the source next to every figure; «sin datos suficientes» when HCM withholds them.
 */
export function BenchmarkPanel({ locale, jobId, location, headingId }: { locale: Locale; jobId: string; location: string; headingId: string }) {
  const t = BENCHMARK_COPY[locale];
  const [state, setState] = useState<State>({ kind: 'loading' });
  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    const res = await api.benchmark(jobId);
    setState(res.ok ? { kind: 'ready', data: res.data } : toState(res.error));
  }, [jobId]);
  useEffect(() => {
    // Fetch on mount and when the job changes; the state update happens after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <section className={jobs.section} aria-labelledby={headingId} data-testid="benchmark-panel" aria-busy={state.kind === 'loading'}>
      <h2 id={headingId}>{t.heading}</h2>
      <p className="muted">{t.intro}</p>
      {state.kind === 'loading' ? (
        <p className="muted" role="status">
          {t.loading}
        </p>
      ) : null}
      {state.kind === 'dormant' ? <Notice>{t.dormant}</Notice> : null}
      {state.kind === 'unavailable' ? (
        <Notice tone="warning">
          {t.unavailable}{' '}
          <Button variant="secondary" size="small" onClick={() => void load()}>
            {t.retry}
          </Button>
        </Notice>
      ) : null}
      {state.kind === 'ready' ? <Result locale={locale} data={state.data} location={location} /> : null}
      <p className="small muted">{t.privacy}</p>
    </section>
  );
}

function Result({ locale, data, location }: { locale: Locale; data: BenchmarkDto; location: string }) {
  const t = BENCHMARK_COPY[locale];
  const period = quarterLabel(data.period.label, locale);

  if (data.status === 'occupation_unresolved' || data.status === 'occupation_ambiguous' || data.status === 'occupation_unknown') {
    const message = data.status === 'occupation_unknown' ? t.unknown : fmt(data.status === 'occupation_ambiguous' ? t.ambiguous : t.unresolved, { title: data.query.title });
    return (
      <div className="stack" data-testid="benchmark-unresolved">
        <Notice>{message}</Notice>
        {data.candidates.length > 0 ? (
          <>
            <p className="small">{t.candidates}</p>
            <ul className={s.list}>
              {data.candidates.map((c) => (
                <li key={c.sinco} className="small">
                  {c.title} (SINCO {c.sinco})
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    );
  }

  const occ = data.occupation!;
  const match = occ.match;
  const method = match.method && match.method in t.method ? fmt(t.method[match.method as keyof typeof t.method], { phrase: match.matched_phrase ?? '' }) : null;
  const requested = stateName(data.query.state);
  const geo = data.geography;

  return (
    <div className="stack">
      <p>
        <strong>{fmt(t.occupation, { code: occ.sinco, title: occ.title })}</strong>
        {method ? <span className="muted"> — {method}</span> : null}
      </p>
      <p className="small muted">
        {fmt(t.confidence, { value: match.confidence.toFixed(2) })}
        {match.ignored_terms.length > 0 ? ` ${fmt(t.ignored, { terms: match.ignored_terms.join(', ') })}` : null} {t.noSeniority}
      </p>
      <p className="small" data-testid="benchmark-geography">
        {data.query.stateSource === 'job_field' ? fmt(t.stateFromField, { state: requested }) : null}
        {data.query.stateSource === 'location_text' ? fmt(t.stateFromLocation, { state: requested, location }) : null}
        {data.query.stateSource === null ? t.noState : null}{' '}
        {geo.fallback_reason === 'state_cell_below_minimum_n'
          ? fmt(t.fallback, { state: requested, n: geo.requested_state_n ?? 0, min: data.methodology.minimum_n })
          : null}
        {geo.fallback_reason === 'no_state_records' ? fmt(t.noStateRecords, { state: requested }) : null}
        {geo.scope === 'state' ? fmt(t.scopeState, { state: stateName(geo.state) }) : null}
        {geo.scope === 'national' && !geo.fallback_reason && data.query.stateSource !== null ? t.scopeNational : null}
      </p>

      {data.status === 'insufficient_data' || !data.income ? (
        <Notice tone="warning">
          <span data-testid="benchmark-insufficient">
            {fmt(t.insufficient, { n: count(data.suppression?.n ?? 0, locale), min: data.methodology.minimum_n })}
          </span>
        </Notice>
      ) : (
        <Figures locale={locale} data={data} />
      )}

      <p className={s.source} data-testid="benchmark-source">
        {fmt(t.sourceLine, { period, n: count(data.income?.n ?? data.suppression?.n ?? 0, locale) })}{' '}
        <a href={data.source.program_url} rel="noopener noreferrer">
          {t.sourceLink}
        </a>
      </p>
      <details>
        <summary>{t.methodology}</summary>
        <ul className={s.list}>
          <li className="small">{fmt(t.thresholds, { min: data.methodology.minimum_n, tails: data.methodology.tails_minimum_n })}</li>
          {data.methodology.notes.map((note) => (
            <li key={note} className="small" lang="es-MX">
              {note}
            </li>
          ))}
          <li className="small" lang="es-MX">
            {data.source.citation}
          </li>
        </ul>
      </details>
    </div>
  );
}

function Figures({ locale, data }: { locale: Locale; data: BenchmarkDto }) {
  const t = BENCHMARK_COPY[locale];
  const income = data.income!;
  const p = income.percentiles;
  const m = (n: number) => money(n, locale);
  const per = (n: number) => fmt(t.perMonth, { amount: m(n) });
  const posting = data.posting;
  const share = income.income_reporting_share === null ? null : Math.round(Number(income.income_reporting_share) * 100);

  if (p.p25 === null || p.p50 === null || p.p75 === null) {
    return <Notice tone="warning">{fmt(t.insufficient, { n: count(income.n, locale), min: data.methodology.minimum_n })}</Notice>;
  }
  return (
    <>
      <RangeChart
        p10={p.p10}
        p25={p.p25}
        p50={p.p50}
        p75={p.p75}
        p90={p.p90}
        posting={posting.position ? posting.comparableMonthlyMxn : null}
        label={fmt(t.chartLabel, { p25: m(p.p25), p50: m(p.p50), p75: m(p.p75) })}
        format={m}
      />
      <dl className={s.figures} data-testid="benchmark-figures">
        <div>
          <dt>{t.median}</dt>
          <dd data-testid="benchmark-median">{per(p.p50)}</dd>
        </div>
        <div>
          <dt>{t.middle}</dt>
          <dd>
            {m(p.p25)} – {m(p.p75)}
          </dd>
        </div>
        <div>
          <dt>{t.wide}</dt>
          <dd>{p.p10 !== null && p.p90 !== null ? `${m(p.p10)} – ${m(p.p90)}` : fmt(t.tailsWithheld, { min: data.methodology.tails_minimum_n })}</dd>
        </div>
      </dl>
      <p className="small muted">
        {fmt(t.population, { population: count(income.weighted_population, locale) })}
        {share !== null ? ` ${fmt(t.reporting, { share })}` : null}
      </p>
      <p data-testid="benchmark-posting">
        {posting.position && posting.comparableMonthlyMxn !== null ? (
          <>
            {fmt(t.posting, { amount: m(posting.comparableMonthlyMxn), position: t.positions[posting.position] })}
            {posting.salary?.min && posting.salary?.max && posting.salary.min !== posting.salary.max
              ? ` ${fmt(t.postingRange, { min: m(posting.salary.min), max: m(posting.salary.max) })}`
              : null}
          </>
        ) : posting.salary ? (
          t.notComparable
        ) : (
          t.noSalary
        )}
      </p>
      {posting.position ? <p className="small muted">{t.postingCaveat}</p> : null}
    </>
  );
}
