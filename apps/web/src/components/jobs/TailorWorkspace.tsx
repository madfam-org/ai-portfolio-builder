'use client';

import { useEffect, useRef, useState } from 'react';
import { TemplatePicker } from '@/components/render/TemplatePicker';
import { Button } from '@/components/ui/Button';
import { CheckboxField, TextAreaField, TextField } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/Layout';
import { ErrorState, Notice } from '@/components/ui/States';
import { appPath } from '@/lib/app-routes';
import { api, apiErrorMessage } from '@/lib/client/api';
import type { ArtifactDto, ArtifactKind, ContentLocale } from '@/lib/client/types';
import { APP_COPY } from '@/lib/copy/app';
import { fmt, JOBS_COPY } from '@/lib/copy/jobs';
import { TEMPLATE_PICKER_COPY } from '@/lib/copy/render';
import { TAILOR_LANGUAGE_COPY } from '@/lib/copy/tailor-language';
import type { Locale } from '@/lib/routing';
import { JobDocuments } from './JobDocuments';
import { SelectionEditor, type ItemProblems } from './SelectionEditor';
import { MissingTranslations } from '@/components/render/MissingTranslations';
import { BILINGUAL_COPY } from '@/lib/copy/bilingual';
import { localizeHeader } from '@/lib/profile-text';
import {
  DEFAULT_KINDS,
  LIMITS,
  TAILOR_KINDS,
  TEMPLATES,
  artifactTitle,
  buildArtifactSet,
  initialSelection,
  languagesOf,
  restoreLanguage,
  stashLanguage,
  tailorMissing,
  type LanguageTexts,
  type SelectionEntry,
  type TailorProblem,
} from './tailoring';
import { useJobBundle } from './useJobBundle';
import s from './jobs.module.css';

type FormField = 'kinds' | 'items' | 'summary' | 'greeting' | 'closing';

/**
 * `/empleos/:id/adaptar`: choose which profile items go into this job's documents (pre-selected by the keyword
 * match), reorder them, override their text for this job only, choose the kinds, template and language, and create
 * every chosen draft in ONE call (`POST /api/v1/artifacts/batch`: all or none). The created drafts and the earlier
 * versions link to /documentos (W3-4 renders them). No AI: a labelled «próximamente» seam only.
 */
export function TailorWorkspace({ locale, jobId }: { locale: Locale; jobId: string }) {
  const a = APP_COPY[locale];
  const t = JOBS_COPY[locale];
  const lt = TAILOR_LANGUAGE_COPY[locale];
  const { bundle, reload } = useJobBundle(jobId);
  const [selectionDraft, setSelection] = useState<SelectionEntry[] | null>(null);
  const [kinds, setKinds] = useState<ArtifactKind[]>([...DEFAULT_KINDS]);
  const template: string = TEMPLATES[0];
  // W4-T: one template per kind (registry ids), `base` until the person picks another.
  const [kindTemplates, setKindTemplates] = useState<Partial<Record<ArtifactKind, string>>>({});
  const [contentLocale, setContentLocale] = useState<ContentLocale | null>(null);
  const [switched, setSwitched] = useState<ContentLocale | null>(null);
  const [summary, setSummary] = useState('');
  const [showContact, setShowContact] = useState(false);
  const [greeting, setGreeting] = useState('');
  const [closing, setClosing] = useState('');
  const [problems, setProblems] = useState<TailorProblem[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<ArtifactDto[] | null>(null);
  /** W7 (B4): the per-job texts typed for the language that is NOT shown now (tailoring.ts stashLanguage). */
  const [stashed, setStashed] = useState<Partial<Record<ContentLocale, LanguageTexts>>>({});
  const resultRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (created) resultRef.current?.focus();
  }, [created]);

  if (bundle.state === 'loading') {
    return (
      <p className="muted" role="status">
        {t.loading}
      </p>
    );
  }
  if (bundle.state === 'error') {
    return (
      <>
        <ErrorState message={bundle.error.kind === 'not_found' ? t.detail.notFound : apiErrorMessage(bundle.error, a.states)} />
        <p>
          <a href={appPath.jobs(locale)}>{t.detail.back}</a>
        </p>
      </>
    );
  }

  const { job, profile, items, match, artifacts } = bundle.data;
  const scores = new Map(match.items.map((m) => [m.itemId, m.score]));
  // Until the person changes it, the selection IS the match's pre-selection (computed, not copied into state).
  const selection = selectionDraft ?? initialSelection(match, new Set(items.map((i) => i.id)));
  const profileLocale: ContentLocale = profile?.locale ?? (locale === 'en' ? 'en' : 'es-MX');
  const docLocale: ContentLocale = contentLocale ?? profileLocale;
  // W7 (B3): a version in a language other than the profile's says so in its title, so the two read apart.
  const languageTag = docLocale !== profileLocale ? lt.titleTag[docLocale] : undefined;
  const otherLocale: ContentLocale = docLocale === 'en' ? 'es-MX' : 'en';
  const existingLanguages = languagesOf(artifacts);
  const chosenKinds = TAILOR_KINDS.filter((k) => kinds.includes(k));

  const formProblem = (field: FormField): string | null => {
    const p = problems.find((x) => x.scope === 'form' && x.field === field);
    if (!p) return null;
    if (field === 'kinds') return t.tailor.problems.kindsRequired;
    if (field === 'items') return p.code === 'tooMany' ? fmt(t.tailor.problems.itemsTooMany, { max: LIMITS.items }) : t.tailor.problems.itemsRequired;
    return fmt(t.tailor.problems.tooLong, { max: LIMITS[field] });
  };
  const itemProblems: ItemProblems = {};
  for (const p of problems) {
    if (p.scope !== 'item') continue;
    const max = p.field === 'title' ? LIMITS.overrideTitle : LIMITS.overrideSummary;
    const message =
      p.field === 'highlights' ? fmt(t.tailor.problems.tooManyHighlights, { max: LIMITS.highlightCount, length: LIMITS.highlightLength }) : fmt(t.tailor.problems.tooLong, { max });
    itemProblems[p.itemId] = { ...itemProblems[p.itemId], [p.field]: message };
  }

  const toggleKind = (kind: ArtifactKind, on: boolean) => setKinds((all) => (on ? [...new Set([...all, kind])] : all.filter((k) => k !== kind)));

  /** W7 (B4): overrides, summary, greeting and closing are per language; the selection and its order are shared. */
  function changeLanguage(to: ContentLocale) {
    if (to === docLocale) return;
    setStashed((all) => ({ ...all, [docLocale]: stashLanguage(selection, { summary, greeting, closing }) }));
    const back = restoreLanguage(selection, stashed[to]);
    setSelection(back.selection);
    setSummary(back.summary);
    setGreeting(back.greeting);
    setClosing(back.closing);
    setContentLocale(to);
  }

  function switchLanguage(to: ContentLocale) {
    changeLanguage(to);
    setSwitched(to);
    setCreated(null);
    requestAnimationFrame(() => document.getElementById(`tailor-language-${to}`)?.focus());
  }

  async function create() {
    setServerError(null);
    setSwitched(null);
    setCreated(null);
    const built = buildArtifactSet({
      jobId,
      jobTitle: job.title,
      company: job.company,
      kinds: chosenKinds,
      template,
      templates: kindTemplates,
      locale: docLocale,
      selection,
      summary,
      showContact,
      greeting,
      closing,
      kindLabels: a.kinds,
      languageTag,
    });
    if (!built.ok) {
      setProblems(built.problems);
      const first = built.problems[0]!;
      const target =
        first.scope === 'item' ? `ov-${first.itemId}-${first.field}` : first.field === 'kinds' ? `tailor-kind-${TAILOR_KINDS[0]}` : first.field === 'items' ? 'tailor-items-error' : `tailor-${first.field}`;
      requestAnimationFrame(() => document.getElementById(target)?.focus());
      return;
    }
    setProblems([]);
    setBusy(true);
    const res = await api.createArtifactSet(built.body);
    setBusy(false);
    if (!res.ok) {
      const e = res.error;
      setServerError(e.code === 'unknown_item_ids' ? t.tailor.foreignItems : e.kind === 'not_found' ? t.detail.notFound : apiErrorMessage(e, a.states));
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    setCreated(res.data.artifacts);
    await reload();
  }

  return (
    <>
      <p>
        <a href={appPath.job(locale, job.id)}>{job.title}</a>
      </p>
      <PageHeader title={a.routes.jobTailor} description={[job.title, job.company].filter(Boolean).join(' · ')} />
      <p className="lead">{t.tailor.intro}</p>

      <section className={s.section} aria-labelledby="tailor-items">
        <h2 id="tailor-items">{t.matchLabel}</h2>
        {items.length === 0 ? (
          <Notice title={t.match.noItems}>
            <a href={appPath.profile(locale)}>{t.match.noItemsAction}</a>
          </Notice>
        ) : (
          <SelectionEditor
            locale={locale}
            primary={profileLocale}
            docLocale={docLocale}
            items={items}
            scores={scores}
            selection={selection}
            onChange={setSelection}
            itemsError={formProblem('items')}
            itemProblems={itemProblems}
          />
        )}
      </section>

      <section className={s.section} aria-labelledby="tailor-options">
        <h2 id="tailor-options">{t.tailor.options}</h2>
        <fieldset className={s.fieldset} aria-describedby={formProblem('kinds') ? 'tailor-kinds-error' : undefined}>
          <legend>{t.tailor.kindsLegend}</legend>
          {TAILOR_KINDS.map((k) => (
            <CheckboxField key={k} id={`tailor-kind-${k}`} label={a.kinds[k]} checked={kinds.includes(k)} onChange={(e) => toggleKind(k, e.target.checked)} />
          ))}
          {formProblem('kinds') ? (
            <p className={s.fieldError} id="tailor-kinds-error" role="alert">
              {formProblem('kinds')}
            </p>
          ) : null}
        </fieldset>
        {chosenKinds.map((k) => (
          <TemplatePicker
            key={k}
            id={`tailor-template-${k}`}
            kind={k}
            locale={locale}
            legend={TEMPLATE_PICKER_COPY[locale].legendFor(a.kinds[k])}
            value={kindTemplates[k] ?? template}
            onChange={(v) => setKindTemplates((all) => ({ ...all, [k]: v }))}
          />
        ))}
        <fieldset className={s.fieldset} aria-describedby="tailor-language-hint" data-testid="tailor-language">
          <legend>{lt.legend}</legend>
          <p className="small muted" id="tailor-language-hint">
            {lt.hint}
          </p>
          {(['es-MX', 'en'] as const).map((v) => (
            <div key={v}>
              <input id={`tailor-language-${v}`} type="radio" name="tailor-language" value={v} checked={docLocale === v} onChange={() => changeLanguage(v)} />{' '}
              <label htmlFor={`tailor-language-${v}`}>{lt.options[v]}</label>
            </div>
          ))}
          {switched ? (
            <p className="small" role="status">
              {lt.switched[switched]}
            </p>
          ) : null}
          {docLocale !== profileLocale ? <p className="small muted">{BILINGUAL_COPY[locale].overridesPerLanguage(BILINGUAL_COPY[locale].inLanguage[docLocale])}</p> : null}
          <div className="small muted" data-testid="tailor-languages-existing">
            {existingLanguages.length === 0 ? (
              lt.none
            ) : (
              <>
                {lt.existing}
                <ul>
                  {existingLanguages.map((g) => (
                    <li key={g.locale}>{lt.existingLine(lt.options[g.locale], g.kinds.map((k) => a.kinds[k]).join(', '))}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </fieldset>
        <TextAreaField
          id="tailor-summary"
          label={t.tailor.summary}
          hint={t.tailor.summaryHint}
          rows={4}
          value={summary}
          placeholder={profile ? localizeHeader({ headline: profile.headline, summary: profile.summary }, profile.translations, profileLocale, docLocale).header.summary : ''}
          onChange={(e) => setSummary(e.target.value)}
          error={formProblem('summary')}
        />
        <CheckboxField id="tailor-contact" label={t.tailor.showContact} hint={t.tailor.showContactHint} checked={showContact} onChange={(e) => setShowContact(e.target.checked)} />
        {kinds.includes('cover_letter') ? (
          <>
            <TextField id="tailor-greeting" label={t.tailor.greeting} value={greeting} onChange={(e) => setGreeting(e.target.value)} error={formProblem('greeting')} />
            <TextAreaField id="tailor-closing" label={t.tailor.closing} rows={2} value={closing} onChange={(e) => setClosing(e.target.value)} error={formProblem('closing')} />
          </>
        ) : null}
        <MissingTranslations
          locale={locale}
          missing={tailorMissing({ profile, items, selection, locale: docLocale, summary, showContact })}
          target={docLocale}
          primary={profileLocale}
          id="tailor-translations"
          heading="h3"
        />
        {chosenKinds.length > 0 ? (
          <div>
            <p className="small muted">{t.tailor.willCreate}</p>
            <ul data-testid="tailor-will-create">
              {chosenKinds.map((k) => (
                <li key={k}>{artifactTitle(a.kinds[k], job.title, job.company, languageTag)}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className={s.actions}>
          <Button onClick={() => void create()} disabled={busy || items.length === 0} aria-describedby={serverError ? 'tailor-server-error' : undefined}>
            {busy ? t.tailor.creating : t.tailor.create}
          </Button>
        </div>
        {serverError ? (
          <div ref={errorRef} tabIndex={-1} id="tailor-server-error" className={s.result}>
            <ErrorState message={serverError} />
          </div>
        ) : null}
        {created ? (
          <div ref={resultRef} tabIndex={-1} className={s.result} data-testid="tailor-created">
            <Notice tone="success" title={fmt(t.tailor.created, { n: created.length })}>
              {t.tailor.createdNext}
            </Notice>
            <ul>
              {created.map((art) => (
                <li key={art.id}>
                  <a href={appPath.artifact(locale, art.id)}>{t.openKind[art.kind]}</a> <span className="small muted">({art.title})</span>
                </li>
              ))}
            </ul>
            <Button variant="secondary" onClick={() => switchLanguage(otherLocale)}>
              {lt.alsoCreate[otherLocale]}
            </Button>
          </div>
        ) : null}
      </section>

      <JobDocuments locale={locale} artifacts={artifacts} headingId="tailor-docs" />

      <aside className={s.seam} aria-labelledby="tailor-ai">
        <h2 id="tailor-ai">{t.tailor.aiHeading}</h2>
        <p>{t.tailor.aiBody}</p>
      </aside>
    </>
  );
}
