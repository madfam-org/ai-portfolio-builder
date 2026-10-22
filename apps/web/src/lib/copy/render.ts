/**
 * Strings of the artifact renderers (cv, portfolio, presentation, cover letter; shared by the cv-app preview, the
 * print view and the pages host). es-MX source, en. Owner: W3-4.
 *
 * Truth rules (R85): the renderers print only what the person entered; these strings are labels, never content.
 * Level words replace the legacy percentage bars (lane X §1.3).
 */
import type { Locale } from '../routing.ts';

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';
export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'freelance' | 'internship' | 'volunteer' | 'other';

export interface RenderCopy {
  /** `Intl` locale of dates printed in a document of this language. */
  intl: string;
  present: string;
  contact: string;
  summary: string;
  skillLevels: Record<SkillLevel, string>;
  /** CEFR codes stay as they are; only «native» is a word. */
  native: string;
  employmentTypes: Record<EmploymentType, string>;
  years: (n: number) => string;
  expires: string;
  credential: string;
  relevant: string;
  deckLabel: string;
  previous: string;
  next: string;
  /** «Diapositiva {n} de {total}». */
  position: string;
  keyboardHint: string;
}

export const RENDER_COPY: Record<Locale, RenderCopy> = {
  es: {
    intl: 'es-MX',
    present: 'Actualidad',
    contact: 'Contacto',
    summary: 'Perfil profesional',
    skillLevels: { beginner: 'Básico', intermediate: 'Intermedio', advanced: 'Avanzado', expert: 'Experto' },
    native: 'Nativo',
    employmentTypes: {
      full_time: 'Tiempo completo',
      part_time: 'Medio tiempo',
      contract: 'Por contrato',
      freelance: 'Independiente',
      internship: 'Prácticas',
      volunteer: 'Voluntariado',
      other: 'Otro',
    },
    years: (n) => (n === 1 ? '1 año' : `${n} años`),
    expires: 'Vence',
    credential: 'Folio',
    relevant: 'Experiencia relevante',
    deckLabel: 'Presentación',
    previous: 'Anterior',
    next: 'Siguiente',
    position: 'Diapositiva {n} de {total}',
    keyboardHint: 'Usa las flechas ← y →, la barra espaciadora, Inicio o Fin para moverte entre diapositivas.',
  },
  en: {
    intl: 'en-US',
    present: 'Present',
    contact: 'Contact',
    summary: 'Summary',
    skillLevels: { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', expert: 'Expert' },
    native: 'Native',
    employmentTypes: {
      full_time: 'Full-time',
      part_time: 'Part-time',
      contract: 'Contract',
      freelance: 'Freelance',
      internship: 'Internship',
      volunteer: 'Volunteer',
      other: 'Other',
    },
    years: (n) => (n === 1 ? '1 year' : `${n} years`),
    expires: 'Expires',
    credential: 'Credential ID',
    relevant: 'Relevant experience',
    deckLabel: 'Presentation',
    previous: 'Previous',
    next: 'Next',
    position: 'Slide {n} of {total}',
    keyboardHint: 'Use the ← and → arrows, the space bar, Home or End to move between slides.',
  },
};

/** Print paper of the CV, letter and portfolio (the print view's toggle; named CSS pages in render.module.css). */
export type Paper = 'letter' | 'a4';

/** «Diapositiva {n} de {total}». */
export function slidePosition(locale: Locale, n: number, total: number): string {
  return RENDER_COPY[locale].position.replace('{n}', String(n)).replace('{total}', String(total));
}
