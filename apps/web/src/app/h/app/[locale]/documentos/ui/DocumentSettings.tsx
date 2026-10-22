'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { TemplatePicker } from '@/components/render/TemplatePicker';
import { SelectField, TextField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { api, apiErrorMessage } from '@/lib/client/api';
import type { ArtifactDto, ArtifactPatchInput, ContentLocale } from '@/lib/client/types';
import { APP_COPY } from '@/lib/copy/app';
import { DOCUMENTS_COPY } from '@/lib/copy/render';
import { appPath } from '@/lib/app-routes';
import { TEMPLATE_PICKER_COPY } from '@/lib/copy/render';
import type { Locale } from '@/lib/routing';

/**
 * Title, language, template (W4-T: the registry's picker, with each template's trade-off) and status of one document. Only changed fields are sent: the API withdraws a published
 * artifact whenever a status is sent (server/db/repository.ts updateArtifact), so the status of a published document is
 * read-only here and changes through «Despublicar».
 */
export function DocumentSettings({ locale, artifact }: { locale: Locale; artifact: ArtifactDto }) {
  const a = APP_COPY[locale];
  const d = DOCUMENTS_COPY[locale];
  const toast = useToast();
  const router = useRouter();
  const [title, setTitle] = useState(artifact.title);
  const [docLocale, setDocLocale] = useState<ContentLocale>(artifact.locale);
  const [template, setTemplate] = useState(artifact.template);
  const [status, setStatus] = useState(artifact.status);
  const [busy, setBusy] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const published = artifact.status === 'published';

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setTitleError(a.states.invalid);
      return;
    }
    const patch: ArtifactPatchInput = {};
    if (title !== artifact.title) patch.title = title;
    if (docLocale !== artifact.locale) patch.locale = docLocale;
    if (template !== artifact.template) patch.template = template;
    if (!published && status !== artifact.status && status !== 'published') patch.status = status;
    if (Object.keys(patch).length === 0) {
      toast(a.states.saved);
      return;
    }
    setBusy(true);
    const res = await api.updateArtifact(artifact.id, patch);
    setBusy(false);
    if (!res.ok) {
      const titleIssue = res.error.issues?.find((i) => i.path === 'title');
      setTitleError(titleIssue ? a.states.invalid : null);
      toast(apiErrorMessage(res.error, a.states), 'danger');
      return;
    }
    setTitleError(null);
    toast(a.states.saved);
    router.refresh();
  }

  return (
    <form className="stack" onSubmit={save} noValidate aria-labelledby="doc-settings">
      <h2 id="doc-settings">{d.settingsTitle}</h2>
      <TextField id="doc-title" label={a.titleLabel} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required error={titleError} />
      <SelectField
        id="doc-locale"
        label={d.localeLabel}
        value={docLocale}
        onChange={(e) => setDocLocale(e.target.value as ContentLocale)}
        options={(['es-MX', 'en'] as const).map((l) => ({ value: l, label: d.locales[l] }))}
      />
      <TemplatePicker
        id="doc-template"
        kind={artifact.kind}
        locale={locale}
        legend={d.templateLabel}
        hint={published ? `${d.templateHint} ${TEMPLATE_PICKER_COPY[locale].publishedNote}` : d.templateHint}
        value={template}
        current={artifact.template}
        onChange={setTemplate}
      />
      <p className="small">
        <a href={appPath.artifactPreview(locale, artifact.id)}>{TEMPLATE_PICKER_COPY[locale].seePreview}</a>
      </p>
      <SelectField
        id="doc-status"
        label={d.statusLabel}
        hint={published ? d.statusPublishedHint : undefined}
        value={status}
        disabled={published}
        onChange={(e) => setStatus(e.target.value as ArtifactDto['status'])}
        options={(published ? (['published'] as const) : (['draft', 'ready'] as const)).map((s) => ({ value: s, label: a.statuses[s] }))}
      />
      <Button type="submit" disabled={busy}>
        {d.save}
      </Button>
    </form>
  );
}
