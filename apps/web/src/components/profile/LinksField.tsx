'use client';

import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import type { ProfileCopy } from '@/lib/copy/profile';
import { errorText } from './errors';
import type { FieldError, LinkRow } from './fields';
import s from './profile.module.css';

/**
 * A list of {label, url} rows (header contact links, project links): add and remove rows, each input labelled with its
 * row number; an error points at the exact input (aria-invalid + its message) and the whole group says it too.
 */
export function LinksField({
  id,
  legend,
  hint,
  rows,
  max,
  error,
  copy,
  onChange,
}: {
  id: string;
  legend: string;
  hint?: string;
  rows: LinkRow[];
  max: number;
  error: FieldError | null | undefined;
  copy: ProfileCopy;
  onChange: (rows: LinkRow[]) => void;
}) {
  const message = errorText(copy, error);
  const set = (index: number, part: keyof LinkRow, value: string) => onChange(rows.map((r, i) => (i === index ? { ...r, [part]: value } : r)));
  const rowError = (index: number, part: keyof LinkRow) => (error && error.row === index && error.part === part ? message : null);
  const groupMessage = message && error?.row === undefined ? message : null;
  return (
    <fieldset className={s.fieldset} id={id} aria-describedby={[hint ? `${id}-hint` : '', groupMessage ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined}>
      <legend>{legend}</legend>
      {hint ? (
        <p className={s.hint} id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {rows.length === 0 ? <p className={s.hint}>{copy.links.empty}</p> : null}
      {rows.map((r, i) => (
        <div className={s.linkRow} key={i}>
          <TextField id={`${id}-${i}-label`} label={`${copy.links.label} (${copy.links.row} ${i + 1})`} value={r.label} onChange={(e) => set(i, 'label', e.target.value)} error={rowError(i, 'label')} />
          <TextField
            id={`${id}-${i}-url`}
            label={`${copy.links.url} (${copy.links.row} ${i + 1})`}
            type="url"
            inputMode="url"
            value={r.url}
            onChange={(e) => set(i, 'url', e.target.value)}
            error={rowError(i, 'url')}
          />
          <Button variant="ghost" size="small" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            {copy.links.remove} {i + 1}
          </Button>
        </div>
      ))}
      {groupMessage ? (
        <p className={s.error} id={`${id}-error`} role="alert">
          {groupMessage}
        </p>
      ) : null}
      <div>
        <Button variant="secondary" size="small" onClick={() => onChange([...rows, { label: '', url: '' }])} disabled={rows.length >= max}>
          {copy.links.add}
        </Button>
      </div>
    </fieldset>
  );
}
