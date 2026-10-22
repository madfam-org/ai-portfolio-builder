'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { fmt, JOBS_COPY } from '@/lib/copy/jobs';
import type { Locale } from '@/lib/routing';
import { NOTES_MAX, POSTING_MAX, TITLE_MAX, checkJobForm, type JobField, type JobFieldError, type JobFormValues } from './pipeline';
import s from './jobs.module.css';

export const EMPTY_JOB_FORM: JobFormValues = { title: '', company: '', location: '', sourceUrl: '', sourceText: '', notes: '' };

export type JobFormOutcome = { ok: true } | { ok: false; fields?: Partial<Record<JobField, JobFieldError>> };

const MAX: Record<JobField, number> = { title: TITLE_MAX, company: TITLE_MAX, location: TITLE_MAX, sourceUrl: 2000, sourceText: POSTING_MAX, notes: NOTES_MAX };
const ORDER: readonly JobField[] = ['title', 'company', 'location', 'sourceUrl', 'sourceText', 'notes'];

/**
 * The job intake (and the full edit on the job page): title, company, location, an optional reference link that is
 * never fetched, the pasted posting with a visible counter against its cap, and notes. Errors are checked before
 * sending (W2's rules) and come back from the API as field errors too; the first invalid field takes focus.
 * No `maxLength` on the posting: a paste over the cap is shown as an error, never silently cut.
 */
export function JobForm({
  locale,
  idPrefix,
  initial = EMPTY_JOB_FORM,
  withNotes = true,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  locale: Locale;
  idPrefix: string;
  initial?: JobFormValues;
  withNotes?: boolean;
  submitLabel: string;
  onSubmit: (values: JobFormValues) => Promise<JobFormOutcome>;
  onCancel?: () => void;
}) {
  const t = JOBS_COPY[locale];
  const [values, setValues] = useState<JobFormValues>(initial);
  const [errors, setErrors] = useState<Partial<Record<JobField, JobFieldError>>>({});
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const id = (f: JobField) => `${idPrefix}-${f}`;

  const set = (field: JobField) => (e: { target: { value: string } }) => {
    const value = e.target.value;
    setValues((v) => ({ ...v, [field]: value }));
    if (errors[field]) setErrors((all) => ({ ...all, [field]: undefined }));
  };
  const message = (field: JobField): string | null => {
    const code = errors[field];
    return code ? fmt(t.fieldErrors[code], { max: MAX[field].toLocaleString(locale === 'en' ? 'en-US' : 'es-MX') }) : null;
  };
  const focusFirst = (found: Partial<Record<JobField, JobFieldError>>) => {
    const first = ORDER.find((f) => found[f]);
    if (first) formRef.current?.querySelector<HTMLElement>(`#${id(first)}`)?.focus();
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = checkJobForm(withNotes ? values : { ...values, notes: '' });
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirst(found);
      return;
    }
    setBusy(true);
    const outcome = await onSubmit(values);
    setBusy(false);
    if (outcome.ok) {
      setValues(initial);
      setErrors({});
    } else if (outcome.fields && Object.keys(outcome.fields).length > 0) {
      setErrors(outcome.fields);
      focusFirst(outcome.fields);
    }
  }

  const fmtNumber = (n: number) => n.toLocaleString(locale === 'en' ? 'en-US' : 'es-MX');
  const length = values.sourceText.trim().length;
  const over = length > POSTING_MAX;

  return (
    <form ref={formRef} className="stack" onSubmit={submit} noValidate aria-busy={busy}>
      <TextField id={id('title')} label={t.intake.title} value={values.title} onChange={set('title')} required error={message('title')} autoComplete="off" />
      <TextField id={id('company')} label={t.intake.company} value={values.company} onChange={set('company')} error={message('company')} autoComplete="off" />
      <TextField id={id('location')} label={t.intake.location} value={values.location} onChange={set('location')} error={message('location')} autoComplete="off" />
      <TextField
        id={id('sourceUrl')}
        label={t.intake.sourceUrl}
        hint={t.intake.sourceUrlHint}
        type="url"
        inputMode="url"
        value={values.sourceUrl}
        onChange={set('sourceUrl')}
        error={message('sourceUrl')}
        autoComplete="off"
      />
      <TextAreaField
        id={id('sourceText')}
        label={t.intake.sourceText}
        hint={fmt(t.intake.sourceTextHint, { max: fmtNumber(POSTING_MAX) })}
        rows={10}
        value={values.sourceText}
        onChange={set('sourceText')}
        required
        error={message('sourceText')}
        aria-describedby={[`${id('sourceText')}-hint`, `${id('sourceText')}-count`, message('sourceText') ? `${id('sourceText')}-error` : ''].filter(Boolean).join(' ')}
      />
      <p className={`${s.counter} ${over ? s.counterOver : ''}`} id={`${id('sourceText')}-count`} data-testid={`${idPrefix}-counter`}>
        {fmt(t.intake.counter, { n: fmtNumber(length), max: fmtNumber(POSTING_MAX) })}
      </p>
      {withNotes ? <TextAreaField id={id('notes')} label={t.intake.notes} rows={3} value={values.notes} onChange={set('notes')} error={message('notes')} /> : null}
      <div className={s.actions}>
        <Button type="submit" disabled={busy}>
          {busy ? t.intake.saving : submitLabel}
        </Button>
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel}>
            {t.detail.cancel}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
