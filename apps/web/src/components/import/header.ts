/**
 * The header part of an import preview: which of the person's header fields the import could fill, which are
 * preselected (only the ones empty today), which would replace a value, and the `profile` patch of the batch call.
 */
import type { ImportHeader } from './model.ts';

export const HEADER_KEYS = ['displayName', 'headline', 'summary', 'email', 'phone', 'location', 'links'] as const;
export type HeaderKey = (typeof HEADER_KEYS)[number];

interface CurrentProfile {
  displayName?: string;
  headline?: string;
  summary?: string;
  contact?: { email?: string; phone?: string; location?: string; links?: { label: string; url: string }[] };
}

export interface HeaderChoice {
  key: HeaderKey;
  /** What the preview shows. */
  display: string;
  /** Checked at first: the profile has nothing there today. */
  preselected: boolean;
  /** Checking it replaces a value the profile has (links never replace: new ones are added). */
  replaces: boolean;
}

const MAX_DISPLAY = 160;
const short = (v: string) => (v.length > MAX_DISPLAY ? `${v.slice(0, MAX_DISPLAY - 1)}…` : v);

function current(profile: CurrentProfile | null, key: HeaderKey): string {
  if (!profile) return '';
  if (key === 'displayName' || key === 'headline' || key === 'summary') return profile[key] ?? '';
  if (key === 'links') return '';
  return profile.contact?.[key] ?? '';
}

/** One choice per header field the import has a value for (links: only those not already in the profile). */
export function headerChoices(header: ImportHeader, profile: CurrentProfile | null): HeaderChoice[] {
  const out: HeaderChoice[] = [];
  for (const key of HEADER_KEYS) {
    if (key === 'links') {
      const have = new Set((profile?.contact?.links ?? []).map((l) => l.url));
      const fresh = (header.contact.links ?? []).filter((l) => !have.has(l.url));
      if (fresh.length) out.push({ key, display: short(fresh.map((l) => l.url).join(', ')), preselected: true, replaces: false });
      continue;
    }
    const value = key === 'displayName' || key === 'headline' || key === 'summary' ? header[key] : header.contact[key];
    if (!value) continue;
    const now = current(profile, key);
    if (now === value) continue;
    out.push({ key, display: short(value), preselected: now === '', replaces: now !== '' });
  }
  return out;
}

/** The batch call's `profile` from the checked keys, or null when none is checked. */
export function headerPatch(
  header: ImportHeader,
  checked: ReadonlySet<HeaderKey>,
): { displayName?: string; headline?: string; summary?: string; contact?: ImportHeader['contact'] } | null {
  const patch: { displayName?: string; headline?: string; summary?: string; contact?: ImportHeader['contact'] } = {};
  const contact: ImportHeader['contact'] = {};
  for (const key of checked) {
    if (key === 'displayName' || key === 'headline' || key === 'summary') {
      if (header[key]) patch[key] = header[key];
    } else if (key === 'links') {
      if (header.contact.links?.length) contact.links = header.contact.links;
    } else if (header.contact[key]) {
      contact[key] = header.contact[key];
    }
  }
  if (Object.keys(contact).length) patch.contact = contact;
  return Object.keys(patch).length ? patch : null;
}
