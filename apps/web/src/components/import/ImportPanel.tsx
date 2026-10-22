'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ITEM_KIND_ORDER, itemHeading, itemPeriod } from '@/components/profile/fields';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { api, apiErrorMessage } from '@/lib/client/api';
import type { ItemBatchInput, ItemDto, ProfileDto } from '@/lib/client/types';
import { APP_COPY } from '@/lib/copy/app';
import { IMPORT_COPY } from '@/lib/copy/import';
import { PROFILE_COPY } from '@/lib/copy/profile';
import type { Locale } from '@/lib/routing';
import { parseJsonResume, NotJsonResumeError, JSON_RESUME_MAX_BYTES } from './json-resume';
import { LINKEDIN_FILE_NAMES, NotLinkedInError, readLinkedInZip } from './linkedin';
import { IMPORT_MAX_BODY_BYTES, IMPORT_MAX_ITEMS, findDuplicates, type ImportResult } from './model';
import { headerChoices, headerPatch, type HeaderKey } from './header';
import { ZipError } from './zip';
import s from './import.module.css';

type State =
  | { step: 'idle' }
  | { step: 'reading' }
  | { step: 'preview'; result: ImportResult; checked: Set<string>; header: Set<HeaderKey>; duplicates: Set<string> }
  | { step: 'saving'; result: ImportResult; checked: Set<string>; header: Set<HeaderKey>; duplicates: Set<string> };

/**
 * «Importar tus datos» on `/perfil`: the person picks their OWN LinkedIn export ZIP or a JSON Resume file; it is read
 * in the browser (linkedin.ts / json-resume.ts: only the mapped files of the ZIP are ever opened), shown as a grouped
 * preview with a checkbox per item (all checked, except those already in the profile: «ya existe»), and sent only on
 * «Importar N elementos», as ONE all-or-none call (`POST /api/v1/profile/items/batch`). «Descartar» sends nothing.
 */
export function ImportPanel({
  locale,
  profile,
  existing,
  onImported,
}: {
  locale: Locale;
  profile: ProfileDto | null;
  existing: readonly Pick<ItemDto, 'kind' | 'content'>[];
  onImported: (profile: ProfileDto, items: ItemDto[], headerChanged: boolean) => void;
}) {
  const copy = IMPORT_COPY[locale];
  const appCopy = APP_COPY[locale];
  const levels = PROFILE_COPY[locale].options;
  const present = PROFILE_COPY[locale].actions.present;
  const toast = useToast();
  const [state, setState] = useState<State>({ step: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  /** Bumped to clear the file inputs (remount). */
  const [inputs, setInputs] = useState(0);

  const previewing = state.step === 'preview';
  useEffect(() => {
    if (previewing) previewHeading.current?.focus();
  }, [previewing]);

  const reset = () => setInputs((n) => n + 1);

  function show(result: ImportResult) {
    if (result.items.length === 0 && headerChoices(result.header, profile).length === 0) {
      setError(copy.errors.nothing);
      setState({ step: 'idle' });
      return;
    }
    const duplicates = findDuplicates(result.items, existing);
    const checked = new Set(result.items.filter((i) => !duplicates.has(i.key)).map((i) => i.key));
    const header = new Set(headerChoices(result.header, profile).filter((c) => c.preselected).map((c) => c.key));
    setState({ step: 'preview', result, checked, header, duplicates });
  }

  async function onZip(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setDone(null);
    setState({ step: 'reading' });
    try {
      show(await readLinkedInZip(file));
    } catch (err) {
      setState({ step: 'idle' });
      reset();
      if (err instanceof NotLinkedInError) setError(copy.errors.notLinkedIn);
      else if (err instanceof ZipError) {
        const map = { too_large: copy.errors.tooLarge, not_zip: copy.errors.notZip, too_many_entries: copy.errors.tooManyEntries, unsupported: copy.errors.unsupported, entry_too_large: copy.errors.entryTooLarge, corrupt: copy.errors.corrupt };
        setError(map[err.code]);
      } else setError(copy.errors.corrupt);
    }
  }

  async function onJson(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setDone(null);
    if (file.size > JSON_RESUME_MAX_BYTES) {
      reset();
      setError(copy.errors.notJsonResume);
      return;
    }
    setState({ step: 'reading' });
    try {
      show(parseJsonResume(await file.text()));
    } catch (err) {
      setState({ step: 'idle' });
      reset();
      setError(err instanceof NotJsonResumeError ? copy.errors.notJsonResume : copy.errors.corrupt);
    }
  }

  function discard() {
    setState({ step: 'idle' });
    setError(null);
    reset();
    setDone(copy.preview.discarded);
  }

  async function confirm() {
    if (state.step !== 'preview') return;
    const items = state.result.items.filter((i) => state.checked.has(i.key));
    const patch = headerPatch(state.result.header, state.header);
    if (items.length === 0 && !patch) {
      setError(copy.errors.nothingChecked);
      return;
    }
    if (items.length > IMPORT_MAX_ITEMS) {
      setError(copy.errors.tooManyItems(IMPORT_MAX_ITEMS));
      return;
    }
    const body: ItemBatchInput = { items: items.map((i) => ({ kind: i.kind, content: i.content, tags: i.tags })), ...(patch ? { profile: patch } : {}) };
    if (new TextEncoder().encode(JSON.stringify(body)).byteLength > IMPORT_MAX_BODY_BYTES) {
      setError(copy.errors.tooBig);
      return;
    }
    setError(null);
    setState({ ...state, step: 'saving' });
    const res = await api.importItems(body);
    if (!res.ok) {
      setState({ ...state, step: 'preview' });
      setError(res.error.status === 413 ? copy.errors.tooBig : apiErrorMessage(res.error, appCopy.states));
      return;
    }
    onImported(res.data.profile, res.data.items, patch !== null);
    const message = copy.preview.done(res.data.items.length);
    setDone(message);
    toast(message);
    reset();
    setState({ step: 'idle' });
  }

  const toggle = (key: string) => {
    if (state.step !== 'preview') return;
    const next = new Set(state.checked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setState({ ...state, checked: next });
  };
  const toggleHeader = (key: HeaderKey) => {
    if (state.step !== 'preview') return;
    const next = new Set(state.header);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setState({ ...state, header: next });
  };
  const setAll = (on: boolean) => {
    if (state.step !== 'preview') return;
    setState({ ...state, checked: on ? new Set(state.result.items.map((i) => i.key)) : new Set() });
  };

  const busy = state.step === 'reading' || state.step === 'saving';
  const files = LINKEDIN_FILE_NAMES.map((f) => f.replace(/\.csv$/, '')).join(', ');

  return (
    <section className={s.panel} aria-labelledby="perfil-importar" data-testid="import-panel">
      <h2 id="perfil-importar">{copy.title}</h2>
      <p>{copy.intro}</p>
      <div className={s.privacy}>
        <h3>{copy.privacyTitle}</h3>
        <ul>
          {copy.privacy(files).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      {state.step === 'idle' || state.step === 'reading' ? (
        <div className={s.sources}>
          <div className={s.source}>
            <h3>{copy.linkedin.title}</h3>
            <p className={s.hint}>{copy.linkedin.how}</p>
            <TextField id="importar-zip" label={copy.linkedin.label} hint={copy.linkedin.hint} type="file" accept=".zip,application/zip" key={`zip-${inputs}`} disabled={busy} onChange={(e) => void onZip(e)} />
          </div>
          <div className={s.source}>
            <h3>{copy.jsonResume.title}</h3>
            <p className={s.hint}>{copy.jsonResume.how}</p>
            <TextField id="importar-json" label={copy.jsonResume.label} hint={copy.jsonResume.hint} type="file" accept=".json,application/json" key={`json-${inputs}`} disabled={busy} onChange={(e) => void onJson(e)} />
          </div>
        </div>
      ) : null}
      {state.step === 'reading' ? (
        <p role="status" className={s.hint}>
          {copy.reading}
        </p>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {done ? <Notice tone="success">{done}</Notice> : null}
      {state.step === 'preview' || state.step === 'saving' ? (
        <div className={s.preview} data-testid="import-preview" aria-busy={state.step === 'saving' ? true : undefined}>
          <h3 ref={previewHeading} tabIndex={-1} className={s.previewTitle}>
            {copy.preview.title}
          </h3>
          <p className={s.hint}>
            {state.result.source === 'linkedin' ? copy.preview.fromLinkedIn : copy.preview.fromJsonResume} {copy.preview.read(state.result.read.join(', '))}{' '}
            {state.result.ignored > 0 ? copy.preview.ignored(state.result.ignored) : null}
          </p>
          {state.result.skipped.length > 0 ? <p className={s.hint}>{copy.preview.skipped(state.result.skipped.length)}</p> : null}
          <HeaderChoices
            choices={headerChoices(state.result.header, profile)}
            checked={state.header}
            onToggle={toggleHeader}
            labels={copy.preview.headerFields}
            title={copy.preview.headerTitle}
            hint={copy.preview.headerHint}
            replaces={copy.preview.replaces}
          />
          {state.result.items.length > 0 ? (
            <div className={s.toolbar}>
              <Button variant="secondary" size="small" onClick={() => setAll(true)}>
                {copy.preview.selectAll}
              </Button>
              <Button variant="secondary" size="small" onClick={() => setAll(false)}>
                {copy.preview.selectNone}
              </Button>
              <span className={s.hint} data-testid="import-count">
                {copy.preview.count(state.checked.size, state.result.items.length)}
              </span>
            </div>
          ) : null}
          {ITEM_KIND_ORDER.map((kind) => {
            const group = state.result.items.map((item, index) => ({ item, index })).filter(({ item }) => item.kind === kind);
            if (group.length === 0) return null;
            return (
              <fieldset key={kind} className={s.group} data-testid={`import-group-${kind}`}>
                <legend>
                  {appCopy.itemKinds[kind]} ({group.length})
                </legend>
                <ul className={s.items}>
                  {group.map(({ item, index }) => {
                    const head = itemHeading(item.kind, item.content);
                    const period = itemPeriod(item.content, present);
                    const level = typeof item.content.level === 'string' ? (item.kind === 'language' ? levels.languageLevel[item.content.level] : levels.skillLevel[item.content.level]) : null;
                    const dup = state.duplicates.has(item.key);
                    const id = `importar-${index}`;
                    return (
                      <li key={item.key} className={s.item} data-testid="import-item">
                        <input id={id} type="checkbox" checked={state.checked.has(item.key)} onChange={() => toggle(item.key)} aria-describedby={`${id}-meta`} />
                        <label htmlFor={id}>
                          <strong>{head.title}</strong>
                          {head.detail ? ` · ${head.detail}` : ''}
                          {period ? ` · ${period}` : ''}
                          {level ? ` · ${level}` : ''}
                        </label>
                        <p id={`${id}-meta`} className={s.meta}>
                          {copy.preview.origin(item.origin.file, item.origin.row)}
                          {dup ? <span className={s.dup}> · {copy.preview.exists}</span> : null}
                          {item.notes.map((n) => ` · ${copy.preview.notes[n]}`).join('')}
                          {item.tags.length ? ` · ${copy.preview.tags}: ${item.tags.join(', ')}` : ''}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            );
          })}
          <div className={s.toolbar}>
            <Button onClick={() => void confirm()} disabled={state.step === 'saving'}>
              {state.step === 'saving' ? copy.preview.saving : copy.preview.confirm(state.checked.size)}
            </Button>
            <Button variant="secondary" onClick={discard} disabled={state.step === 'saving'}>
              {copy.preview.discard}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function HeaderChoices({
  choices,
  checked,
  onToggle,
  labels,
  title,
  hint,
  replaces,
}: {
  choices: ReturnType<typeof headerChoices>;
  checked: Set<HeaderKey>;
  onToggle: (key: HeaderKey) => void;
  labels: Record<HeaderKey, string>;
  title: string;
  hint: string;
  replaces: string;
}) {
  if (choices.length === 0) return null;
  return (
    <fieldset className={s.group} data-testid="import-header">
      <legend>{title}</legend>
      <p className={s.hint}>{hint}</p>
      <ul className={s.items}>
        {choices.map((c) => {
          const id = `importar-encabezado-${c.key}`;
          return (
            <li key={c.key} className={s.item}>
              <input id={id} type="checkbox" checked={checked.has(c.key)} onChange={() => onToggle(c.key)} />
              <label htmlFor={id}>
                <strong>{labels[c.key]}:</strong> {c.display}
              </label>
              {c.replaces ? <p className={s.meta}>{replaces}</p> : null}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
