'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { CheckboxField } from '@/components/ui/Field';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { appPath } from '@/lib/app-routes';
import { api, apiErrorMessage, type ApiError } from '@/lib/client/api';
import type { JobDto, JobStatus } from '@/lib/client/types';
import { APP_COPY } from '@/lib/copy/app';
import { fmt, JOBS_COPY } from '@/lib/copy/jobs';
import type { Locale } from '@/lib/routing';
import { JobForm, type JobFormOutcome } from './JobForm';
import { StatusMover } from './StatusMover';
import { issuesToFields, jobBody, pipelineColumns, type JobFormValues } from './pipeline';
import s from './jobs.module.css';

/**
 * `/empleos`: the intake form and the pipeline board (one column per status, counts, a status control per card).
 * Real, owner-scoped data only; the dormant 503 shows the honest state and hides the form.
 */
export function JobsBoard({ locale }: { locale: Locale }) {
  const a = APP_COPY[locale];
  const t = JOBS_COPY[locale];
  const toast = useToast();
  const [jobs, setJobs] = useState<JobDto[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api.listJobs();
    if (res.ok) {
      setJobs(res.data.jobs);
      setError(null);
    } else {
      setError(res.error);
    }
  }, []);

  useEffect(() => {
    // Loads once on mount; the state updates happen after the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // After a create or a move, focus follows the card to its (new) place.
  useEffect(() => {
    if (!focusId) return;
    document.getElementById(`status-${focusId}`)?.focus();
  }, [focusId, jobs]);

  async function create(values: JobFormValues): Promise<JobFormOutcome> {
    const res = await api.createJob({ ...jobBody(values), status: 'saved' });
    if (!res.ok) {
      const fields = issuesToFields(res.error.issues);
      if (Object.keys(fields).length === 0) toast(apiErrorMessage(res.error, a.states), 'danger');
      return { ok: false, fields };
    }
    toast(t.intake.created);
    setFocusId(res.data.job.id);
    await load();
    return { ok: true };
  }

  async function move(job: JobDto, status: JobStatus) {
    const res = await api.updateJob(job.id, { status });
    if (!res.ok) {
      toast(apiErrorMessage(res.error, a.states), 'danger');
      return;
    }
    if (status === 'archived') setShowArchived(true);
    toast(fmt(t.board.moved, { title: job.title, status: a.jobStatuses[status] }));
    setFocusId(job.id);
    await load();
  }

  if (error) {
    return (
      <ErrorState
        message={apiErrorMessage(error, a.states)}
        action={
          error.kind === 'not_configured' ? null : (
            <Button variant="secondary" size="small" onClick={() => void load()}>
              {a.states.retry}
            </Button>
          )
        }
      />
    );
  }

  const { columns, archivedCount } = pipelineColumns(jobs ?? [], showArchived);

  return (
    <>
      <section className={s.section} aria-labelledby="job-intake-heading">
        <h2 id="job-intake-heading">{t.intake.heading}</h2>
        <JobForm locale={locale} idPrefix="job-new" submitLabel={t.intake.submit} onSubmit={create} />
      </section>

      <section className={s.section} aria-labelledby="job-board-heading">
        <h2 id="job-board-heading">{t.board.heading}</h2>
        {jobs === null ? (
          <p className="muted" role="status">
            {t.loading}
          </p>
        ) : jobs.length === 0 ? (
          <EmptyState title={t.board.empty}>{t.board.emptyBody}</EmptyState>
        ) : (
          <>
            <CheckboxField
              id="show-archived"
              label={fmt(t.board.showArchived, { n: archivedCount })}
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            <div className={s.board} data-testid="job-board">
              {columns.map((col) => (
                <section key={col.status} className={s.column} aria-labelledby={`col-${col.status}`} data-testid={`column-${col.status}`}>
                  <h3 id={`col-${col.status}`}>
                    <span>{a.jobStatuses[col.status]}</span>
                    <span aria-hidden="true">{col.jobs.length}</span>
                    <span className="visually-hidden">({col.jobs.length})</span>
                  </h3>
                  {col.jobs.length === 0 ? (
                    <p className={s.meta}>{t.board.columnEmpty}</p>
                  ) : (
                    <ul className={s.cards}>
                      {col.jobs.map((job) => (
                        <li key={job.id} className={s.card} data-testid="job-card">
                          <h4>
                            <a href={appPath.job(locale, job.id)}>{job.title}</a>
                          </h4>
                          {job.company || job.location ? <p className={s.meta}>{[job.company, job.location].filter(Boolean).join(' · ')}</p> : null}
                          <StatusMover locale={locale} jobId={job.id} title={job.title} status={job.status} onMove={(st) => move(job, st)} />
                          <div className={s.links}>
                            <a href={appPath.jobTailor(locale, job.id)}>{t.board.tailor}</a>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          </>
        )}
      </section>
    </>
  );
}
