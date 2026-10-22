/**
 * Strings the artifact renderers print (cv, portfolio, presentation, cover letter), shared by the cv-app preview and
 * the pages host. Owner: W3-4. Seeded by W3-1 for the minimal renderer in components/render/ArtifactView.tsx.
 */
import type { Locale } from '../routing.ts';

export interface RenderCopy {
  present: string;
  contact: string;
}

export const RENDER_COPY: Record<Locale, RenderCopy> = {
  es: { present: 'Actualidad', contact: 'Contacto' },
  en: { present: 'Present', contact: 'Contact' },
};
