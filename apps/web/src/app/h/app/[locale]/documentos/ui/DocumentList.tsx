'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { SelectField, TextField } from '@/components/ui/Field';
import { Badge, EmptyState, ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { appPath } from '@/lib/app-routes';
import { api, apiErrorMessage, type ApiError } from '@/lib/client/api';
import type { ArtifactDto, ArtifactKind, ArtifactStatus, JobDto } from '@/lib/client/types';
import { APP_COPY } from '@/lib/copy/app';
import { DOCUMENTS_COPY } from '@/lib/copy/render';
import type { Locale } from '@/lib/routing';
import css from './documents.module.css';

const KINDS: readonly ArtifactKind[] = ['cv', 'portfolio', 'presentation', 'cover_letter'];
const STATUSES: readonly ArtifactStatus[] = ['draft', 'ready', 'published'];
/** The job filter's value for general (untailored) documents; job ids are UUIDs, so it cannot collide. */
const GENERAL = 'general';

/**
 * «Documentos»: the signed-in person's artifacts, filtered by job, kind and status (all on the client: one read of the
 * list), each with its status, visibility, job and links to open, preview and print; and a create form. Dormant-aware:
 * 503 not_configured shows the honest state, never an empty list that looks real.
 */
export function DocumentList({ locale }: { locale: Locale }) {
  const a = APP_COPY[locale];
  const d = DOCUMENTS_COPY[locale];
  const toast = useToast();
  const [rows, setRows] = useState<ArtifactDto[] | null>(null);
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [filter, setFilter] = useState({ job: '', kind: '', status: '' });
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<ArtifactKind>('cv');
  const [jobId, setJobId] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [list, jobList] = await Promise.all([api.listArtifacts(), api.listJobs()]);
    if (list.ok) {
      setRows(list.data.artifacts);
      setError(null);
    } else {
      setError(list.error);
    }
    // The job names are a convenience: without them the list still works (job filter and labels disappear).
    setJobs(jobList.ok ? jobList.data.jobs : []);
  }, []);

  useEffect(() => {
    // Loads once on mount; the state updates happen after the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const jobTitle = useMemo(() => new Map(jobs.map((j) => [j.id, j.company ? `${j.title} · ${j.company}` : j.title])), [jobs]);
  const shown = (rows ?? []).filter(
    (r) =>
      (filter.job === '' || (filter.job === GENERAL ? r.jobId === null : r.jobId === filter.job)) &&
      (filter.kind === '' || r.kind === filter.kind) &&
      (filter.status === '' || r.status === filter.status),
  );

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setTitleError(a.states.invalid);
      return;
    }
    setTitleError(null);
    const res = await api.createArtifact({ kind, title, locale: locale === 'en' ? 'en' : 'es-MX', jobId: jobId || null });
    if (!res.ok) {
      toast(apiErrorMessage(res.error, a.states), 'danger');
      return;
    }
    setTitle('');
    toast(a.states.saved);
    await load();
  }

  const all = { value: '', label: d.all };
  return (
    <section className="band" aria-labelledby="mine">
      <h2 id="mine">{a.mine}</h2>
      <p className="muted">{d.listIntro}</p>
      {error ? (
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
      ) : rows === null ? (
        <p className="muted" role="status">
          {a.loading}
        </p>
      ) : rows.length === 0 ? (
        <EmptyState title={a.empty} />
      ) : (
        <>
          <div className={css.filters}>
            {jobs.length ? (
              <SelectField
                id="filter-job"
                label={d.filterJob}
                value={filter.job}
                onChange={(e) => setFilter({ ...filter, job: e.target.value })}
                options={[all, { value: GENERAL, label: d.general }, ...jobs.map((j) => ({ value: j.id, label: jobTitle.get(j.id) ?? j.title }))]}
              />
            ) : null}
            <SelectField id="filter-kind" label={d.filterKind} value={filter.kind} onChange={(e) => setFilter({ ...filter, kind: e.target.value })} options={[all, ...KINDS.map((k) => ({ value: k, label: a.kinds[k] }))]} />
            <SelectField
              id="filter-status"
              label={d.filterStatus}
              value={filter.status}
              onChange={(e) => setFilter({ ...filter, status: e.target.value })}
              options={[all, ...STATUSES.map((s) => ({ value: s, label: a.statuses[s] }))]}
            />
          </div>
          {shown.length === 0 ? (
            <EmptyState title={d.noMatch} action={<Button variant="secondary" onClick={() => setFilter({ job: '', kind: '', status: '' })}>{d.clearFilters}</Button>} />
          ) : (
            <ul className={css.rows} data-testid="artifact-list">
              {shown.map((r) => (
                <li key={r.id} className={css.row} data-artifact-id={r.id}>
                  <a className={css.rowTitle} href={appPath.artifact(locale, r.id)}>
                    {r.title}
                  </a>
                  <p className={css.rowMeta}>
                    <span>{a.kinds[r.kind]}</span>
                    <Badge>{a.statuses[r.status]}</Badge>
                    <Badge>{d.visibility[r.visibility]}</Badge>
                    {r.suspendedAt ? <Badge>{d.suspended}</Badge> : null}
                    {r.jobId && jobTitle.get(r.jobId) ? (
                      <span>
                        {d.forJob}: {jobTitle.get(r.jobId)}
                      </span>
                    ) : null}
                  </p>
                  <p className={css.rowLinks}>
                    <a href={appPath.artifactPreview(locale, r.id)}>{d.preview}</a>
                    <a href={appPath.artifactPrint(locale, r.id)}>{d.print}</a>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {error?.kind === 'not_configured' ? null : (
        <form className="stack" onSubmit={create} noValidate>
          <h3>{a.createTitle}</h3>
          <TextField id="new-artifact-title" label={a.titleLabel} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} error={titleError} />
          <SelectField id="new-artifact-kind" label={a.kindLabel} value={kind} onChange={(e) => setKind(e.target.value as ArtifactKind)} options={KINDS.map((k) => ({ value: k, label: a.kinds[k] }))} />
          {jobs.length ? (
            <SelectField
              id="new-artifact-job"
              label={d.jobLabel}
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              options={[{ value: '', label: d.jobNone }, ...jobs.map((j) => ({ value: j.id, label: jobTitle.get(j.id) ?? j.title }))]}
            />
          ) : null}
          <Button type="submit">{a.create}</Button>
        </form>
      )}
    </section>
  );
}
