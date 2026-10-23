'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { api, apiErrorMessage } from '@/lib/client/api';
import type { ContentLocale, ProfileDto } from '@/lib/client/types';
import type { AppCopy } from '@/lib/copy/app';
import { BILINGUAL_COPY } from '@/lib/copy/bilingual';
import type { ProfileCopy } from '@/lib/copy/profile';
import { otherLocale, type Translations } from '@/lib/profile-text';
import { errorText } from './errors';
import { CONTACT_FIELDS, HEADER_FIELDS, formToContent, issuesToErrors, type FieldErrors, type FormValues, type LinkRow } from './fields';
import { LinksField } from './LinksField';
import { HEADER_TEXT_SPECS, copyPrimary, emptyTranslations, formToTranslations, translationsToForm } from './translation-form';
import { LanguageSwitch, TranslationFields } from './TranslationFields';
import s from './profile.module.css';

interface HeaderValues {
  displayName: string;
  headline: string;
  summary: string;
  locale: ContentLocale;
  email: string;
  phone: string;
  location: string;
  links: LinkRow[];
  /** W7 (B4): headline, summary and place in the profile's other language (as the form holds them). */
  translated: FormValues;
}

const KNOWN = [...HEADER_FIELDS, ...CONTACT_FIELDS].map((f) => f.name);

function toValues(profile: ProfileDto | null, nameHint: string | null, fallbackLocale: ContentLocale): HeaderValues {
  const c = profile?.contact ?? {};
  return {
    displayName: profile?.displayName || nameHint || '',
    headline: profile?.headline ?? '',
    summary: profile?.summary ?? '',
    locale: profile?.locale ?? fallbackLocale,
    email: c.email ?? '',
    phone: c.phone ?? '',
    location: c.location ?? '',
    links: (c.links ?? []).map((l) => ({ ...l })),
    translated: translationsToForm(HEADER_TEXT_SPECS, profile?.translations, otherLocale(profile?.locale ?? fallbackLocale)),
  };
}

type HeaderBody = { displayName: string; headline: string; summary: string; locale: ContentLocale; contact: Record<string, unknown>; translations?: Translations | null };

/**
 * Header values → the `PUT /profile` body (same rules as profileBody + contactSchema), or the errors per field.
 * W7 (B4): `translatedAs` is the language the translated values are written in (the saved profile's other language);
 * when the person also changes the primary language to that one, the translations are left as stored (not sent).
 */
export function headerBody(values: HeaderValues, translatedAs?: ContentLocale): { body: HeaderBody | null; errors: FieldErrors; translationErrors: FieldErrors } {
  const head = formToContent(HEADER_FIELDS, { displayName: values.displayName, headline: values.headline, summary: values.summary });
  const contact = formToContent(CONTACT_FIELDS, { email: values.email, phone: values.phone, location: values.location, links: values.links });
  const errors = { ...head.errors, ...contact.errors };
  const tr = translatedAs ? formToTranslations(HEADER_TEXT_SPECS, values.translated, translatedAs) : { translations: null, errors: {} };
  if (Object.keys(errors).length > 0 || Object.keys(tr.errors).length > 0) return { body: null, errors, translationErrors: tr.errors };
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    body: {
      displayName: str(head.content.displayName),
      headline: str(head.content.headline),
      summary: str(head.content.summary),
      locale: values.locale,
      contact: contact.content,
      ...(translatedAs && translatedAs !== values.locale ? { translations: tr.translations } : {}),
    },
    errors: {},
    translationErrors: {},
  };
}

type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'failed';

/**
 * The person on top of every document: name (prefilled from the Janua account the first time), headline, summary,
 * the profile's language and the contact block with http(s)-only links. Saved with one button; the state line says
 * whether there is anything unsaved. A refused save keeps every value and marks the fields.
 */
export function HeaderForm({
  profile,
  nameHint,
  uiLocale,
  initialMode,
  copy,
  appCopy,
  onSaved,
}: {
  profile: ProfileDto | null;
  nameHint: string | null;
  uiLocale: ContentLocale;
  /** W7 (B4): open on the other language (the missing-translation flag's link). */
  initialMode?: ContentLocale;
  copy: ProfileCopy;
  appCopy: AppCopy;
  onSaved: (profile: ProfileDto) => void;
}) {
  const h = copy.header;
  const toast = useToast();
  const [values, setValues] = useState<HeaderValues>(() => toValues(profile, nameHint, uiLocale));
  const [saved, setSaved] = useState<string>(() => JSON.stringify(toValues(profile, null, uiLocale)));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [state, setState] = useState<SaveState>('clean');
  const [focusTick, setFocusTick] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const prefilled = !profile?.displayName && !!nameHint;
  const bilingual = BILINGUAL_COPY[uiLocale === 'en' ? 'en' : 'es'];
  /** The saved profile's languages: the translated fields are written in `other`. */
  const primary: ContentLocale = profile?.locale ?? uiLocale;
  const other = otherLocale(primary);
  const [mode, setMode] = useState<ContentLocale>(initialMode ?? primary);
  const [trErrors, setTrErrors] = useState<FieldErrors>({});
  const primaryTexts: FormValues = { headline: values.headline, summary: values.summary, location: values.location };

  useEffect(() => {
    if (focusTick > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusTick]);

  const dirty = JSON.stringify(values) !== saved;
  const shown: SaveState = state === 'saving' || state === 'failed' ? state : dirty ? 'dirty' : state === 'saved' ? 'saved' : 'clean';
  const set = <K extends keyof HeaderValues>(key: K, value: HeaderValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (state === 'failed' || state === 'saved') setState('dirty');
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === 'saving') return;
    const { body, errors: found, translationErrors } = headerBody(values, other);
    if (!body) {
      setErrors(found);
      setTrErrors(translationErrors);
      setMode(Object.keys(found).length > 0 ? primary : other);
      setState('failed');
      setFocusTick((n) => n + 1);
      return;
    }
    setErrors({});
    setTrErrors({});
    setState('saving');
    const res = await api.putProfile(body);
    if (!res.ok) {
      setErrors(issuesToErrors(res.error.issues, KNOWN));
      setState('failed');
      setFocusTick((n) => n + 1);
      toast(apiErrorMessage(res.error, appCopy.states), 'danger');
      return;
    }
    const next = toValues(res.data.profile, null, uiLocale);
    setValues(next);
    setSaved(JSON.stringify(next));
    setState('saved');
    onSaved(res.data.profile);
  }

  const err = (name: string) => errorText(copy, errors[name]);
  return (
    <form ref={formRef} className={`${s.panel} ${s.form}`} onSubmit={submit} noValidate aria-labelledby="perfil-encabezado">
      <h2 id="perfil-encabezado">{h.title}</h2>
      <p className={s.hint}>{h.intro}</p>
      {errors._form ? <Notice tone="danger">{err('_form')}</Notice> : null}
      <LanguageSwitch name="perfil" primary={primary} mode={mode} missing={emptyTranslations(HEADER_TEXT_SPECS, values.translated, primaryTexts).length} copy={bilingual} onChange={setMode} />
      {mode !== primary ? (
        <TranslationFields
          formId="perfil"
          specs={HEADER_TEXT_SPECS}
          values={values.translated}
          primaryValues={primaryTexts}
          errors={trErrors}
          label={(name) => h[name as 'headline' | 'summary' | 'location']}
          primary={primary}
          other={other}
          copy={bilingual}
          profileCopy={copy}
          onChange={(name, v) => set('translated', { ...values.translated, [name]: v })}
          onCopyPrimary={() => set('translated', copyPrimary(HEADER_TEXT_SPECS, values.translated, primaryTexts))}
        />
      ) : null}
      <div className={s.grid2} hidden={mode !== primary}>
        <TextField id="perfil-nombre" label={h.displayName} hint={prefilled ? h.displayNameFromAccount : h.displayNameHint} autoComplete="name" value={values.displayName} onChange={(e) => set('displayName', e.target.value)} error={err('displayName')} />
        <TextField id="perfil-titular" label={h.headline} hint={h.headlineHint} value={values.headline} onChange={(e) => set('headline', e.target.value)} error={err('headline')} />
        <div className={s.wide}>
          <TextAreaField id="perfil-resumen" label={h.summary} hint={h.summaryHint} rows={5} value={values.summary} onChange={(e) => set('summary', e.target.value)} error={err('summary')} />
        </div>
        <SelectField
          id="perfil-idioma"
          label={h.locale}
          hint={h.localeHint}
          value={values.locale}
          onChange={(e) => set('locale', e.target.value === 'en' ? 'en' : 'es-MX')}
          options={[
            { value: 'es-MX', label: h.locales['es-MX'] },
            { value: 'en', label: h.locales.en },
          ]}
        />
      </div>
      <fieldset className={s.fieldset} hidden={mode !== primary}>
        <legend>{h.contactTitle}</legend>
        <p className={s.hint}>{h.contactIntro}</p>
        <div className={s.grid2}>
          <TextField id="perfil-correo" label={h.email} type="email" autoComplete="email" value={values.email} onChange={(e) => set('email', e.target.value)} error={err('email')} />
          <TextField id="perfil-telefono" label={h.phone} type="tel" autoComplete="tel" value={values.phone} onChange={(e) => set('phone', e.target.value)} error={err('phone')} />
          <TextField id="perfil-ubicacion" label={h.location} value={values.location} onChange={(e) => set('location', e.target.value)} error={err('location')} />
        </div>
        <LinksField id="perfil-enlaces" legend={h.links} hint={h.linksHint} rows={values.links} max={20} error={errors.links} copy={copy} onChange={(rows) => set('links', rows)} />
      </fieldset>
      <div className={s.saveLine}>
        <Button type="submit" aria-disabled={state === 'saving' || undefined}>
          {h.save}
        </Button>
        <p role="status" data-testid="header-state">
          {copy.saveState[shown]}
        </p>
      </div>
    </form>
  );
}
