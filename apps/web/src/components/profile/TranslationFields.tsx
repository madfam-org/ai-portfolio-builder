'use client';

import { Button } from '@/components/ui/Button';
import { TextAreaField, TextField } from '@/components/ui/Field';
import type { BilingualCopy } from '@/lib/copy/bilingual';
import type { ProfileCopy } from '@/lib/copy/profile';
import type { ContentLocale } from '@/lib/profile-text';
import { errorText } from './errors';
import type { FieldErrors, FieldSpec, FormValue, FormValues } from './fields';
import s from './profile.module.css';

/**
 * W7 (B4): «Texto en: Español (principal) | English», above a profile form. Native radios in a fieldset, so the arrow
 * keys move the choice and the group has one tab stop. The primary language is always first.
 */
export function LanguageSwitch({
  name,
  primary,
  mode,
  missing,
  copy,
  onChange,
}: {
  name: string;
  primary: ContentLocale;
  mode: ContentLocale;
  /** Fields with primary text and no translation (the badge next to the other language). */
  missing: number;
  copy: BilingualCopy;
  onChange: (mode: ContentLocale) => void;
}) {
  const other: ContentLocale = primary === 'en' ? 'es-MX' : 'en';
  return (
    <fieldset className={s.languageSwitch} data-testid={`${name}-language`}>
      <legend>{copy.switchLegend}</legend>
      {[primary, other].map((locale) => (
        <span key={locale} className={s.languageOption}>
          <input id={`${name}-language-${locale}`} type="radio" name={`${name}-language`} value={locale} checked={mode === locale} onChange={() => onChange(locale)} />
          <label htmlFor={`${name}-language-${locale}`} lang={locale}>
            {copy.switchOption[locale]}
            {locale === primary ? <span className={s.count}> {copy.primaryTag}</span> : null}
          </label>
        </span>
      ))}
      {missing > 0 ? (
        <span className={s.missingBadge} data-testid={`${name}-missing`}>
          {copy.missingBadge(missing, copy.inLanguage[other])}
        </span>
      ) : null}
    </fieldset>
  );
}

/**
 * The other language's fields of one form: each translatable field, labelled «Puesto en inglés», with the primary text
 * it translates as its hint, plus «Copiar el texto en español como punto de partida». No machine translation.
 */
export function TranslationFields({
  formId,
  specs,
  values,
  primaryValues,
  errors,
  label,
  primary,
  other,
  copy,
  profileCopy,
  onChange,
  onCopyPrimary,
}: {
  formId: string;
  specs: readonly FieldSpec[];
  values: FormValues;
  primaryValues: FormValues;
  errors: FieldErrors;
  label: (name: string) => string;
  primary: ContentLocale;
  other: ContentLocale;
  copy: BilingualCopy;
  profileCopy: ProfileCopy;
  onChange: (name: string, value: FormValue) => void;
  onCopyPrimary: () => void;
}) {
  const primaryName = copy.inLanguage[primary];
  const otherName = copy.inLanguage[other];
  return (
    <div className={s.translation} lang={other} data-testid={`${formId}-translation`}>
      <p className={s.hint}>{copy.otherHint(otherName, primaryName)}</p>
      <p className={s.hint}>{copy.noMachine}</p>
      <div className={s.grid2}>
        {specs.map((spec) => {
          const id = `${formId}-tr-${spec.name}`;
          const text = typeof values[spec.name] === 'string' ? (values[spec.name] as string) : '';
          const original = typeof primaryValues[spec.name] === 'string' ? (primaryValues[spec.name] as string).trim() : '';
          const hint = original ? (
            <>
              {copy.primaryText(primaryName)} <span lang={primary}>{spec.type === 'bullets' ? original.split('\n').filter(Boolean).join(' / ') : original}</span>
            </>
          ) : undefined;
          const common = { id, label: `${label(spec.name)} ${otherName}`, hint, error: errorText(profileCopy, errors[spec.name]), value: text };
          const control =
            spec.type === 'text' ? (
              <TextField {...common} onChange={(e) => onChange(spec.name, e.target.value)} />
            ) : (
              <TextAreaField {...common} rows={spec.type === 'bullets' ? 5 : 4} onChange={(e) => onChange(spec.name, e.target.value)} />
            );
          return spec.type === 'text' ? (
            <div key={spec.name}>{control}</div>
          ) : (
            <div key={spec.name} className={s.wide}>
              {control}
            </div>
          );
        })}
      </div>
      <div>
        <Button variant="secondary" size="small" onClick={onCopyPrimary}>
          {copy.copyPrimary(primaryName)}
        </Button>
      </div>
    </div>
  );
}
