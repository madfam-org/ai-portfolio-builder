/**
 * Strings of the jobs pipeline and the tailoring workspace (`/empleos/...`). Owner: W3-3. Seeded by W3-1; job status
 * labels live in copy/app.ts (shared).
 */
import type { Locale } from '../routing.ts';

export interface JobsCopy {
  intro: string;
  /** The match is a keyword overlap, never called AI (lane X §5, PR W3-3). */
  matchLabel: string;
}

export const JOBS_COPY: Record<Locale, JobsCopy> = {
  es: { intro: 'Las vacantes a las que te postulas, una por una.', matchLabel: 'Coincidencia por palabras clave (sin IA)' },
  en: { intro: 'The jobs you apply to, one by one.', matchLabel: 'Keyword match (no AI)' },
};
