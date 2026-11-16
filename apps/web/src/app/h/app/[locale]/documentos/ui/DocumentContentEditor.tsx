'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { SelectionEditor, type ItemProblems } from '@/components/jobs/SelectionEditor';
import { contentFromDraft, draftChanged, draftFromContent, type DocumentDraft, type DocumentEditProblem } from '@/components/jobs/document-edit';
import { LIMITS, letterDefaults } from '@/components/jobs/tailoring';
import { Button } from '@/components/ui/Button';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { api, apiErrorMessage } from '@/lib/client/api';
import type { ArtifactDto, ContentLocale, ItemDto } from '@/lib/client/types';
import { APP_COPY } from '@/lib/copy/app';
import { fmt, JOBS_COPY } from '@/lib/copy/jobs';
import { DOCUMENTS_COPY } from '@/lib/copy/render';
import { localizeHeader } from '@/lib/profile-text';
import type { Locale } from '@/lib/routing';

interface Loaded {
  items: ItemDto[];
  primary: ContentLocale;
  scores: Map<string, number>;
  profileSummary: string;
}

/**
 * «Contenido» of one document, editable in place (critique #7): which profile items, in which order, with which text
 * for this document only; its summary; a cover letter's greeting and closing. The same editor as «Adaptar al empleo»
 * (SelectionEditor), with the job's keyword match when the document belongs to a job. Saves ONE `PATCH` of the content
 * (components/jobs/document-edit.ts keeps every part it does not show); the profile is never written.
 */
export function DocumentContentEditor({ locale, artifact, job }: { locale: Locale; artifact: ArtifactDto; job: { id: string; title: string; company: string } | null }) {
  const a = APP_COPY[locale];
  const d = DOCUMENTS_COPY[locale];
  const t = JOBS_COPY[locale];
  const toast = useToast();
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DocumentDraft>(() => draftFromContent(artifact.content));
  const [problems, setProblems] = useState<DocumentEditProblem[]>([]);
  const [busy, setBusy] = useState(false);
  const jobId = job?.id ?? null;

  useEffect(() => {
    let live = true;
    void (async () => {
      const [profile, match] = await Promise.all([api.getProfile(), jobId ? api.match(jobId) : Promise.resolve(null)]);
      if (!live) return;
      if (!profile.ok) {
        setLoadError(apiErrorMessage(profile.error, a.states));
        return;
      }
      const p = profile.data.profile;
      const primary: ContentLocale = p?.locale ?? (locale === 'en' ? 'en' : 'es-MX');
      setLoaded({
        items: profile.data.items,
        primary,
        scores: new Map(match && match.ok ? match.data.items.map((m) => [m.itemId, m.score]) : []),
        profileSummary: p ? localizeHeader({ headline: p.headline, summary: p.summary }, p.translations, primary, artifact.locale).header.summary : '',
      });
    })();
    return () => {
      live = false;
    };
  }, [jobId, locale, artifact.locale, a.states]);

  const changed = draftChanged(artifact.content, draft);
  const letter = artifact.kind === 'cover_letter';
  const defaults = letterDefaults(job?.company ?? '', artifact.locale);

  const formProblem = (field: 'items' | 'summary' | 'greeting' | 'closing'): string | null => {
    const p = problems.find((x) => x.scope === 'form' && x.field === field);
    if (!p) return null;
    if (field === 'items') return fmt(t.tailor.problems.itemsTooMany, { max: LIMITS.items });
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

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const built = contentFromDraft(artifact.kind, artifact.content, draft, { company: job?.company ?? '', locale: artifact.locale });
    if (!built.ok) {
      setProblems(built.problems);
      const first = built.problems[0]!;
      const target = first.scope === 'item' ? `ov-${first.itemId}-${first.field}` : first.field === 'items' ? 'tailor-items-error' : `doc-${first.field}`;
      requestAnimationFrame(() => document.getElementById(target)?.focus());
      return;
    }
    setProblems([]);
    setBusy(true);
    const res = await api.updateArtifact(artifact.id, { content: built.content });
    setBusy(false);
    if (!res.ok) {
      toast(apiErrorMessage(res.error, a.states), 'danger');
      return;
    }
    setDraft(draftFromContent(res.data.artifact.content));
    toast(d.contentSaved);
    router.refresh();
  }

  return (
    <section aria-labelledby="doc-content" data-testid="doc-content-editor">
      <h2 id="doc-content">{d.contentTitle}</h2>
      <p className="muted">{d.contentEditIntro}</p>
      {/* A standing note, not a live region: only the save result is announced. */}
      {artifact.status === 'published' ? (
        <p className="small" data-testid="doc-content-published">
          {d.contentPublishedNote}
        </p>
      ) : null}
      {artifact.kind === 'presentation' ? <p className="small muted">{d.contentSlidesNote}</p> : null}
      {loadError ? (
        <ErrorState message={loadError} />
      ) : !loaded ? (
        <p className="muted" role="status">
          {a.loading}
        </p>
      ) : (
        <form className="stack" onSubmit={save} noValidate>
          <SelectionEditor
            locale={locale}
            primary={loaded.primary}
            docLocale={artifact.locale}
            items={loaded.items}
            scores={loaded.scores}
            selection={draft.selection}
            onChange={(selection) => setDraft((x) => ({ ...x, selection }))}
            itemsError={formProblem('items')}
            itemProblems={itemProblems}
            intro={d.contentSelectionIntro}
            heading={d.contentSelected}
          />
          <TextAreaField
            id="doc-summary"
            label={d.contentSummaryLabel}
            hint={d.contentSummaryHint}
            rows={4}
            value={draft.summary}
            placeholder={loaded.profileSummary}
            onChange={(e) => setDraft((x) => ({ ...x, summary: e.target.value }))}
            error={formProblem('summary')}
          />
          {letter ? (
            <fieldset className="stack" data-testid="doc-letter">
              <legend>{t.tailor.letterLegend}</legend>
              <p className="small muted">{d.contentLetterHint}</p>
              <TextField
                id="doc-greeting"
                label={t.tailor.greeting}
                value={draft.greeting}
                placeholder={defaults.greeting}
                onChange={(e) => setDraft((x) => ({ ...x, greeting: e.target.value }))}
                error={formProblem('greeting')}
              />
              <TextAreaField
                id="doc-closing"
                label={t.tailor.closing}
                rows={2}
                value={draft.closing}
                placeholder={defaults.closing}
                onChange={(e) => setDraft((x) => ({ ...x, closing: e.target.value }))}
                error={formProblem('closing')}
              />
            </fieldset>
          ) : null}
          <p className="small muted" role="status" data-testid="doc-content-state">
            {changed ? d.contentUnsaved : d.contentClean}
          </p>
          <div className="actions">
            <Button type="submit" disabled={busy || !changed}>
              {busy ? d.contentSaving : d.contentSave}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy || !changed}
              onClick={() => {
                setDraft(draftFromContent(artifact.content));
                setProblems([]);
              }}
            >
              {d.contentDiscard}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
