'use client';

import { useRouter } from 'next/navigation';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/States';
import { appPath } from '@/lib/app-routes';
import type { IntakeDraft, IntakeInput } from '@/lib/client/types';
import { INGEST_COPY } from '@/lib/copy/ingest';
import type { Locale } from '@/lib/routing';
import { NotDocxError, readDocxText } from './docx';
import { FILE_ACCEPT, FILE_MAX_BYTES, decodeTextFile, fileKind, htmlFileToInput } from './files';
import { BookmarkletLink } from './BookmarkletLink';
import { IntakePreview } from './IntakePreview';
import { postIntake } from './client';
import { intakeFailureMessage } from './messages';
import { ocrStatus, readWithOcr, type OcrError, type OcrLimits } from './ocr-pages';
import s from './intake.module.css';

type Method = 'link' | 'paste' | 'file';
/** A picked image or scanned PDF waiting for the person's go-ahead to be read through tlacuilo. */
interface PendingOcr {
  file: File;
  kind: 'image' | 'pdf';
  limits: OcrLimits;
}

/**
 * `/empleos/nuevo` (W5-J): four ways to bring a posting — a link (read once on the server, on this explicit action),
 * a paste, a file read in the browser (PDF text layer, DOCX, TXT, HTML) and the «Capturar vacante» bookmark for sites
 * that forbid server reads — all ending in the same preview (IntakePreview) before anything is saved.
 *
 * An image or a scanned PDF has no text to read in the browser. When reading images is on (tlacuilo configured) the
 * panel says what would be sent and waits for an explicit click; only then are the page images sent, one by one
 * (ocr-pages.ts). When it is off, the panel says «aún no leemos imágenes», as before.
 */
export function IntakePanel({ locale }: { locale: Locale }) {
  const t = INGEST_COPY[locale];
  const router = useRouter();
  const [draft, setDraft] = useState<IntakeDraft | null>(null);
  const [busy, setBusy] = useState<Method | null>(null);
  const [error, setError] = useState<{ method: Method; message: string; capture: boolean } | null>(null);
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [fileInput, setFileInput] = useState(0);
  const [pendingOcr, setPendingOcr] = useState<PendingOcr | null>(null);
  const [ocrProgress, setOcrProgress] = useState<string | null>(null);
  const [ocrNote, setOcrNote] = useState<string | null>(null);

  async function run(method: Method, body: IntakeInput) {
    setBusy(method);
    setError(null);
    const out = await postIntake(body);
    setBusy(null);
    if (out.ok) setDraft(out.draft);
    else setError({ method, message: intakeFailureMessage(locale, out), capture: out.reason === 'capture_only' || out.reason === 'blocked_by_site' || out.reason?.startsWith('robots') === true });
  }

  function ocrErrorMessage(error: OcrError): string {
    const e = t.ocr.errors;
    if (error.code === 'rate_limited') return t.rateLimited(error.retryAfter ?? 60);
    if (error.code === 'quota_exceeded') return t.quota;
    if (error.code === 'ocr_unreadable') return e.unreadable;
    if (error.code === 'page_too_large' || error.code === 'ocr_too_large' || error.code === 'body_too_large') return e.tooLarge;
    if (error.code === 'unsupported_image' || error.code === 'invalid_image') return e.unsupportedImage;
    if (error.code === 'ocr_busy' || error.code === 'ocr_timeout') return e.busy;
    if (error.code === 'network') return e.network;
    return e.unavailable;
  }

  /** An image or a scanned PDF: offer the reading when it is on, otherwise say honestly that cv cannot read it. */
  async function offerOcr(file: File, kind: 'image' | 'pdf', unavailable: string) {
    const status = await ocrStatus();
    setBusy(null);
    if (!status.enabled) return setError({ method: 'file', message: unavailable, capture: false });
    setPendingOcr({ file, kind, limits: { maxPages: status.maxPages, maxBytes: status.maxBytes } });
  }

  async function onOcrConfirm() {
    const pending = pendingOcr;
    if (!pending) return;
    setPendingOcr(null);
    setError(null);
    setOcrNote(null);
    setBusy('file');
    setOcrProgress(t.ocr.preparing);
    const out = await readWithOcr(pending.file, pending.kind, pending.limits, (done, of) => setOcrProgress(t.ocr.progress(done + 1, of)));
    setOcrProgress(null);
    if (!out.ok) {
      setBusy(null);
      return setError({ method: 'file', message: ocrErrorMessage(out.error), capture: false });
    }
    if (out.totalPages > out.pages) setOcrNote(t.ocr.partial(out.pages, out.totalPages));
    await run('file', { source: 'text', kind: pending.kind === 'pdf' ? 'pdf' : 'file', read: 'ocr', text: out.text });
  }

  function onLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (url.trim()) void run('link', { source: 'url', url: url.trim() });
  }

  function onPaste(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (text.trim()) void run('paste', { source: 'text', kind: 'paste', text });
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setFileInput((n) => n + 1);
    if (!file) return;
    const fail = (message: string) => {
      setBusy(null);
      setError({ method: 'file', message, capture: false });
    };
    setError(null);
    setPendingOcr(null);
    setOcrNote(null);
    if (file.size > FILE_MAX_BYTES) return fail(t.fileErrors.tooLarge);
    setBusy('file');
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const kind = fileKind(file.name, file.type, head);
    try {
      if (kind === 'image') return await offerOcr(file, 'image', t.fileErrors.image);
      if (kind === 'unsupported') return fail(t.fileErrors.unsupported);
      if (kind === 'html') return await run('file', htmlFileToInput(decodeTextFile(new Uint8Array(await file.arrayBuffer()))));
      if (kind === 'text') return await run('file', { source: 'text', kind: 'file', text: decodeTextFile(new Uint8Array(await file.arrayBuffer())) });
      if (kind === 'docx') return await run('file', { source: 'text', kind: 'docx', text: await readDocxText(file) });
      const { readPdfText, ScannedPdfError } = await import('./pdf');
      try {
        const { text: pdfText } = await readPdfText(file);
        return await run('file', { source: 'text', kind: 'pdf', text: pdfText });
      } catch (err) {
        if (err instanceof ScannedPdfError) return await offerOcr(file, 'pdf', t.fileErrors.scanned);
        return fail(t.fileErrors.pdfFailed);
      }
    } catch (err) {
      return fail(err instanceof NotDocxError ? t.fileErrors.unsupported : t.fileErrors.unreadable);
    }
  }

  if (draft) {
    return (
      <>
        {ocrNote ? <Notice tone="info">{ocrNote}</Notice> : null}
        <IntakePreview
          locale={locale}
          draft={draft}
          onSaved={(job) => router.push(appPath.job(locale, job.id))}
          onDiscard={() => {
            setDraft(null);
            setError(null);
            setOcrNote(null);
          }}
        />
      </>
    );
  }

  const errorFor = (m: Method) =>
    error?.method === m ? (
      <Notice tone="danger">
        {error.message}{' '}
        {error.capture ? <a href="#intake-capture">{t.capture.title}</a> : t.fallback}
      </Notice>
    ) : null;

  return (
    <div className={s.methods} role="group" aria-label={t.methodsLabel}>
      <section className={s.method} aria-labelledby="intake-link" data-testid="intake-link">
        <h2 id="intake-link">{t.link.title}</h2>
        <p className="muted small">{t.link.body}</p>
        <form className="stack" onSubmit={onLink} noValidate aria-busy={busy === 'link'}>
          <TextField id="intake-url" label={t.link.label} hint={t.link.hint} type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" maxLength={2000} />
          <div className={s.row}>
            <Button type="submit" disabled={busy !== null || !url.trim()}>
              {busy === 'link' ? t.link.reading : t.link.submit}
            </Button>
          </div>
        </form>
        {errorFor('link')}
      </section>

      <section className={s.method} aria-labelledby="intake-capture" data-testid="intake-capture">
        <h2 id="intake-capture">{t.capture.title}</h2>
        <p className="muted small">{t.capture.body}</p>
        <BookmarkletLink locale={locale} />
        <p className="muted small">{t.capture.boards}</p>
        <p className="muted small">{t.capture.privacy}</p>
      </section>

      <section className={s.method} aria-labelledby="intake-paste" data-testid="intake-paste">
        <h2 id="intake-paste">{t.paste.title}</h2>
        <p className="muted small">{t.paste.body}</p>
        <form className="stack" onSubmit={onPaste} noValidate aria-busy={busy === 'paste'}>
          <TextAreaField id="intake-text" label={t.paste.label} rows={8} value={text} onChange={(e) => setText(e.target.value)} />
          <div className={s.row}>
            <Button type="submit" disabled={busy !== null || !text.trim()}>
              {t.paste.submit}
            </Button>
          </div>
        </form>
        {errorFor('paste')}
      </section>

      <section className={s.method} aria-labelledby="intake-file" data-testid="intake-file">
        <h2 id="intake-file">{t.file.title}</h2>
        <p className="muted small">{t.file.body}</p>
        <TextField key={fileInput} id="intake-file-input" label={t.file.label} hint={t.file.hint} type="file" accept={FILE_ACCEPT} onChange={(e) => void onFile(e)} disabled={busy !== null} />
        {busy === 'file' ? (
          <p className="muted" role="status" data-testid="intake-file-status">
            {ocrProgress ?? t.file.reading}
          </p>
        ) : null}
        {pendingOcr ? (
          <div className="stack" data-testid="intake-ocr-offer">
            <Notice tone="info" title={pendingOcr.kind === 'pdf' ? t.ocr.offerScanned : t.ocr.offerImage}>
              {t.ocr.privacy}
            </Notice>
            <div className={s.row}>
              <Button type="button" onClick={() => void onOcrConfirm()} disabled={busy !== null}>
                {t.ocr.confirm}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setPendingOcr(null)} disabled={busy !== null}>
                {t.ocr.cancel}
              </Button>
            </div>
          </div>
        ) : null}
        {errorFor('file')}
      </section>

      <p>
        <ButtonLink variant="secondary" href={appPath.jobs(locale)}>
          {t.back}
        </ButtonLink>
      </p>
    </div>
  );
}
