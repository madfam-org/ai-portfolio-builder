'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/States';
import type { ItemKind } from '@/lib/client/types';
import { fieldLabel, type ProfileCopy } from '@/lib/copy/profile';
import { errorText } from './errors';
import { ITEM_FIELDS, checkTags, formToContent, type FieldErrors, type FieldSpec, type FormValue, type FormValues, type LinkRow } from './fields';
import { LinksField } from './LinksField';
import { TagsField, mergeTags } from './TagsField';
import s from './profile.module.css';

/** What a form holds; kept by the editor so a refused save reopens the form exactly as it was, with the errors. */
export interface ItemDraft {
  values: FormValues;
  tags: string[];
  draft: string;
  errors: FieldErrors;
}

/** The option labels of an enum field (closed lists from validation.ts, labelled in copy/profile.ts). */
function optionLabels(copy: ProfileCopy, kind: ItemKind, name: string): Record<string, string> {
  if (name === 'employmentType') return copy.options.employmentType;
  if (kind === 'language') return copy.options.languageLevel;
  return copy.options.skillLevel;
}

const WIDE = new Set<FieldSpec['type']>(['textarea', 'bullets', 'links', 'bool']);

/** One field of an item form, from its descriptor. */
export function FieldControl({
  formId,
  kind,
  spec,
  value,
  error,
  copy,
  onChange,
}: {
  formId: string;
  kind: ItemKind;
  spec: FieldSpec;
  value: FormValue | undefined;
  error: FieldErrors[string] | undefined;
  copy: ProfileCopy;
  onChange: (value: FormValue) => void;
}) {
  const id = `${formId}-${spec.name}`;
  const label = spec.required ? `${fieldLabel(copy, kind, spec.name)} ${copy.requiredMark}` : fieldLabel(copy, kind, spec.name);
  const text = typeof value === 'string' ? value : '';
  const message = errorText(copy, error);
  const common = { id, label, error: message, required: spec.required };
  switch (spec.type) {
    case 'textarea':
      return <TextAreaField {...common} rows={4} value={text} onChange={(e) => onChange(e.target.value)} />;
    case 'bullets':
      return <TextAreaField {...common} rows={5} hint={copy.hints.highlights} value={text} onChange={(e) => onChange(e.target.value)} />;
    case 'url':
      return <TextField {...common} type="url" inputMode="url" autoComplete="url" hint={copy.hints.url} value={text} onChange={(e) => onChange(e.target.value)} />;
    case 'date':
      return <TextField {...common} hint={spec.nullable ? copy.hints.endDate : copy.hints.date} autoComplete="off" value={text} onChange={(e) => onChange(e.target.value)} />;
    case 'int':
      return <TextField {...common} inputMode="numeric" hint={copy.hints.years} value={text} onChange={(e) => onChange(e.target.value)} />;
    case 'enum': {
      const labels = optionLabels(copy, kind, spec.name);
      return (
        <SelectField
          {...common}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          options={[{ value: '', label: copy.options.none }, ...spec.options.map((o) => ({ value: o, label: labels[o] ?? o }))]}
        />
      );
    }
    case 'bool':
      return <CheckboxField id={id} label={label} error={message} checked={value === true} onChange={(e) => onChange(e.target.checked)} />;
    case 'links':
      return <LinksField id={id} legend={label} hint={copy.hints.links} rows={Array.isArray(value) ? (value as LinkRow[]) : []} max={spec.max} error={error} copy={copy} onChange={onChange} />;
    default:
      return <TextField {...common} type={spec.type === 'email' ? 'email' : 'text'} value={text} onChange={(e) => onChange(e.target.value)} />;
  }
}

/**
 * The add/edit form of one item kind, rendered from its descriptor. It checks the same rules as the API before
 * anything is sent; the first field with a problem gets the focus. On open, the heading takes the focus (or the first
 * error, when the form reopens after a refused save). Escape cancels.
 */
export function ItemForm({
  kind,
  formId,
  title,
  submitLabel,
  initial,
  copy,
  onSubmit,
  onCancel,
}: {
  kind: ItemKind;
  formId: string;
  title: string;
  submitLabel: string;
  initial: ItemDraft;
  copy: ProfileCopy;
  onSubmit: (result: { content: Record<string, unknown>; tags: string[]; draft: ItemDraft }) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<FormValues>(initial.values);
  const [tags, setTags] = useState({ tags: initial.tags, draft: initial.draft });
  const [errors, setErrors] = useState<FieldErrors>(initial.errors);
  const [focusTick, setFocusTick] = useState(Object.keys(initial.errors).length > 0 ? 1 : 0);
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const invalid = focusTick > 0 ? form.querySelector<HTMLElement>('[aria-invalid="true"]') : null;
    (invalid ?? headingRef.current)?.focus();
  }, [focusTick]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { content, errors: found } = formToContent(ITEM_FIELDS[kind], values);
    const allTags = mergeTags(tags.tags, tags.draft);
    const tagError = checkTags(allTags);
    if (tagError) found.tags = tagError;
    if (Object.keys(found).length > 0) {
      setErrors(found);
      setFocusTick((n) => n + 1);
      return;
    }
    setErrors({});
    onSubmit({ content, tags: allTags, draft: { values, tags: allTags, draft: '', errors: {} } });
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <form ref={formRef} className={`${s.panel} ${s.form}`} onSubmit={submit} onKeyDown={onKeyDown} noValidate aria-labelledby={`${formId}-heading`} data-testid={formId}>
      <h4 className={s.formTitle} id={`${formId}-heading`} ref={headingRef} tabIndex={-1}>
        {title}
      </h4>
      {errors._form ? <Notice tone="danger">{errorText(copy, errors._form)}</Notice> : null}
      <div className={s.grid2}>
        {ITEM_FIELDS[kind].map((spec) => {
          const control = (
            <FieldControl
              formId={formId}
              kind={kind}
              spec={spec}
              value={values[spec.name]}
              error={errors[spec.name]}
              copy={copy}
              onChange={(v) => setValues((all) => ({ ...all, [spec.name]: v }))}
            />
          );
          return WIDE.has(spec.type) ? (
            <div key={spec.name} className={s.wide}>
              {control}
            </div>
          ) : (
            <div key={spec.name}>{control}</div>
          );
        })}
        <div className={s.wide}>
          <TagsField id={`${formId}-tags`} tags={tags.tags} draft={tags.draft} error={errors.tags} copy={copy} onChange={setTags} />
        </div>
      </div>
      <div className={s.rowActions}>
        <Button type="submit">{submitLabel}</Button>
        <Button variant="secondary" onClick={onCancel}>
          {copy.actions.cancel}
        </Button>
      </div>
    </form>
  );
}
