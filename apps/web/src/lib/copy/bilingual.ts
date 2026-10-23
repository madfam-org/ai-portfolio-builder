/**
 * W7 (B4): strings of bilingual profile text: the «Español | English» switch of the profile forms, the «falta en
 * inglés» marks, the flag of missing translations in the preview and the tailoring workspace, the import's file
 * language and the per-language JSON Resume download. es-MX source, en.
 *
 * Truth rules (R85): no machine or AI translation is offered (the person writes each version); the flag never claims a
 * text is translated when it falls back to the primary language.
 */
import type { ContentLocale } from '../profile-text.ts';
import type { Locale } from '../routing.ts';

export interface BilingualCopy {
  /** The switch above a form: «Texto en: Español | English». */
  switchLegend: string;
  /** Each language as its own speakers write it (a language switch convention). */
  switchOption: Record<ContentLocale, string>;
  /** «(principal)» after the profile's primary language. */
  primaryTag: string;
  /** Shown in the other language's mode, above the fields. */
  otherHint: (other: string, primary: string) => string;
  /** Under a field in the other language: the primary text it translates. */
  primaryText: (primary: string) => string;
  /** «Copiar el texto en español como punto de partida». */
  copyPrimary: (primary: string) => string;
  copied: string;
  noMachine: string;
  /** Per item row and per form: how many fields lack the other language. */
  missingBadge: (n: number, other: string) => string;
  complete: (other: string) => string;
  /** «en inglés» / «en español». */
  inLanguage: Record<ContentLocale, string>;
  /** A language item: the list of ISO 639 languages and the fallback name. */
  languageCode: string;
  languageCodeHint: string;
  languageNone: string;
  languageNameHint: string;
  /** The flag in the preview and the tailoring workspace (never printed). */
  flag: {
    title: (n: number, language: string) => string;
    body: (language: string, primary: string) => string;
    notPrinted: string;
    header: string;
    pickLanguage: string;
    fix: string;
  };
  /** Tailoring: overrides are per language. */
  overridesPerLanguage: (language: string) => string;
  /** Import: the language of the file. */
  importLanguage: {
    legend: string;
    hint: (primary: string) => string;
    becomesPrimary: (language: string) => string;
    blocked: (primary: string, language: string) => string;
  };
  /** /ajustes: JSON Resume per language. */
  jsonResumeIn: Record<ContentLocale, string>;
  jsonResumeNote: string;
}

export const BILINGUAL_COPY: Record<Locale, BilingualCopy> = {
  es: {
    switchLegend: 'Texto en',
    switchOption: { 'es-MX': 'Español', en: 'English' },
    primaryTag: '(principal)',
    otherHint: (other, primary) =>
      `Escribe aquí la versión ${other}. Los documentos ${other} usan este texto; donde falte, usan el texto ${primary} y te lo avisamos antes de imprimir. Los nombres propios (empresa, escuela), las fechas y los enlaces son los mismos en los dos idiomas.`,
    primaryText: (primary) => `Texto ${primary}:`,
    copyPrimary: (primary) => `Copiar el texto ${primary} como punto de partida`,
    copied: 'Copiado. Ahora tradúcelo con tus palabras.',
    noMachine: 'Sin traducción automática: tú escribes cada versión.',
    missingBadge: (n, other) => (n === 1 ? `Falta 1 texto ${other}` : `Faltan ${n} textos ${other}`),
    complete: (other) => `Completo ${other}`,
    inLanguage: { 'es-MX': 'en español', en: 'en inglés' },
    languageCode: 'Idioma',
    languageCodeHint: 'Elígelo de la lista: cada documento escribe su nombre en su propio idioma («Inglés», «English»).',
    languageNone: 'Otro (escríbelo abajo)',
    languageNameHint: 'Se llena al elegir el idioma de la lista. Escríbelo solo si tu idioma no está en ella.',
    flag: {
      title: (n, language) => (n === 1 ? `Falta 1 texto ${language}` : `Faltan ${n} textos ${language}`),
      body: (language, primary) => `Donde falta el texto ${language}, el documento usa el texto ${primary}. Escríbelo en tu perfil:`,
      notPrinted: 'Este aviso no aparece en el documento impreso ni en la página publicada.',
      header: 'Quién eres',
      pickLanguage: 'elige el idioma de la lista',
      fix: 'Escribir',
    },
    overridesPerLanguage: (language) => `Estos ajustes son para los documentos ${language}. Al cambiar de idioma se guardan aparte y vuelven si regresas.`,
    importLanguage: {
      legend: 'Idioma del archivo',
      hint: (primary) => `Lo que importes llena el texto principal de tu perfil (${primary}).`,
      becomesPrimary: (language) => `Tu perfil está vacío: su idioma principal será ${language}.`,
      blocked: (primary, language) =>
        `Tu perfil ya está ${primary}. Para no mezclar idiomas, importa un archivo ${primary}, o escribe la versión ${language} en cada elemento de tu perfil con el selector «Texto en».`,
    },
    jsonResumeIn: { 'es-MX': 'JSON Resume en español', en: 'JSON Resume en inglés' },
    jsonResumeNote: 'JSON Resume guarda un solo idioma: lo que no tenga versión en ese idioma sale con el texto principal.',
  },
  en: {
    switchLegend: 'Text in',
    switchOption: { 'es-MX': 'Español', en: 'English' },
    primaryTag: '(main)',
    otherHint: (other, primary) =>
      `Write the version ${other} here. Documents ${other} use this text; where it is missing they use the text ${primary}, and we tell you before you print. Proper names (company, school), dates and links are the same in both languages.`,
    primaryText: (primary) => `Text ${primary}:`,
    copyPrimary: (primary) => `Copy the text ${primary} as a starting point`,
    copied: 'Copied. Now translate it in your own words.',
    noMachine: 'No automatic translation: you write each version.',
    missingBadge: (n, other) => (n === 1 ? `1 text missing ${other}` : `${n} texts missing ${other}`),
    complete: (other) => `Complete ${other}`,
    inLanguage: { 'es-MX': 'in Spanish', en: 'in English' },
    languageCode: 'Language',
    languageCodeHint: 'Pick it from the list: each document writes its name in its own language (“Inglés”, “English”).',
    languageNone: 'Other (write it below)',
    languageNameHint: 'Filled in when you pick the language from the list. Write it only if your language is not there.',
    flag: {
      title: (n, language) => (n === 1 ? `1 text missing ${language}` : `${n} texts missing ${language}`),
      body: (language, primary) => `Where the text ${language} is missing, the document uses the text ${primary}. Write it in your profile:`,
      notPrinted: 'This notice is not part of the printed document or the published page.',
      header: 'About you',
      pickLanguage: 'pick the language from the list',
      fix: 'Write it',
    },
    overridesPerLanguage: (language) => `These adjustments are for the documents ${language}. When you switch language they are kept apart and come back if you return.`,
    importLanguage: {
      legend: 'Language of the file',
      hint: (primary) => `What you import fills your profile’s main text (${primary}).`,
      becomesPrimary: (language) => `Your profile is empty: its main language will be ${language}.`,
      blocked: (primary, language) =>
        `Your profile is already ${primary}. To keep languages apart, import a file ${primary}, or write the version ${language} on each profile item with the “Text in” switch.`,
    },
    jsonResumeIn: { 'es-MX': 'JSON Resume in Spanish', en: 'JSON Resume in English' },
    jsonResumeNote: 'JSON Resume holds one language: anything without a version in that language comes out in the main text.',
  },
};
