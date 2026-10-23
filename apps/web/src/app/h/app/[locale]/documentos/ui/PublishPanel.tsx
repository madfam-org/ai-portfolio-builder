'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { CheckboxField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { isAllowedSlug } from '@/lib/api-routes';
import { api, apiErrorMessage, type ApiError } from '@/lib/client/api';
import type { ArtifactDto } from '@/lib/client/types';
import { APP_COPY } from '@/lib/copy/app';
import { DISCRETION_COPY } from '@/lib/copy/discretion';
import { DOCUMENTS_COPY, type Visibility } from '@/lib/copy/render';
import type { Locale } from '@/lib/routing';
import css from './documents.module.css';

/** The address a shared document lives at on the pages host (null while that host is not configured). */
export function shareUrl(pagesHost: string | null, a: Pick<ArtifactDto, 'visibility' | 'shareToken' | 'slug'>): string | null {
  if (!pagesHost) return null;
  if (a.visibility === 'link' && a.shareToken) return `https://${pagesHost}/l/${a.shareToken}`;
  if (a.visibility === 'public' && a.slug) return `https://${pagesHost}/${a.slug}`;
  return null;
}

/**
 * «Compartir»: private, by link (anyone with it; never indexed) or public at a chosen address, with the explicit
 * «permitir que buscadores indexen esta página» box (off by default; the API's `indexable`). Copy, change (rotate) the
 * link, unpublish. The limit (20 different documents per 24 hours) is stated up front and its 429 explained; a
 * suspended document shows why it cannot be shared and every control is off.
 */
export function PublishPanel({ locale, artifact, pagesHost }: { locale: Locale; artifact: ArtifactDto; pagesHost: string | null }) {
  const a = APP_COPY[locale];
  const d = DOCUMENTS_COPY[locale];
  const toast = useToast();
  const router = useRouter();
  const [current, setCurrent] = useState(artifact);
  const [choice, setChoice] = useState<Visibility>(artifact.visibility);
  const [slug, setSlug] = useState(artifact.slug ?? '');
  const [indexable, setIndexable] = useState(artifact.indexable);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<'rotate' | 'unpublish' | null>(null);

  const suspended = current.suspendedAt !== null;
  const offline = pagesHost === null;
  const url = shareUrl(pagesHost, current);
  const unchanged =
    choice === current.visibility && (choice !== 'public' || (slug === (current.slug ?? '') && indexable === current.indexable));

  function failed(error: ApiError) {
    if (error.code === 'slug_taken') return setSlugError(d.slugTaken);
    if (error.kind === 'invalid') return setSlugError(d.slugInvalid);
    if (error.code === 'suspended') return setProblem(d.suspendedConflict);
    if (error.code === 'publish_limit' || error.kind === 'rate_limited') return setProblem(d.limitReached);
    setProblem(apiErrorMessage(error, a.states));
  }

  function done(next: ArtifactDto, message: string) {
    setCurrent(next);
    setChoice(next.visibility);
    setSlug(next.slug ?? '');
    setIndexable(next.indexable);
    setSlugError(null);
    setProblem(null);
    toast(message);
    router.refresh();
  }

  async function publish(target: { visibility: 'link' } | { visibility: 'public'; slug: string; indexable: boolean }) {
    setBusy(true);
    const res = await api.publishArtifact(current.id, target);
    setBusy(false);
    if (res.ok) done(res.data.artifact, d.published);
    else failed(res.error);
  }

  async function unpublish() {
    setDialog(null);
    setBusy(true);
    const res = await api.unpublishArtifact(current.id);
    setBusy(false);
    if (res.ok) done(res.data.artifact, d.unpublished);
    else failed(res.error);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem(null);
    if (choice === 'private') {
      if (current.visibility !== 'private') setDialog('unpublish');
      return;
    }
    if (choice === 'link') {
      if (current.visibility !== 'link') await publish({ visibility: 'link' });
      return;
    }
    if (!isAllowedSlug(slug)) {
      setSlugError(d.slugInvalid);
      return;
    }
    setSlugError(null);
    await publish({ visibility: 'public', slug, indexable });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast(d.copied);
    } catch {
      toast(d.copyFailed, 'danger');
    }
  }

  const choices: { value: Visibility; label: string; hint: string }[] = [
    { value: 'private', label: d.choicePrivate, hint: d.choicePrivateHint },
    { value: 'link', label: d.choiceLink, hint: d.choiceLinkHint },
    { value: 'public', label: d.choicePublic, hint: pagesHost ? `${d.choicePublicHint} (${pagesHost}/…)` : d.choicePublicHint },
  ];
  const locked = suspended || busy;
  // W7 (B3): before a document becomes link-shared or public (or moves from one to the other), say who will see it.
  const discretion = DISCRETION_COPY[locale];
  const remind = !suspended && (choice === 'link' || choice === 'public') && choice !== current.visibility;

  return (
    <section className={css.panel} aria-labelledby="publish-title">
      <h2 id="publish-title">{d.publishTitle}</h2>
      <p className="muted">{d.publishIntro}</p>
      {suspended ? (
        <Notice tone="danger" title={d.suspendedTitle}>
          {d.suspendedBody}
          {current.suspendedReason ? ` ${d.suspendedReason}: ${current.suspendedReason}` : ''}
        </Notice>
      ) : null}
      {offline && !suspended ? <Notice tone="warning">{d.publishOffline}</Notice> : null}
      {url && !suspended ? (
        <div className={css.share}>
          <TextField id="share-url" label={d.shareUrl} value={url} readOnly onFocus={(e) => e.target.select()} />
          <div className={css.toolbar}>
            <Button variant="secondary" size="small" onClick={() => void copy()}>
              {d.copy}
            </Button>
            <ButtonLink variant="ghost" size="small" href={url} target="_blank" rel="noopener noreferrer">
              {d.open}
            </ButtonLink>
            {current.visibility === 'link' ? (
              <Button variant="secondary" size="small" disabled={locked} onClick={() => setDialog('rotate')}>
                {d.rotate}
              </Button>
            ) : null}
            <Button variant="danger" size="small" disabled={locked} onClick={() => setDialog('unpublish')}>
              {d.unpublish}
            </Button>
          </div>
        </div>
      ) : null}
      <form onSubmit={(e) => void submit(e)} noValidate>
        <fieldset className={css.choices} disabled={locked || (offline && current.visibility === 'private')}>
          <legend>{d.whoLabel}</legend>
          {choices.map((c) => (
            <div key={c.value} className={css.choice}>
              <input id={`visibility-${c.value}`} type="radio" name="visibility" value={c.value} checked={choice === c.value} onChange={() => setChoice(c.value)} aria-describedby={`visibility-${c.value}-hint`} />
              <label htmlFor={`visibility-${c.value}`}>{c.label}</label>
              <p className={css.choiceHint} id={`visibility-${c.value}-hint`}>
                {c.hint}
              </p>
            </div>
          ))}
        </fieldset>
        {choice === 'public' ? (
          <div className="stack">
            <TextField
              id="publish-slug"
              label={d.slugLabel}
              hint={d.slugHint}
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              error={slugError}
              disabled={locked || offline}
              autoComplete="off"
              spellCheck={false}
              maxLength={64}
            />
            <CheckboxField id="publish-indexable" label={d.indexLabel} hint={d.indexHint} checked={indexable} onChange={(e) => setIndexable(e.target.checked)} disabled={locked || offline} />
          </div>
        ) : null}
        {remind ? (
          <div data-testid="discretion-reminder">
            <Notice tone="warning" title={discretion.title}>
              {choice === 'link' ? discretion.link : discretion.public}
              <br />
              {discretion.titleNote(current.title)}
            </Notice>
          </div>
        ) : null}
        {problem ? (
          <Notice tone="danger">{problem}</Notice>
        ) : null}
        <p className="muted small">{d.limitHint}</p>
        <Button type="submit" disabled={locked || unchanged || (offline && choice !== 'private')}>
          {choice === 'private' && current.visibility !== 'private' ? d.unpublish : current.visibility === 'private' ? d.publish : d.update}
        </Button>
      </form>
      <ConfirmDialog id="rotate-dialog" open={dialog === 'rotate'} title={d.rotateTitle} confirmLabel={d.rotate} cancelLabel={d.cancel} onConfirm={() => { setDialog(null); void publish({ visibility: 'link' }); }} onCancel={() => setDialog(null)}>
        <p>{d.rotateBody}</p>
      </ConfirmDialog>
      <ConfirmDialog id="unpublish-dialog" open={dialog === 'unpublish'} danger title={d.unpublishTitle} confirmLabel={d.unpublish} cancelLabel={d.cancel} onConfirm={() => void unpublish()} onCancel={() => setDialog(null)}>
        <p>{d.unpublishBody}</p>
      </ConfirmDialog>
    </section>
  );
}
