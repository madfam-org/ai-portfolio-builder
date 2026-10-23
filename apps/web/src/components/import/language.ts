/**
 * W7 (B4): what an import does with the language of its file (the person picks it; it is never guessed). An import
 * always fills the profile's MAIN text:
 * - `same`: the file is in the profile's primary language: as before;
 * - `becomes_primary`: the profile is empty: the file's language becomes the primary one (said before anything is sent);
 * - `blocked`: refused with the reason, so two languages never mix in the main text.
 */
import type { ContentLocale } from '../../lib/profile-text.ts';

export type ImportLanguagePlan = 'same' | 'becomes_primary' | 'blocked';

export function importLanguagePlan(fileLocale: ContentLocale, primary: ContentLocale, profileEmpty: boolean): ImportLanguagePlan {
  if (fileLocale === primary) return 'same';
  return profileEmpty ? 'becomes_primary' : 'blocked';
}
