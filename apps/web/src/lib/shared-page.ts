/**
 * What a shared page receives (the pages host, and cv-api's two public reads that serve it): exactly the data its
 * renderer prints, in the document's own language, and nothing else.
 *
 * - The document's title is not carried: it is the owner's private label and often names the employer applied to
 *   (components/render/model.ts never prints it; AGENTS.md «A document's title is private»).
 * - The document's content is projected to exactly what the renderer of its kind reads (`projectContent`): references to
 *   items that are not in the data (deleted since) and the overrides on them are dropped; overrides carry only the
 *   fields the renderer applies (none for a recommendation, only the title in a cover letter); a cover letter carries
 *   only the roles and projects it lists, and its own body (`content.body`) in place of any summary when it has one; a
 *   presentation with slides of its own carries those slides and not the text
 *   blocks; `intro` only on a portfolio, `greeting`/`closing` only on a cover letter, the summary only where it is
 *   printed; `showContact` and any other stored field are not carried (the contact itself is, when shown). Only the
 *   items the projected content references are carried.
 * - A document with its own summary prints that summary, so the profile's summary is not carried (an empty string);
 *   nor is it on a presentation (never printed) or a portfolio with an intro (the intro is printed instead).
 * - Text is already in the document's language: each field with a translation in that language carries the
 *   translation in place of the primary text (lib/profile-text.ts localizeItem / localizeHeader, the same functions the
 *   renderer runs), and neither the translations nor the profile's primary language are carried. A field without a
 *   translation carries the primary text, which is what the page prints for it.
 *
 * The renderer draws the same markup from this as from the owner's full data (test/shared-page.test.ts compares both
 * over the render matrix and the render baseline). Pure: no server or React import here.
 */
import { LETTER_ENTRIES, LETTER_KINDS, artifactKind, isItemKind, letterBody, readContent, str, type RenderData } from '../components/render/model.ts';
import type { ArtifactContent } from '../server/api/validation.ts';
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

type Ref = ArtifactContent['items'][number];
type Override = NonNullable<Ref['override']>;

/** The content a shared page carries, and whether it prints the profile's summary (components/render/model.ts). */
export interface ProjectedContent {
  content: Record<string, unknown>;
  printsProfileSummary: boolean;
}

/**
 * The stored content reduced to what the renderer of its kind reads. `itemKinds` maps the ids of the items in the data
 * to their kind. Values are read the way `buildDocModel` reads them (`readContent`, `str`), so every renderer draws
 * the same markup from the projection as from the stored content (test/shared-page.test.ts).
 */
export function projectContent(kindRaw: string, raw: unknown, itemKinds: ReadonlyMap<string, string>): ProjectedContent {
  const kind = artifactKind(kindRaw);
  const c = readContent(raw);
  const stored = rec(raw);
  const kindOf = (id: string): ItemKind | null => {
    const k = itemKinds.get(id);
    return k !== undefined && isItemKind(k) ? k : null;
  };
  // buildDocModel keeps the LAST override given for an id (a Map over every reference, even one without an override).
  const overrides = new Map(c.items.map((r) => [r.itemId, r.override]));
  const overrideFor = (id: string): Override | undefined => {
    const o = overrides.get(id);
    const k = kindOf(id);
    if (!o || !k || k === 'recommendation') return undefined; // a recommendation is never overridden (buildEntry)
    if (kind === 'cover_letter') return o.title === undefined ? undefined : { title: o.title }; // the letter prints titles only
    return o;
  };
  const ref = (id: string): Ref => {
    const o = overrideFor(id);
    return { itemId: id, ...(o ? { override: o } : {}) };
  };
  const present = c.items.filter((r) => kindOf(r.itemId) !== null);
  const blocks = c.blocks.map((b) => ({ ...(b.heading === undefined ? {} : { heading: b.heading }), body: b.body }));
  const summary = c.summary === undefined ? {} : { summary: c.summary };

  switch (kind) {
    case 'cv':
      return { content: { ...summary, items: present.map((r) => ref(r.itemId)), blocks }, printsProfileSummary: c.summary === undefined };
    case 'portfolio': {
      // The portfolio prints `intro`, else the summary (its own, else the profile's).
      const intro = str(stored.intro);
      const items = present.map((r) => ref(r.itemId));
      if (intro) return { content: { intro, items, blocks }, printsProfileSummary: false };
      return { content: { ...summary, items, blocks }, printsProfileSummary: c.summary === undefined };
    }
    case 'presentation': {
      // No summary or intro on any slide. Slides of its own replace the selection and the text blocks.
      const slides = c.slides ?? [];
      if (slides.length === 0) return { content: { items: present.map((r) => ref(r.itemId)), blocks }, printsProfileSummary: false };
      const kept = slides.map((sl) => ({ title: sl.title, ...(sl.body === undefined ? {} : { body: sl.body }), itemIds: sl.itemIds.filter((id) => kindOf(id) !== null) }));
      const shown = [...new Set(kept.flatMap((sl) => sl.itemIds))];
      const items = shown.filter((id) => overrideFor(id) !== undefined).map(ref);
      return { content: { items, slides: kept }, printsProfileSummary: false };
    }
    case 'cover_letter': {
      // The letter lists the first roles and projects in section order (kinds by first appearance, then selection order).
      const byKind = new Map<ItemKind, Ref[]>();
      for (const r of present) {
        const k = kindOf(r.itemId)!;
        byKind.set(k, [...(byKind.get(k) ?? []), r]);
      }
      const listed = [...byKind.values()].flat().filter((r) => LETTER_KINDS.has(kindOf(r.itemId)!)).slice(0, LETTER_ENTRIES);
      const greeting = str(stored.greeting);
      const closing = str(stored.closing);
      // A body of its own prints between greeting and closing in place of any summary (model.ts letterBody: null when
      // absent or blank, and then the letter prints the summary as before). The body is carried as stored.
      const body = letterBody(stored.body) === null ? null : stored.body;
      return {
        content: {
          ...(greeting ? { greeting } : {}),
          ...(body === null ? summary : { body }),
          items: listed.map((r) => ref(r.itemId)),
          blocks,
          ...(closing ? { closing } : {}),
        },
        printsProfileSummary: body === null && c.summary === undefined,
      };
    }
  }
}

/** Every item id a projected content references (its items and its slides). */
function referencedIds(content: Record<string, unknown>): Set<string> {
  const items = (content.items ?? []) as Ref[];
  const slides = (content.slides ?? []) as { itemIds: string[] }[];
  return new Set([...items.map((r) => r.itemId), ...slides.flatMap((sl) => sl.itemIds)]);
}

/**
 * The shared page's data from the owner's render data (components/render/model.ts ownerRenderData's shape: only the
 * referenced items, and the contact only when the document shows it).
 */
export function sharedRenderData(data: RenderData): SharedRenderData {
  const target = contentLocale(data.artifact.locale);
  const primary = contentLocale(data.profile.locale);
  const raw = rec(data.artifact.content);
  // A cover letter's own body replaces every summary, so the profile's summary is not counted as printed text.
  const ownSummary = str(raw.summary) !== null || (artifactKind(data.artifact.kind) === 'cover_letter' && letterBody(raw.body) !== null);
  const projected = projectContent(data.artifact.kind, data.artifact.content, new Map(data.items.map((i) => [i.id, i.kind])));
  const carried = referencedIds(projected.content);

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
    summary: projected.printsProfileSummary ? header.summary : '',
    ...(data.profile.contact === undefined ? {} : { contact: contact && location !== undefined ? { ...contact, location: header.location } : data.profile.contact }),
  };

  const items = data.items.filter((item) => carried.has(item.id)).map((item) => {
    const known = Object.hasOwn(ITEM_TEXT_FIELDS, item.kind);
    const content = known ? localizeItem(item.kind as ItemKind, item.content, item.translations, primary, target).content : item.content;
    return { id: item.id, kind: item.kind, content };
  });

  return {
    artifact: { kind: data.artifact.kind, locale: data.artifact.locale, template: data.artifact.template, content: projected.content },
    profile,
    items,
  };
}
