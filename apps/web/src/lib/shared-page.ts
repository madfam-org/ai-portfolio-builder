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
 * - Each carried item carries only the fields its drawing prints (`projectItem`): a cover letter's role or project its
 *   title, organisation and dates (no summary, highlights or links); a skill, language or link in a compact list its
 *   name and line (a link its label and address); a full entry also its summary, highlights and links, less any field a
 *   per-job override replaces (the summary, the highlights, and the fields only the title reads). Nothing else stored
 *   on an item travels (a language's ISO code neither: its name already arrives in the document's language).
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
import { COMPACT_KINDS, LETTER_ENTRIES, LETTER_KINDS, artifactKind, isItemKind, letterBody, readContent, str, type RenderData } from '../components/render/model.ts';
import type { ArtifactContent } from '../server/api/validation.ts';
import type { ArtifactKind, ItemKind } from './copy/app.ts';
import { contentLocale, localizeHeader, localizeItem } from './profile-text.ts';

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

/** How an item is drawn: a full entry, a line of a compact list, or one of a cover letter's short entries. */
export type Drawn = 'entry' | 'compact' | 'letter';

const SPAN = ['startDate', 'endDate', 'current'] as const;

/**
 * Per item kind, the content fields `buildEntry` (components/render/model.ts) reads for an entry's title, line and
 * dates: all that a compact list or a cover letter prints of an item. A full entry also reads the summary, the
 * highlights and the links (`ENTRY_TEXT`, `ENTRY_LINKS`), on every kind but a recommendation, whose entry is these
 * fields alone (the recommender's words are its `text`).
 */
const HEAD_FIELDS: Record<ItemKind, readonly string[]> = {
  experience: ['role', 'organization', 'employmentType', 'location', ...SPAN],
  volunteering: ['role', 'organization', 'employmentType', 'location', ...SPAN],
  education: ['degree', 'field', 'institution', ...SPAN],
  project: ['name', 'role', ...SPAN],
  skill: ['name', 'level', 'years'],
  language: ['name', 'level'],
  certification: ['name', 'issuer', 'date', 'expiresOn', 'credentialId'],
  publication: ['title', 'publisher', 'date'],
  achievement: ['title', 'issuer', 'date'],
  award: ['title', 'issuer', 'date'],
  link: ['label', 'url'],
  recommendation: ['name', 'role', 'organization', 'relationship', 'date', 'text'],
};
const ENTRY_LINKS = ['url', 'links'] as const;

/**
 * The fields only an entry's title reads, which a per-job title replaces. An education's degree and field also decide
 * whether its institution prints, and a link's label is its link's text: those stay.
 */
const TITLE_ONLY: Partial<Record<ItemKind, readonly string[]>> = {
  experience: ['role'],
  volunteering: ['role'],
  project: ['name'],
  skill: ['name'],
  language: ['name'],
  certification: ['name'],
  publication: ['title'],
  achievement: ['title'],
  award: ['title'],
};

/** The content fields an item of `kind`, drawn as `drawn` with `override` applied, prints (components/render). */
export function printedFields(kind: ItemKind, drawn: Drawn, override: Override | undefined): Set<string> {
  const fields = new Set(HEAD_FIELDS[kind]);
  if (drawn === 'entry' && kind !== 'recommendation') {
    if (override?.summary === undefined) fields.add('summary');
    if (override?.highlights === undefined) fields.add('highlights');
    if (kind !== 'link') for (const f of ENTRY_LINKS) fields.add(f);
  }
  if (override?.title !== undefined) for (const f of TITLE_ONLY[kind] ?? []) fields.delete(f);
  return fields;
}

/** An item's content reduced to the fields its drawing prints, in the stored order. */
export function projectItem(kind: ItemKind, drawn: Drawn, override: Override | undefined, content: unknown): Record<string, unknown> {
  const fields = printedFields(kind, drawn, override);
  return Object.fromEntries(Object.entries(rec(content)).filter(([k]) => fields.has(k)));
}

/**
 * How each item a projected content references is drawn (components/render/*View.tsx): every item of a cover letter is
 * one of its short entries; elsewhere a skill, language or link is a line of a compact list, except on a presentation's
 * own slide that also shows another kind, where every item is a full entry (as is every item of any other kind).
 */
function drawnAs(kind: ArtifactKind, content: Record<string, unknown>, kindOf: (id: string) => ItemKind | null): Map<string, Drawn> {
  const drawn = new Map<string, Drawn>();
  const mark = (id: string, how: Drawn) => {
    if (drawn.get(id) !== 'entry') drawn.set(id, how);
  };
  const items = (content.items ?? []) as Ref[];
  const slides = (content.slides ?? []) as { itemIds: string[] }[];
  if (kind === 'cover_letter') {
    for (const r of items) mark(r.itemId, 'letter');
  } else if (kind === 'presentation' && slides.length > 0) {
    for (const sl of slides) {
      const compact = sl.itemIds.every((id) => COMPACT_KINDS.has(kindOf(id)!));
      for (const id of sl.itemIds) mark(id, compact ? 'compact' : 'entry');
    }
  } else {
    for (const r of items) mark(r.itemId, COMPACT_KINDS.has(kindOf(r.itemId)!) ? 'compact' : 'entry');
  }
  return drawn;
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

  // Only items of a kind the renderers draw are referenced (projectContent), so every carried item has a known kind.
  const itemKinds = new Map(data.items.map((i) => [i.id, i.kind]));
  const kindOf = (id: string): ItemKind | null => {
    const k = itemKinds.get(id);
    return k !== undefined && isItemKind(k) ? k : null;
  };
  const drawn = drawnAs(artifactKind(data.artifact.kind), projected.content, kindOf);
  const overrides = new Map(((projected.content.items ?? []) as Ref[]).map((r) => [r.itemId, r.override]));
  const items = data.items.filter((item) => carried.has(item.id) && isItemKind(item.kind)).map((item) => {
    const kind = item.kind as ItemKind;
    const localized = localizeItem(kind, item.content, item.translations, primary, target).content;
    return { id: item.id, kind: item.kind, content: projectItem(kind, drawn.get(item.id) ?? 'entry', overrides.get(item.id), localized) };
  });

  return {
    artifact: { kind: data.artifact.kind, locale: data.artifact.locale, template: data.artifact.template, content: projected.content },
    profile,
    items,
  };
}
