'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/States';
import type { ItemKind } from '@/lib/client/types';
import { BILINGUAL_COPY, type BilingualCopy } from '@/lib/copy/bilingual';
import { fieldLabel, type ProfileCopy, type SectorGuideCopy } from '@/lib/copy/profile';
import { LANGUAGE_CODES, isLanguageCode, languageName } from '@/lib/languages';
import { otherLocale, type ContentLocale, type Translations } from '@/lib/profile-text';
import { errorText } from './errors';
import { ITEM_FIELDS, checkTags, formToContent, type FieldErrors, type FieldSpec, type FormValue, type FormValues, type LinkRow } from './fields';
import { LinksField } from './LinksField';
import { SectorGuide } from './SectorGuide';
import { TagsField, mergeTags } from './TagsField';
import { copyPrimary, emptyTranslations, formToTranslations, itemTextSpecs } from './translation-form';
import { LanguageSwitch, TranslationFields } from './TranslationFields';
import s from './profile.module.css';

/** What a form holds; kept by the editor so a refused save reopens the form exactly as it was, with the errors. */
export interface ItemDraft {
  values: FormValues;
  tags: string[];
  draft: string;
  errors: FieldErrors;
  /** W7 (B4): the other language's text of the item's word fields, its errors and the switch's position. */
  translation?: { values: FormValues; errors: FieldErrors; mode: ContentLocale };
}

/** W7 (B4): «Idioma» lists the ISO 639 codes by their names in the person's interface language, alphabetically. */
function languageOptions(ui: ContentLocale): Record<string, string> {
  return Object.fromEntries(LANGUAGE_CODES.map((c) => [c, languageName(c, ui)]).sort((a, b) => a[1]!.localeCompare(b[1]!, ui)));
}

/** The option labels of an enum field (closed lists from validation.ts, labelled in copy/profile.ts). */
function optionLabels(copy: ProfileCopy, kind: ItemKind, name: string, ui: ContentLocale): Record<string, string> {
  if (name === 'code') return languageOptions(ui);
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
  bilingual,
  ui,
  onChange,
}: {
  formId: string;
  kind: ItemKind;
  spec: FieldSpec;
  value: FormValue | undefined;
  error: FieldErrors[string] | undefined;
  copy: ProfileCopy;
  /** W7 (B4): the language list's labels and hints (a language item's `code` and `name`). */
  bilingual: BilingualCopy;
  ui: ContentLocale;
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
      const labels = optionLabels(copy, kind, spec.name, ui);
      // The language list in its names' alphabetical order; every other list in the order validation.ts gives.
      const order = spec.name === 'code' ? Object.keys(labels) : spec.options;
      return (
        <SelectField
          {...common}
          hint={spec.name === 'code' ? bilingual.languageCodeHint : undefined}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          options={[{ value: '', label: spec.name === 'code' ? bilingual.languageNone : copy.options.none }, ...order.map((o) => ({ value: o, label: labels[o] ?? o }))]}
        />
      );
    }
    case 'bool':
      return <CheckboxField id={id} label={label} error={message} checked={value === true} onChange={(e) => onChange(e.target.checked)} />;
    case 'links':
      return <LinksField id={id} legend={label} hint={copy.hints.links} rows={Array.isArray(value) ? (value as LinkRow[]) : []} max={spec.max} error={error} copy={copy} onChange={onChange} />;
    default:
      return (
        <TextField
          {...common}
          hint={kind === 'language' && spec.name === 'name' ? bilingual.languageNameHint : undefined}
          type={spec.type === 'email' ? 'email' : 'text'}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      );
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
  guide,
  primary,
  ui,
  onSubmit,
  onCancel,
}: {
  kind: ItemKind;
  formId: string;
  title: string;
  submitLabel: string;
  initial: ItemDraft;
  copy: ProfileCopy;
  /** W7 (B3): the retail and luxury guide; shown only for the kinds it covers. */
  guide?: SectorGuideCopy;
  /** W7 (B4): the profile's primary language (the item's main text) and the interface language. */
  primary: ContentLocale;
  ui: ContentLocale;
  onSubmit: (result: { content: Record<string, unknown>; tags: string[]; translations: Translations | null; draft: ItemDraft }) => void;
  onCancel: () => void;
}) {
  const bilingual = BILINGUAL_COPY[ui === 'en' ? 'en' : 'es'];
  const other = otherLocale(primary);
  const textSpecs = itemTextSpecs(kind);
  const [mode, setMode] = useState<ContentLocale>(initial.translation?.mode ?? primary);
  const [trValues, setTrValues] = useState<FormValues>(initial.translation?.values ?? {});
  const [trErrors, setTrErrors] = useState<FieldErrors>(initial.translation?.errors ?? {});
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
    const tr = formToTranslations(textSpecs, trValues, other);
    if (Object.keys(found).length > 0 || Object.keys(tr.errors).length > 0) {
      setErrors(found);
      setTrErrors(tr.errors);
      // Show the language with a problem (the primary text first).
      setMode(Object.keys(found).length > 0 ? primary : other);
      setFocusTick((n) => n + 1);
      return;
    }
    setErrors({});
    setTrErrors({});
    onSubmit({ content, tags: allTags, translations: tr.translations, draft: { values, tags: allTags, draft: '', errors: {}, translation: { values: trValues, errors: {}, mode } } });
  }

  /** W7 (B4): picking a language from the list fills its name (in the profile's language) unless the person wrote another. */
  function setValue(name: string, v: FormValue) {
    setValues((all) => {
      if (kind !== 'language' || name !== 'code') return { ...all, [name]: v };
      const prev = typeof all.code === 'string' && isLanguageCode(all.code) ? languageName(all.code, primary) : '';
      const next: FormValues = { ...all, code: v };
      if (typeof v === 'string' && isLanguageCode(v) && (all.name === '' || all.name === prev)) next.name = languageName(v, primary);
      return next;
    });
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
      {textSpecs.length > 0 ? (
        <LanguageSwitch name={formId} primary={primary} mode={mode} missing={emptyTranslations(textSpecs, trValues, values).length} copy={bilingual} onChange={setMode} />
      ) : null}
      {guide?.kinds[kind] ? (
        <SectorGuide
          copy={guide}
          guide={guide.kinds[kind]!}
          tags={tags.tags}
          onAddKeyword={(k) => setTags((t) => (t.tags.some((x) => x.toLowerCase() === k.toLowerCase()) ? t : { ...t, tags: [...t.tags, k] }))}
        />
      ) : null}
      {mode !== primary ? (
        <TranslationFields
          formId={formId}
          specs={textSpecs}
          values={trValues}
          primaryValues={values}
          errors={trErrors}
          label={(name) => fieldLabel(copy, kind, name)}
          primary={primary}
          other={other}
          copy={bilingual}
          profileCopy={copy}
          onChange={(name, v) => setTrValues((all) => ({ ...all, [name]: v }))}
          onCopyPrimary={() => setTrValues((all) => copyPrimary(textSpecs, all, values))}
        />
      ) : null}
      <div className={s.grid2} hidden={mode !== primary}>
        {ITEM_FIELDS[kind].map((spec) => {
          const control = (
            <FieldControl
              formId={formId}
              kind={kind}
              spec={spec}
              value={values[spec.name]}
              error={errors[spec.name]}
              copy={copy}
              bilingual={bilingual}
              ui={ui}
              onChange={(v) => setValue(spec.name, v)}
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
