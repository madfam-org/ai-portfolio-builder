'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Badge } from '@/components/ui/States';
import type { ItemDto } from '@/lib/client/types';
import { fmt, JOBS_COPY } from '@/lib/copy/jobs';
import { localizeItem, type ContentLocale } from '@/lib/profile-text';
import type { Locale } from '@/lib/routing';
import { LIMITS, addEntry, cleanOverride, itemLabel, itemOriginal, moveEntry, removeEntry, setOverride, type OverrideDraft, type SelectionEntry } from './tailoring';
import s from './jobs.module.css';

export type ItemProblems = Record<string, Partial<Record<keyof OverrideDraft, string>>>;

/**
 * The ordered selection for this job's documents («Subir» / «Bajar» / «Quitar», per-item text for this job only)
 * and the rest of the profile («Agregar»). Focus stays with the item a control acted on, so the whole list works
 * from the keyboard. Overrides are drafts in this page until the documents are created; the profile is never written.
 */
export function SelectionEditor({
  locale,
  primary,
  docLocale,
  items,
  scores,
  selection,
  onChange,
  itemsError,
  itemProblems,
}: {
  locale: Locale;
  /** W7 (B4): the profile's primary language and the documents' language; the placeholders show the latter. */
  primary: ContentLocale;
  docLocale: ContentLocale;
  items: readonly ItemDto[];
  scores: ReadonlyMap<string, number>;
  selection: readonly SelectionEntry[];
  onChange: (next: SelectionEntry[]) => void;
  itemsError: string | null;
  itemProblems: ItemProblems;
}) {
  const t = JOBS_COPY[locale];
  const pendingFocus = useRef<string[] | null>(null);
  const byId = new Map(items.map((i) => [i.id, i]));
  const chosen = new Set(selection.map((e) => e.itemId));
  const available = items
    .filter((i) => !chosen.has(i.id))
    .sort((x, y) => (scores.get(y.id) ?? 0) - (scores.get(x.id) ?? 0) || x.position - y.position);
  const label = (item: ItemDto) => itemLabel(item, t.itemKind[item.kind]);
  const points = (id: string) => {
    const n = scores.get(id) ?? 0;
    return fmt(n === 1 ? t.match.point : t.match.points, { n });
  };

  // Focus the first candidate that exists and is enabled once the list re-rendered.
  useEffect(() => {
    const candidates = pendingFocus.current;
    if (!candidates) return;
    pendingFocus.current = null; // once: typing an override later must not move focus
    for (const id of candidates) {
      const el = document.getElementById(id) as HTMLButtonElement | null;
      if (el && !el.disabled) {
        el.focus();
        break;
      }
    }
  }, [selection]);

  const act = (next: SelectionEntry[], focus: string[]) => {
    pendingFocus.current = focus;
    onChange(next);
  };

  return (
    <>
      <h3 id="tailor-selected-heading">{fmt(t.tailor.selected, { n: selection.length })}</h3>
      <p className="small muted">{t.tailor.preselected}</p>
      {itemsError ? (
        <p className={s.fieldError} id="tailor-items-error" role="alert">
          {itemsError}
        </p>
      ) : null}
      {selection.length === 0 ? (
        <p className="muted">{t.tailor.selectedEmpty}</p>
      ) : (
        <ol className={s.plain} aria-labelledby="tailor-selected-heading" data-testid="tailor-selected">
          {selection.map((entry, index) => {
            const item = byId.get(entry.itemId);
            if (!item) return null;
            const name = label(item);
            // W7 (B4): what the document will print when nothing is adjusted: the text of its own language.
            const localized = { ...item, content: localizeItem(item.kind, item.content, item.translations, primary, docLocale).content };
            const original = itemOriginal(localized);
            const adjusted = cleanOverride(entry.override) !== undefined;
            const problems = itemProblems[entry.itemId] ?? {};
            const base = `sel-${entry.itemId}`;
            const edit = (patch: Partial<OverrideDraft>) => onChange(setOverride(selection, entry.itemId, patch));
            return (
              <li key={entry.itemId} className={s.entry} data-testid="tailor-entry" data-item-id={entry.itemId}>
                <div className={s.entryHead}>
                  <span>
                    <span className="small muted">{fmt(t.tailor.position, { n: index + 1, total: selection.length })} · </span>
                    <strong>{name}</strong> <Badge>{t.itemKind[item.kind]}</Badge> <span className="small muted">{points(item.id)}</span>
                    {adjusted ? (
                      <>
                        {' '}
                        <Badge>{t.tailor.adjusted}</Badge>
                      </>
                    ) : null}
                  </span>
                  <span className={s.actions}>
                    <Button
                      id={`${base}-up`}
                      size="small"
                      variant="ghost"
                      disabled={index === 0}
                      aria-label={`${t.tailor.up}: ${name}`}
                      onClick={() => act(moveEntry(selection, index, -1), [`${base}-up`, `${base}-down`])}
                    >
                      <Icon name="up" /> {t.tailor.up}
                    </Button>
                    <Button
                      id={`${base}-down`}
                      size="small"
                      variant="ghost"
                      disabled={index === selection.length - 1}
                      aria-label={`${t.tailor.down}: ${name}`}
                      onClick={() => act(moveEntry(selection, index, 1), [`${base}-down`, `${base}-up`])}
                    >
                      <Icon name="down" /> {t.tailor.down}
                    </Button>
                    <Button
                      id={`${base}-remove`}
                      size="small"
                      variant="secondary"
                      aria-label={`${t.tailor.remove}: ${name}`}
                      onClick={() => act(removeEntry(selection, entry.itemId), [`avail-${entry.itemId}-add`])}
                    >
                      {t.tailor.remove}
                    </Button>
                  </span>
                </div>
                <details className={s.override} open={Object.keys(problems).length > 0 || undefined}>
                  <summary>{t.tailor.adjust}</summary>
                  <p className="small muted">{t.tailor.overrideHint}</p>
                  <TextField
                    id={`ov-${entry.itemId}-title`}
                    label={t.tailor.overrideTitle}
                    value={entry.override.title}
                    placeholder={label(localized)}
                    maxLength={LIMITS.overrideTitle}
                    onChange={(e) => edit({ title: e.target.value })}
                    error={problems.title ?? null}
                  />
                  <TextAreaField
                    id={`ov-${entry.itemId}-summary`}
                    label={t.tailor.overrideSummary}
                    rows={3}
                    value={entry.override.summary}
                    placeholder={original.summary}
                    onChange={(e) => edit({ summary: e.target.value })}
                    error={problems.summary ?? null}
                  />
                  <TextAreaField
                    id={`ov-${entry.itemId}-highlights`}
                    label={t.tailor.overrideHighlights}
                    rows={3}
                    value={entry.override.highlights}
                    placeholder={original.highlights.join('\n')}
                    onChange={(e) => edit({ highlights: e.target.value })}
                    error={problems.highlights ?? null}
                  />
                </details>
              </li>
            );
          })}
        </ol>
      )}

      <h3 id="tailor-available-heading">{fmt(t.tailor.available, { n: available.length })}</h3>
      {available.length === 0 ? (
        <p className="muted">{t.tailor.availableEmpty}</p>
      ) : (
        <ul className={s.plain} aria-labelledby="tailor-available-heading" data-testid="tailor-available">
          {available.map((item) => {
            const name = label(item);
            return (
              <li key={item.id} className={s.entryHead} data-item-id={item.id}>
                <span>
                  <strong>{name}</strong> <Badge>{t.itemKind[item.kind]}</Badge> <span className="small muted">{points(item.id)}</span>
                </span>
                <Button
                  id={`avail-${item.id}-add`}
                  size="small"
                  variant="secondary"
                  aria-label={`${t.tailor.add}: ${name}`}
                  onClick={() => act(addEntry(selection, item.id), [`sel-${item.id}-remove`])}
                >
                  <Icon name="plus" /> {t.tailor.add}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
