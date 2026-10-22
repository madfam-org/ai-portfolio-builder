'use client';

import { useState, type FormEvent } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { TextAreaField } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/Layout';
import { Badge, ErrorState, Notice } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { appPath } from '@/lib/app-routes';
import { api, apiErrorMessage } from '@/lib/client/api';
import type { JobDto, JobStatus } from '@/lib/client/types';
import { APP_COPY } from '@/lib/copy/app';
import { fmt, JOBS_COPY } from '@/lib/copy/jobs';
import type { Locale } from '@/lib/routing';
import { JobDocuments } from './JobDocuments';
import { JobForm, type JobFormOutcome } from './JobForm';
import { MatchPanel } from './MatchPanel';
import { StatusMover } from './StatusMover';
import { NOTES_MAX, issuesToFields, jobBody, linkHost, type JobFormValues } from './pipeline';
import { useJobBundle } from './useJobBundle';
import s from './jobs.module.css';

/** `/empleos/:id`: one job (status, reference link, posting, notes, edit, delete), its keyword match and its documents. */
export function JobDetail({ locale, jobId }: { locale: Locale; jobId: string }) {
  const a = APP_COPY[locale];
  const t = JOBS_COPY[locale];
  const toast = useToast();
  const { bundle, reload, setJob } = useJobBundle(jobId);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);

  if (bundle.state === 'loading') {
    return (
      <p className="muted" role="status">
        {t.loading}
      </p>
    );
  }
  if (bundle.state === 'error') {
    const message = bundle.error.kind === 'not_found' ? t.detail.notFound : apiErrorMessage(bundle.error, a.states);
    return (
      <>
        <ErrorState message={message} />
        <p>
          <a href={appPath.jobs(locale)}>{t.detail.back}</a>
        </p>
      </>
    );
  }

  const { job, items, match, artifacts } = bundle.data;
  const host = linkHost(job.sourceUrl);
  const notesValue = notes ?? job.notes;

  async function patch(body: Parameters<typeof api.updateJob>[1]): Promise<JobDto | null> {
    const res = await api.updateJob(jobId, body);
    if (!res.ok) {
      toast(apiErrorMessage(res.error, a.states), 'danger');
      return null;
    }
    setJob(res.data.job);
    return res.data.job;
  }

  async function move(status: JobStatus) {
    if (await patch({ status })) toast(fmt(t.board.moved, { title: job.title, status: a.jobStatuses[status] }));
  }

  async function saveNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (notesValue.trim().length > NOTES_MAX) return;
    if (await patch({ notes: notesValue.trim() })) {
      setNotes(null);
      toast(a.states.saved);
    }
  }

  async function saveEdit(values: JobFormValues): Promise<JobFormOutcome> {
    const { notes: _notes, ...body } = jobBody(values);
    const res = await api.updateJob(jobId, body);
    if (!res.ok) {
      const fields = issuesToFields(res.error.issues);
      if (Object.keys(fields).length === 0) toast(apiErrorMessage(res.error, a.states), 'danger');
      return { ok: false, fields };
    }
    setEditing(false);
    toast(a.states.saved);
    await reload(); // the posting may have changed: the match follows it
    return { ok: true };
  }

  async function remove() {
    setConfirming(false);
    const res = await api.deleteJob(jobId);
    if (res.ok) {
      toast(t.detail.deleted);
      window.location.assign(appPath.jobs(locale));
      return;
    }
    if (res.error.kind === 'conflict' && res.error.code === 'job_has_artifacts') setDeleteBlocked(true);
    else toast(apiErrorMessage(res.error, a.states), 'danger');
  }

  return (
    <>
      <p>
        <a href={appPath.jobs(locale)}>{t.detail.back}</a>
      </p>
      <PageHeader
        eyebrow={<Badge>{a.jobStatuses[job.status]}</Badge>}
        title={job.title}
        description={[job.company, job.location].filter(Boolean).join(' · ') || undefined}
        actions={<ButtonLink href={appPath.jobTailor(locale, job.id)}>{t.docs.tailorCta}</ButtonLink>}
      />

      <section className={s.section} aria-labelledby="job-status-heading">
        <h2 id="job-status-heading">{t.detail.statusHeading}</h2>
        <StatusMover locale={locale} jobId={job.id} title={job.title} status={job.status} onMove={move} />
        {host ? (
          <p className="small">
            <a href={job.sourceUrl!} rel="ugc nofollow noopener noreferrer" data-testid="job-source-link">
              {fmt(t.detail.sourceLink, { host })}
            </a>{' '}
            <span className="muted">{t.detail.sourceNote}</span>
          </p>
        ) : (
          <p className="small muted">{t.detail.noSource}</p>
        )}
        <details>
          <summary>{fmt(t.detail.postingToggle, { n: job.sourceText.length.toLocaleString(locale === 'en' ? 'en-US' : 'es-MX') })}</summary>
          <div className={s.posting} data-testid="job-posting">
            {job.sourceText}
          </div>
        </details>
      </section>

      <MatchPanel locale={locale} match={match} items={items} headingId="job-match-heading" />

      <JobDocuments locale={locale} artifacts={artifacts} headingId="job-docs-heading">
        <a href={appPath.jobTailor(locale, job.id)}>{t.docs.tailorCta}</a>
      </JobDocuments>

      <section className={s.section} aria-labelledby="job-notes-heading">
        <h2 id="job-notes-heading">{t.detail.notes}</h2>
        <form className="stack" onSubmit={saveNotes}>
          <TextAreaField
            id="job-notes"
            label={t.detail.notes}
            rows={4}
            value={notesValue}
            onChange={(e) => setNotes(e.target.value)}
            error={notesValue.trim().length > NOTES_MAX ? fmt(t.fieldErrors.tooLong, { max: NOTES_MAX }) : null}
          />
          <div className={s.actions}>
            <Button type="submit" variant="secondary">
              {t.detail.notesSave}
            </Button>
          </div>
        </form>
      </section>

      <section className={s.section} aria-labelledby="job-edit-heading">
        <h2 id="job-edit-heading">{t.detail.editHeading}</h2>
        {editing ? (
          <JobForm
            locale={locale}
            idPrefix="job-edit"
            withNotes={false}
            initial={{ title: job.title, company: job.company, location: job.location, sourceUrl: job.sourceUrl ?? '', sourceText: job.sourceText, notes: '' }}
            submitLabel={t.detail.save}
            onSubmit={saveEdit}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <div className={s.actions}>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {t.detail.edit}
            </Button>
            <Button variant="danger" onClick={() => setConfirming(true)}>
              {t.detail.delete}
            </Button>
          </div>
        )}
        {deleteBlocked ? <Notice tone="warning">{t.detail.deleteBlocked}</Notice> : null}
      </section>

      <ConfirmDialog
        id="delete-job"
        open={confirming}
        title={t.detail.deleteTitle}
        confirmLabel={t.detail.deleteConfirm}
        cancelLabel={t.detail.cancel}
        danger
        onConfirm={() => void remove()}
        onCancel={() => setConfirming(false)}
      >
        <p>{t.detail.deleteBody}</p>
      </ConfirmDialog>
    </>
  );
}
