import type { JobDto } from '@/lib/client/types';
import { INGEST_COPY, MX_STATE_NAMES } from '@/lib/copy/ingest';
import type { Locale } from '@/lib/routing';
import s from './intake.module.css';

/** The typed posting fields of a job (W5-J), only those that are set; nothing when none is (jobs from before W5-J). */
export function JobFacts({ locale, job }: { locale: Locale; job: JobDto }) {
  const t = INGEST_COPY[locale];
  const nf = new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-MX', { maximumFractionDigits: 2 });
  const salary =
    job.salaryMin !== null || job.salaryMax !== null
      ? [
          job.salaryMin !== null && job.salaryMax !== null && job.salaryMin !== job.salaryMax ? `${nf.format(job.salaryMin)} – ${nf.format(job.salaryMax)}` : nf.format((job.salaryMin ?? job.salaryMax)!),
          job.salaryCurrency,
          job.salaryPeriod ? t.periods[job.salaryPeriod] : null,
        ]
          .filter(Boolean)
          .join(' ')
      : null;
  const rows: [string, string | null][] = [
    [t.preview.state, job.stateCode ? (MX_STATE_NAMES[job.stateCode] ?? job.stateCode) : null],
    [t.preview.country, job.countryCode],
    [t.preview.employmentType, job.employmentType ? t.employmentTypes[job.employmentType] : null],
    [t.preview.workMode, job.workMode ? t.workModes[job.workMode] : null],
    [t.preview.salaryLegend.replace(/\s*\(.*\)$/, ''), salary],
    [t.preview.datePosted, job.datePosted],
    [t.preview.validThrough, job.validThrough],
  ];
  const shown = rows.filter((r): r is [string, string] => r[1] !== null && r[1] !== '');
  if (shown.length === 0) return null;
  return (
    <dl className={s.facts} data-testid="job-facts">
      {shown.map(([label, value]) => (
        <div key={label} className={s.factRow}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
