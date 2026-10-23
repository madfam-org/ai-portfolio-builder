/**
 * The language cv asks Janua to show its hosted sign-in pages in (OIDC `ui_locales`, B1 2026-10-22). Janua renders
 * es-MX or English; anything it cannot render falls back to English there. Spanish is the default (es-MX is the
 * source locale); a sign-in started from an English page (`/en`, `/en/...`) asks for English.
 */
import type { Locale } from './routing.ts';

export const JANUA_UI_LOCALES: Readonly<Record<Locale, string>> = { es: 'es-MX', en: 'en' };

/** The page locale of an app path (`redirect_to`): English only under `/en`. */
export function localeOfAppPath(path: string): Locale {
  return path === '/en' || path.startsWith('/en/') ? 'en' : 'es';
}

/** `ui_locales` for a sign-in that returns to `path`. */
export function uiLocalesFor(path: string): string {
  return JANUA_UI_LOCALES[localeOfAppPath(path)];
}
