/**
 * Strings of the core-profile editor (`/perfil`). Owner: W3-2. Seeded by W3-1 with the page's own heading only;
 * item kind labels live in copy/app.ts (shared with the renderers and the tailoring workspace).
 */
import type { Locale } from '../routing.ts';

export interface ProfileCopy {
  intro: string;
}

export const PROFILE_COPY: Record<Locale, ProfileCopy> = {
  es: { intro: 'Tu perfil central: lo capturas una vez y lo reutilizas en cada postulación.' },
  en: { intro: 'Your core profile: enter it once and reuse it in every application.' },
};
