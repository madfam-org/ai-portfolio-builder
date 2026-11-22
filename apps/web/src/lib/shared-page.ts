/**
 * What a shared page receives (the pages host, and cv-api's two public reads that serve it): exactly the data its
 * renderer prints, in the document's own language, and nothing else.
 *
 * - The document's title is not carried: it is the owner's private label and often names the employer applied to
 *   (components/render/model.ts never prints it; AGENTS.md «A document's title is private»).
 * - A document with its own summary prints that summary, so the profile's summary is not carried (an empty string).
 * - Text is already in the document's language: each field with a translation in that language carries the
 *   translation in place of the primary text (lib/profile-text.ts localizeItem / localizeHeader, the same functions the
 *   renderer runs), and neither the translations nor the profile's primary language are carried. A field without a
 *   translation carries the primary text, which is what the page prints for it.
 *
 * The renderer draws the same markup from this as from the owner's full data (test/shared-page.test.ts compares both
 * over the render matrix and the render baseline). Pure: no server or React import here.
 */
import type { RenderData } from '../components/render/model.ts';
import type { ItemKind } from './copy/app.ts';
import { ITEM_TEXT_FIELDS, contentLocale, localizeHeader, localizeItem } from './profile-text.ts';

/** The profile header a shared page carries: no primary language, no translations. */
export interface SharedProfile {
  displayName: string;
  headline: string;
  summary: string;
  contact?: unknown;
}

export interface SharedRenderData {
  artifact: RenderData['artifact'];
  profile: SharedProfile;
  items: { id: string; kind: string; content: unknown }[];
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const nonBlank = (v: unknown) => typeof v === 'string' && v.trim() !== '';

/**
 * The shared page's data from the owner's render data (components/render/model.ts ownerRenderData's shape: only the
 * referenced items, and the contact only when the document shows it).
 */
export function sharedRenderData(data: RenderData): SharedRenderData {
  const target = contentLocale(data.artifact.locale);
  const primary = contentLocale(data.profile.locale);
  const ownSummary = nonBlank(rec(data.artifact.content).summary);

  const contact = data.profile.contact === undefined || data.profile.contact === null ? null : rec(data.profile.contact);
  const location = contact && typeof contact.location === 'string' ? contact.location : undefined;
  const { header } = localizeHeader(
    { headline: data.profile.headline, summary: data.profile.summary, ...(location === undefined ? {} : { location }) },
    data.profile.translations,
    primary,
    target,
    ownSummary,
  );

  const profile: SharedProfile = {
    displayName: data.profile.displayName,
    headline: header.headline,
    summary: ownSummary ? '' : header.summary,
    ...(data.profile.contact === undefined ? {} : { contact: contact && location !== undefined ? { ...contact, location: header.location } : data.profile.contact }),
  };

  const items = data.items.map((item) => {
    const known = Object.hasOwn(ITEM_TEXT_FIELDS, item.kind);
    const content = known ? localizeItem(item.kind as ItemKind, item.content, item.translations, primary, target).content : item.content;
    return { id: item.id, kind: item.kind, content };
  });

  return {
    artifact: { kind: data.artifact.kind, locale: data.artifact.locale, template: data.artifact.template, content: data.artifact.content },
    profile,
    items,
  };
}
