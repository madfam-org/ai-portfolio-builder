'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/States';
import { api } from '@/lib/client/api';
import type { IntakeDraft, JobDto } from '@/lib/client/types';
import { INGEST_COPY, MX_STATE_NAMES } from '@/lib/copy/ingest';
import type { Locale } from '@/lib/routing';
import { EMPLOYMENT_TYPES, SALARY_PERIODS, WORK_MODES } from '@/server/ingest/vocab';
import { jobFromPreview, previewFromDraft, type DRAFT_KEYS, type PreviewKey, type PreviewValues } from './client';
import s from './intake.module.css';

const PROVIDER_NAMES: Record<string, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  smartrecruiters: 'SmartRecruiters',
  ashby: 'Ashby',
  workable: 'Workable',
  recruitee: 'Recruitee',
  pinpoint: 'Pinpoint',
};

/**
 * The preview of a draft job (W5-J): every field editable, each with where it came from («de JSON-LD», «del texto»…,
 * «editado por ti» once changed). Nothing is stored until «Guardar vacante» (one `POST /api/v1/jobs`); «Descartar»
 * sends nothing. Invalid values come back from the API as field errors; the first one takes focus.
 */
export function IntakePreview({ locale, draft, onSaved, onDiscard }: { locale: Locale; draft: IntakeDraft; onSaved: (job: JobDto) => void; onDiscard: () => void }) {
  const t = INGEST_COPY[locale];
  const [values, setValues] = useState<PreviewValues>(() => previewFromDraft(draft));
  const [edited, setEdited] = useState<Set<PreviewKey>>(new Set());
  const [errors, setErrors] = useState<Partial<Record<PreviewKey, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  const id = (k: PreviewKey) => `intake-${k}`;
  const set = (k: PreviewKey) => (e: { target: { value: string } }) => {
    const value = e.target.value;
    setValues((v) => ({ ...v, [k]: value }));
    setEdited((all) => new Set(all).add(k));
    if (errors[k]) setErrors((all) => ({ ...all, [k]: undefined }));
  };
  const from = (k: (typeof DRAFT_KEYS)[number]) => {
    if (edited.has(k)) return <p className={`${s.from} ${s.fromEdited}`}>{t.preview.edited}</p>;
    const f = draft.fields[k];
    return f ? (
      <p className={s.from} data-testid={`from-${k}`}>
        {t.from[f.from]}
      </p>
    ) : null;
  };

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);
    const found: Partial<Record<PreviewKey, string>> = {};
    if (!values.title.trim()) found.title = t.notes.title_missing;
    for (const k of ['salaryMin', 'salaryMax'] as const) if (values[k].trim() && !Number.isFinite(Number(values[k].replace(/,/g, '')))) found[k] = t.invalidSalary;
    if (Object.keys(found).length) {
      setErrors(found);
      formRef.current?.querySelector<HTMLElement>(`#${id(Object.keys(found)[0] as PreviewKey)}`)?.focus();
      return;
    }
    setBusy(true);
    const res = await api.createJob(jobFromPreview(values, draft.sourceKind));
    setBusy(false);
    if (res.ok) {
      onSaved(res.data.job);
      return;
    }
    const issues = res.error.issues ?? [];
    const fields: Partial<Record<PreviewKey, string>> = {};
    for (const i of issues) {
      const key = i.path.split('.')[0] as PreviewKey;
      if (key in values) fields[key] = key.startsWith('salary') ? t.invalidSalary : t.saveFailed;
    }
    setErrors(fields);
    setFailure(res.error.kind === 'rate_limited' ? t.quota : t.saveFailed);
    const first = Object.keys(fields)[0] as PreviewKey | undefined;
    if (first) formRef.current?.querySelector<HTMLElement>(`#${id(first)}`)?.focus();
  }

  const option = (value: string, label: string) => ({ value, label });
  const none = option('', t.preview.none);

  return (
    <section className={s.preview} aria-labelledby="intake-preview-heading" data-testid="intake-preview">
      <h2 id="intake-preview-heading" ref={heading} tabIndex={-1}>
        {t.preview.title}
      </h2>
      <p>{t.preview.body}</p>
      {draft.provider ? <p className={s.from}>{t.preview.viaProvider(PROVIDER_NAMES[draft.provider] ?? draft.provider)}</p> : null}
      {draft.notes.length ? (
        <ul className={s.notes} data-testid="intake-notes">
          {draft.notes.map((n) => (
            <li key={n}>{t.notes[n]}</li>
          ))}
        </ul>
      ) : null}
      {failure ? <Notice tone="danger">{failure}</Notice> : null}
      <form ref={formRef} className="stack" onSubmit={save} noValidate aria-busy={busy}>
        <div className={s.grid}>
          <div>
            <TextField id={id('title')} label={t.fields.title} value={values.title} onChange={set('title')} required error={errors.title} autoComplete="off" maxLength={200} />
            {from('title')}
          </div>
          <div>
            <TextField id={id('company')} label={t.fields.company} value={values.company} onChange={set('company')} autoComplete="off" maxLength={200} />
            {from('company')}
          </div>
          <div>
            <TextField id={id('location')} label={t.fields.location} value={values.location} onChange={set('location')} autoComplete="off" maxLength={200} />
            {from('location')}
          </div>
          <div>
            <SelectField
              id={id('stateCode')}
              label={t.preview.state}
              value={values.stateCode}
              onChange={set('stateCode')}
              error={errors.stateCode}
              options={[none, ...Object.entries(MX_STATE_NAMES).map(([code, name]) => option(code, name))]}
            />
            {from('stateCode')}
          </div>
          <div>
            <TextField id={id('countryCode')} label={t.preview.country} hint={t.preview.countryHint} value={values.countryCode} onChange={set('countryCode')} error={errors.countryCode} maxLength={2} autoComplete="off" />
            {from('countryCode')}
          </div>
          <div>
            <SelectField
              id={id('employmentType')}
              label={t.preview.employmentType}
              value={values.employmentType}
              onChange={set('employmentType')}
              options={[none, ...EMPLOYMENT_TYPES.map((v) => option(v, t.employmentTypes[v]))]}
            />
            {from('employmentType')}
          </div>
          <div>
            <SelectField id={id('workMode')} label={t.preview.workMode} value={values.workMode} onChange={set('workMode')} options={[none, ...WORK_MODES.map((v) => option(v, t.workModes[v]))]} />
            {from('workMode')}
          </div>
          <div>
            <TextField id={id('datePosted')} label={t.preview.datePosted} type="date" value={values.datePosted} onChange={set('datePosted')} error={errors.datePosted} />
            {from('datePosted')}
          </div>
          <div>
            <TextField id={id('validThrough')} label={t.preview.validThrough} type="date" value={values.validThrough} onChange={set('validThrough')} error={errors.validThrough} />
            {from('validThrough')}
          </div>
        </div>
        <fieldset className={s.fieldset}>
          <legend>{t.preview.salaryLegend}</legend>
          <div className={s.grid}>
            <div>
              <TextField id={id('salaryMin')} label={t.preview.min} inputMode="decimal" value={values.salaryMin} onChange={set('salaryMin')} error={errors.salaryMin} autoComplete="off" />
              {from('salaryMin')}
            </div>
            <div>
              <TextField id={id('salaryMax')} label={t.preview.max} inputMode="decimal" value={values.salaryMax} onChange={set('salaryMax')} error={errors.salaryMax} autoComplete="off" />
              {from('salaryMax')}
            </div>
            <div>
              <TextField id={id('salaryCurrency')} label={t.preview.currency} hint={t.preview.currencyHint} value={values.salaryCurrency} onChange={set('salaryCurrency')} error={errors.salaryCurrency} maxLength={3} autoComplete="off" />
              {from('salaryCurrency')}
            </div>
            <div>
              <SelectField id={id('salaryPeriod')} label={t.preview.period} value={values.salaryPeriod} onChange={set('salaryPeriod')} options={[none, ...SALARY_PERIODS.map((v) => option(v, t.periods[v]))]} />
              {from('salaryPeriod')}
            </div>
          </div>
        </fieldset>
        <TextField id={id('sourceUrl')} label={t.preview.sourceUrl} type="url" value={values.sourceUrl} onChange={set('sourceUrl')} error={errors.sourceUrl} autoComplete="off" />
        <div>
          <TextAreaField id={id('sourceText')} label={t.preview.sourceText} rows={12} value={values.sourceText} onChange={set('sourceText')} error={errors.sourceText} />
          {edited.has('sourceText') ? <p className={`${s.from} ${s.fromEdited}`}>{t.preview.edited}</p> : <p className={s.from}>{t.from[draft.sourceTextFrom]}</p>}
        </div>
        <div className={s.row}>
          <Button type="submit" disabled={busy}>
            {busy ? t.preview.saving : t.preview.save}
          </Button>
          <Button variant="secondary" onClick={onDiscard} disabled={busy}>
            {t.preview.discard}
          </Button>
        </div>
      </form>
    </section>
  );
}
