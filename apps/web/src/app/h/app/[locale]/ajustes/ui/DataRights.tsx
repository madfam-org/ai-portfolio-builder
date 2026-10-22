'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/States';
import { api, apiErrorMessage } from '@/lib/client/api';
import { APP_COPY } from '@/lib/copy/app';
import { DATA_RIGHTS_COPY } from '@/lib/copy/import';
import type { Locale } from '@/lib/routing';
import s from './settings.module.css';

type Format = 'full' | 'json-resume';

/** «cv-mis-datos-2026-10-22.json» (the person's local date; the API's Content-Disposition uses the same names). */
export function downloadName(format: Format, now: Date): string {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return format === 'json-resume' ? `cv-json-resume-${day}.json` : `cv-mis-datos-${day}.json`;
}

function saveJson(doc: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * `/ajustes`, data rights (W4-I): «Descargar mis datos» (everything the person holds, as JSON), «Exportar como JSON
 * Resume» (the profile, for other tools) and «Eliminar mis datos» (every row, one transaction, behind a typed
 * confirmation). The Janua account itself is managed in Janua: this page links there and never deletes it.
 */
export function DataRights({ locale, accountUrl }: { locale: Locale; accountUrl: string | null }) {
  const copy = DATA_RIGHTS_COPY[locale];
  const appCopy = APP_COPY[locale];
  const [exporting, setExporting] = useState<Format | null>(null);
  const [exportNote, setExportNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteNote, setDeleteNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  async function download(format: Format) {
    setExporting(format);
    setExportNote(null);
    const res = await api.exportMine(format);
    setExporting(null);
    if (!res.ok) {
      setExportNote({ tone: 'danger', text: apiErrorMessage(res.error, appCopy.states) });
      return;
    }
    saveJson(res.data, downloadName(format, new Date()));
    setExportNote({ tone: 'success', text: copy.exported });
  }

  async function confirmDelete() {
    if (typed.trim() !== copy.word) {
      setMismatch(true);
      document.getElementById('confirmar-palabra')?.focus();
      return;
    }
    setDeleting(true);
    const res = await api.deleteMine();
    setDeleting(false);
    setOpen(false);
    setTyped('');
    setMismatch(false);
    if (!res.ok) {
      setDeleteNote({ tone: 'danger', text: apiErrorMessage(res.error, appCopy.states) });
      return;
    }
    setDeleteNote({ tone: 'success', text: copy.deleted(res.data.deleted) });
    document.getElementById('ajustes-eliminar')?.focus();
  }

  return (
    <div className={s.stack}>
      <p className={s.lead}>{copy.intro}</p>
      <section className={s.panel} aria-labelledby="ajustes-descargar">
        <h2 id="ajustes-descargar">{copy.exportTitle}</h2>
        <p>{copy.exportBody}</p>
        <div className={s.actions}>
          <Button onClick={() => void download('full')} disabled={exporting !== null}>
            {exporting === 'full' ? copy.preparing : copy.exportButton}
          </Button>
        </div>
        <h3>{copy.jsonResumeTitle}</h3>
        <p>{copy.jsonResumeBody}</p>
        <div className={s.actions}>
          <Button variant="secondary" onClick={() => void download('json-resume')} disabled={exporting !== null}>
            {exporting === 'json-resume' ? copy.preparing : copy.jsonResumeButton}
          </Button>
        </div>
        {exportNote ? <Notice tone={exportNote.tone}>{exportNote.text}</Notice> : null}
      </section>
      <section className={s.panel} aria-labelledby="ajustes-eliminar">
        <h2 id="ajustes-eliminar" tabIndex={-1}>
          {copy.deleteTitle}
        </h2>
        <p>{copy.deleteBody}</p>
        <ul className={s.points}>
          {copy.deletePoints.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p>
          {copy.accountNote}{' '}
          {accountUrl ? (
            <a href={accountUrl} rel="noopener noreferrer" target="_blank">
              {copy.accountLink}
            </a>
          ) : null}
        </p>
        <div className={s.actions}>
          <Button variant="danger" onClick={() => setOpen(true)} disabled={deleting}>
            {copy.deleteButton}
          </Button>
        </div>
        {deleteNote ? <Notice tone={deleteNote.tone}>{deleteNote.text}</Notice> : null}
      </section>
      <ConfirmDialog
        id="confirmar-eliminar-datos"
        open={open}
        title={copy.dialogTitle}
        confirmLabel={deleting ? copy.deleting : copy.confirm}
        cancelLabel={copy.cancel}
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          setOpen(false);
          setTyped('');
          setMismatch(false);
        }}
      >
        <p>{copy.dialogBody}</p>
        <TextField
          id="confirmar-palabra"
          label={copy.typeLabel}
          autoComplete="off"
          spellCheck={false}
          value={typed}
          error={mismatch ? copy.mismatch : null}
          onChange={(e) => {
            setTyped(e.target.value);
            setMismatch(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void confirmDelete();
            }
          }}
        />
      </ConfirmDialog>
    </div>
  );
}
