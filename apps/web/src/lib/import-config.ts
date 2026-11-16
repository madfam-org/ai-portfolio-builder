/**
 * Switches for the profile import (components/import/). Pure: takes the environment, reads nothing at import.
 *
 * `CV_IMPORT_LINKEDIN_PDF`: the import of the person's own LinkedIn profile PDF («Guardar como PDF» / «Save to PDF»;
 * components/import/linkedin-pdf.ts). DORMANT BY DEFAULT: on only for `1`, `true` or `on`; anything else, including a
 * typo, keeps it off, and the import panel then shows only the ZIP and JSON Resume sources, exactly as before.
 */
type Env = Readonly<Record<string, string | undefined>>;

export const IMPORT_ENV_KEYS = ['CV_IMPORT_LINKEDIN_PDF'] as const;

export function linkedInPdfImportEnabled(env: Env): boolean {
  const v = env.CV_IMPORT_LINKEDIN_PDF?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}
