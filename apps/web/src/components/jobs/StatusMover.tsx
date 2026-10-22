'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { APP_COPY, type JobStatus } from '@/lib/copy/app';
import { fmt, JOBS_COPY } from '@/lib/copy/jobs';
import type { Locale } from '@/lib/routing';
import { PIPELINE } from './pipeline';
import s from './jobs.module.css';

/**
 * Changing a job's status from the keyboard: a labelled native <select> plus «Mover». Choosing an option does
 * nothing by itself (arrow keys on a closed select must not move the card); the button commits, and the caller puts
 * focus back on this control in its new column.
 */
export function StatusMover({
  locale,
  jobId,
  title,
  status,
  onMove,
}: {
  locale: Locale;
  jobId: string;
  title: string;
  status: JobStatus;
  onMove: (status: JobStatus) => Promise<void>;
}) {
  const a = APP_COPY[locale];
  const t = JOBS_COPY[locale];
  const [choice, setChoice] = useState<JobStatus>(status);
  const [busy, setBusy] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  const selectId = `status-${jobId}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (choice === status) return;
    setBusy(true);
    await onMove(choice);
    setBusy(false);
    // The button disables once the status is current; keep keyboard focus on the control (if still mounted here).
    selectRef.current?.focus();
  }

  return (
    <form className={s.mover} onSubmit={submit} aria-busy={busy}>
      <label htmlFor={selectId}>{fmt(t.board.statusLabel, { title })}</label>
      <select ref={selectRef} id={selectId} value={choice} onChange={(e) => setChoice(e.target.value as JobStatus)} data-testid="status-select">
        {PIPELINE.map((st) => (
          <option key={st} value={st}>
            {a.jobStatuses[st]}
          </option>
        ))}
      </select>
      <Button type="submit" variant="secondary" size="small" disabled={busy || choice === status}>
        {t.board.move}
      </Button>
    </form>
  );
}
