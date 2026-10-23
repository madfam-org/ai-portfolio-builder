import s from './benchmark.module.css';

interface Props {
  p10: number | null;
  p25: number;
  p50: number;
  p75: number;
  p90: number | null;
  posting: number | null;
  label: string;
  format: (n: number) => string;
  /** Distinguishes the general chart from the segment one on the same page. */
  testId?: string;
}

const W = 600;
const PAD = 24;

/**
 * The published percentiles on one axis: the P10-P90 whisker (only when HCM published both tails), the P25-P75 box,
 * the median and, when the posting states a comparable salary, a marker. Positions are SVG geometry attributes, never
 * a `style` (the CSP forbids inline styles); colours come from the CSS module. The numbers are also written out next
 * to the chart, so nothing depends on seeing it.
 */
export function RangeChart({ p10, p25, p50, p75, p90, posting, label, format, testId = 'benchmark-chart' }: Props) {
  const values = [p10 ?? p25, p90 ?? p75, ...(posting === null ? [] : [posting])];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const x = (v: number) => PAD + ((v - lo) / span) * (W - 2 * PAD);
  const tails = p10 !== null && p90 !== null;

  return (
    <svg className={s.chart} viewBox={`0 0 ${W} 96`} role="img" aria-label={label} data-testid={testId}>
      <line className={s.axis} x1={PAD} x2={W - PAD} y1={44} y2={44} />
      {tails ? <line className={s.whisker} x1={x(p10)} x2={x(p90)} y1={44} y2={44} /> : null}
      <rect className={s.box} x={x(p25)} y={30} width={Math.max(2, x(p75) - x(p25))} height={28} rx={4} />
      <line className={s.median} x1={x(p50)} x2={x(p50)} y1={26} y2={62} />
      <text className={s.tick} x={x(p25)} y={84} textAnchor="middle">
        {format(p25)}
      </text>
      <text className={s.tick} x={x(p75)} y={84} textAnchor="middle">
        {format(p75)}
      </text>
      <text className={s.tickStrong} x={x(p50)} y={18} textAnchor="middle">
        {format(p50)}
      </text>
      {posting !== null ? (
        <polygon className={s.posting} points={`${x(posting) - 7},70 ${x(posting) + 7},70 ${x(posting)},58`} data-testid={`${testId}-posting-marker`} />
      ) : null}
    </svg>
  );
}
