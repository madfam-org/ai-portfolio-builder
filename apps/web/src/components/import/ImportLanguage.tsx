'use client';

import { Notice } from '@/components/ui/States';
import { BILINGUAL_COPY } from '@/lib/copy/bilingual';
import { otherLocale, type ContentLocale } from '@/lib/profile-text';
import type { Locale } from '@/lib/routing';
import type { ImportLanguagePlan } from './language';
import s from './import.module.css';

/** W7 (B4): «Idioma del archivo» in the import preview, with what the choice does (language.ts). */
export function ImportLanguage({
  locale,
  primary,
  value,
  plan,
  onChange,
}: {
  locale: Locale;
  primary: ContentLocale;
  value: ContentLocale;
  plan: ImportLanguagePlan;
  onChange: (value: ContentLocale) => void;
}) {
  const b = BILINGUAL_COPY[locale];
  const language = (l: ContentLocale) => b.inLanguage[l];
  return (
    <fieldset className={s.group} data-testid="import-language">
      <legend>{b.importLanguage.legend}</legend>
      <p className={s.hint}>{b.importLanguage.hint(language(primary))}</p>
      {[primary, otherLocale(primary)].map((l) => (
        <div key={l}>
          <input id={`importar-idioma-${l}`} type="radio" name="importar-idioma" value={l} checked={value === l} onChange={() => onChange(l)} />{' '}
          <label htmlFor={`importar-idioma-${l}`}>{b.switchOption[l]}</label>
        </div>
      ))}
      {plan === 'becomes_primary' ? <Notice>{b.importLanguage.becomesPrimary(language(value))}</Notice> : null}
      {plan === 'blocked' ? <Notice tone="warning">{b.importLanguage.blocked(language(primary), language(value))}</Notice> : null}
    </fieldset>
  );
}
