/**
 * W7 (B3): the tailoring workspace's language control (`/empleos/:id/adaptar`), stated plainly: one language per set
 * of documents, what changes with it (the renderers' section names, dates) and what does not (the person's own text),
 * which languages this job already has, and «crear también la versión en inglés». es-MX source, en.
 */
import type { ContentLocale } from '../client/types.ts';
import type { Locale } from '../routing.ts';

export interface TailorLanguageCopy {
  legend: string;
  hint: string;
  options: Record<ContentLocale, string>;
  /** Appended to a document's title when its language is not the profile's: «CV · Puesto · Empresa (English)». */
  titleTag: Record<ContentLocale, string>;
  existing: string;
  none: string;
  /** «{kinds}» joined with commas. */
  existingLine: (language: string, kinds: string) => string;
  alsoCreate: Record<ContentLocale, string>;
  switched: Record<ContentLocale, string>;
}

export const TAILOR_LANGUAGE_COPY: Record<Locale, TailorLanguageCopy> = {
  es: {
    legend: 'Idioma de los documentos',
    hint: 'Cambia los títulos de las secciones y las fechas. Tu texto se queda como lo escribiste: para una versión en otro idioma, escribe la traducción en «Ajustar el texto para este empleo» de cada elemento (tu perfil no cambia). Cada idioma es un documento aparte.',
    options: { 'es-MX': 'Español (México)', en: 'Inglés' },
    titleTag: { 'es-MX': '(Español)', en: '(English)' },
    existing: 'Ya tienes para este empleo:',
    none: 'Aún no hay documentos para este empleo.',
    existingLine: (language, kinds) => `${language}: ${kinds}`,
    alsoCreate: { 'es-MX': 'Preparar también la versión en español', en: 'Preparar también la versión en inglés' },
    switched: {
      'es-MX': 'Elegiste español. Revisa los textos de cada elemento y vuelve a crear los documentos.',
      en: 'Elegiste inglés. Escribe la traducción en «Ajustar el texto para este empleo» de cada elemento y vuelve a crear los documentos.',
    },
  },
  en: {
    legend: 'Language of the documents',
    hint: 'It changes the section titles and the dates. Your text stays as you wrote it: for a version in another language, write the translation under “Adjust the text for this job” on each item (your profile does not change). Each language is a separate document.',
    options: { 'es-MX': 'Spanish (Mexico)', en: 'English' },
    titleTag: { 'es-MX': '(Español)', en: '(English)' },
    existing: 'You already have for this job:',
    none: 'There are no documents for this job yet.',
    existingLine: (language, kinds) => `${language}: ${kinds}`,
    alsoCreate: { 'es-MX': 'Also prepare the Spanish version', en: 'Also prepare the English version' },
    switched: {
      'es-MX': 'You chose Spanish. Review each item’s text and create the documents again.',
      en: 'You chose English. Write the translation under “Adjust the text for this job” on each item and create the documents again.',
    },
  },
};
