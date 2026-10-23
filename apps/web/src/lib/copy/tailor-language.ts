/**
 * W7 (B3): the tailoring workspace's language control (`/empleos/:id/adaptar`), stated plainly: one language per set
 * of documents, what changes with it (section names, dates and, since W7-B4, the person's text in that language),
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
    hint: 'Cambia los títulos de las secciones, las fechas y tu texto: cada documento usa el texto de tu perfil en su idioma, el que escribes con «Texto en» en cada sección del perfil. Donde falte, usa el texto principal y te lo avisamos aquí. Cada idioma es un documento aparte.',
    options: { 'es-MX': 'Español (México)', en: 'Inglés' },
    titleTag: { 'es-MX': '(Español)', en: '(English)' },
    existing: 'Ya tienes para este empleo:',
    none: 'Aún no hay documentos para este empleo.',
    existingLine: (language, kinds) => `${language}: ${kinds}`,
    alsoCreate: { 'es-MX': 'Preparar también la versión en español', en: 'Preparar también la versión en inglés' },
    switched: {
      'es-MX': 'Elegiste español. Revisa los textos de cada elemento y vuelve a crear los documentos.',
      en: 'Elegiste inglés. Los documentos usan el texto en inglés de tu perfil; revisa el aviso de textos faltantes y vuelve a crear los documentos.',
    },
  },
  en: {
    legend: 'Language of the documents',
    hint: 'It changes the section titles, the dates and your text: each document uses your profile’s text in its language, the one you write with “Text in” on each profile section. Where it is missing, it uses the main text and we tell you here. Each language is a separate document.',
    options: { 'es-MX': 'Spanish (Mexico)', en: 'English' },
    titleTag: { 'es-MX': '(Español)', en: '(English)' },
    existing: 'You already have for this job:',
    none: 'There are no documents for this job yet.',
    existingLine: (language, kinds) => `${language}: ${kinds}`,
    alsoCreate: { 'es-MX': 'Also prepare the Spanish version', en: 'Also prepare the English version' },
    switched: {
      'es-MX': 'You chose Spanish. Review each item’s text and create the documents again.',
      en: 'You chose English. The documents use your profile’s English text; check the notice of missing texts and create the documents again.',
    },
  },
};
