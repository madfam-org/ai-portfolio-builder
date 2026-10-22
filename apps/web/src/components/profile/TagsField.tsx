'use client';

import type { KeyboardEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import type { ProfileCopy } from '@/lib/copy/profile';
import { errorText } from './errors';
import { splitTags, type FieldError } from './fields';
import s from './profile.module.css';

/** Adds the typed keywords to the list (case-insensitive de-duplication), in the order typed. */
export function mergeTags(tags: readonly string[], draft: string): string[] {
  return splitTags([...tags, draft].join(','));
}

/**
 * Keywords as chips over a plain input: type one or several separated by commas, then Enter or «Agregar»; each chip
 * has its own «Quitar» button. Whatever is still typed in the box is added when the item is saved (never lost).
 */
export function TagsField({
  id,
  tags,
  draft,
  error,
  copy,
  onChange,
}: {
  id: string;
  tags: string[];
  draft: string;
  error: FieldError | null | undefined;
  copy: ProfileCopy;
  onChange: (next: { tags: string[]; draft: string }) => void;
}) {
  const t = copy.tags;
  const add = () => onChange({ tags: mergeTags(tags, draft), draft: '' });
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  };
  return (
    <div className={s.form}>
      <div className={s.tagEntry}>
        <TextField id={id} label={t.label} hint={t.hint} value={draft} onChange={(e) => onChange({ tags, draft: e.target.value })} onKeyDown={onKeyDown} error={errorText(copy, error)} autoComplete="off" />
        <Button variant="secondary" size="small" onClick={add} disabled={draft.trim() === ''}>
          {t.add}
        </Button>
      </div>
      {tags.length === 0 ? (
        <p className={s.hint}>{t.none}</p>
      ) : (
        <ul className={s.chips} aria-label={t.listLabel}>
          {tags.map((tag) => (
            <li key={tag} className={s.chip}>
              <span>{tag}</span>
              <button type="button" className={s.chipRemove} aria-label={`${t.remove} «${tag}»`} onClick={() => {
                  onChange({ tags: tags.filter((x) => x !== tag), draft });
                  // The chip's button goes away with it: keep the keyboard in the keyword box.
                  document.getElementById(id)?.focus();
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
