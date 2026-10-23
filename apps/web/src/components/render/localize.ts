/**
 * W7 (B4): the render data in the DOCUMENT's language (lib/profile-text.ts). Runs first in `buildDocModel`, so every
 * renderer (CV, portfolio, presentation, cover letter; preview, print and pages host) draws the same localized data:
 *
 * - a document in the profile's primary language reads the stored text as it is (no translation is looked at);
 * - a document in the other language reads each translated field, and falls back to the primary text where there is
 *   none: that field is returned in `missing` (the preview and the tailoring workspace flag it; nothing is printed);
 * - per-job overrides win over both, and a field an override replaces is never reported missing;
 * - a language item with an ISO 639 code prints the code's name in the document's language.
 *
 * Without translations and codes the returned data is the input itself (same objects), so the markup is unchanged.
 */
import type { ItemKind } from '../../lib/copy/app.ts';
import { contentLocale, localizeHeader, localizeItem, type ContentLocale } from '../../lib/profile-text.ts';
import { itemHeading } from '../profile/fields.ts';
import type { RenderData } from './model.ts';

const ITEM_KINDS: readonly string[] = ['experience', 'education', 'skill', 'project', 'certification', 'achievement', 'language', 'publication', 'volunteering', 'award', 'link'];

/** One field of the document that falls back to the primary language. `itemId` null: the header. */
export interface MissingText {
  itemId: string | null;
  kind: ItemKind | 'header';
  /** The item's name in the primary language (what the person recognises in the profile); '' for the header. */
  title: string;
  fields: string[];
}

export interface Localized {
  data: RenderData;
  /** The document's language and the profile's primary language. */
  target: ContentLocale;
  primary: ContentLocale;
  missing: MissingText[];
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const nonBlank = (v: unknown) => typeof v === 'string' && v.trim() !== '';

export function localizeRenderData(data: RenderData): Localized {
  const target = contentLocale(data.artifact.locale);
  const primary = contentLocale(data.profile.locale);
  const content = rec(data.artifact.content);
  const overrides = new Map(
    (Array.isArray(content.items) ? content.items : []).map(rec).filter((i) => typeof i.itemId === 'string').map((i) => [i.itemId as string, rec(i.override)] as const),
  );
  const missing: MissingText[] = [];
  // Only what the document shows is reported (its items and its slides' items).
  const shown = new Set([
    ...overrides.keys(),
    ...(Array.isArray(content.slides) ? content.slides : []).flatMap((sl) => (Array.isArray(rec(sl).itemIds) ? (rec(sl).itemIds as unknown[]) : [])).filter((id): id is string => typeof id === 'string'),
  ]);

  const contact = data.profile.contact === undefined || data.profile.contact === null ? null : rec(data.profile.contact);
  const location = contact && typeof contact.location === 'string' ? contact.location : undefined;
  const head = localizeHeader(
    { headline: data.profile.headline, summary: data.profile.summary, ...(location === undefined ? {} : { location }) },
    data.profile.translations,
    primary,
    target,
    nonBlank(content.summary),
  );
  if (head.missing.length) missing.push({ itemId: null, kind: 'header', title: '', fields: head.missing });
  let profile = data.profile;
  if (head.header.headline !== profile.headline || head.header.summary !== profile.summary || head.header.location !== location) {
    profile = { ...profile, headline: head.header.headline, summary: head.header.summary, ...(contact ? { contact: { ...contact, location: head.header.location } } : {}) };
  }

  let changed = false;
  const items = data.items.map((item) => {
    if (!ITEM_KINDS.includes(item.kind)) return item;
    const kind = item.kind as ItemKind;
    const o = overrides.get(item.id);
    const override = o ? { title: typeof o.title === 'string' ? o.title : undefined, summary: typeof o.summary === 'string' ? o.summary : undefined, highlights: Array.isArray(o.highlights) ? (o.highlights as string[]) : undefined } : undefined;
    const r = localizeItem(kind, item.content, item.translations, primary, target, override);
    if (r.missing.length && shown.has(item.id)) missing.push({ itemId: item.id, kind, title: itemHeading(kind, rec(item.content)).title, fields: r.missing });
    if (r.content === item.content) return item;
    changed = true;
    return { ...item, content: r.content };
  });

  if (profile === data.profile && !changed) return { data, target, primary, missing };
  return { data: { ...data, profile, items }, target, primary, missing };
}

/** How many fields of a document fall back to the primary language (the flag's N). */
export function missingCount(missing: readonly MissingText[]): number {
  return missing.reduce((n, m) => n + m.fields.length, 0);
}
