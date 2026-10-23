/**
 * The document model every renderer draws: a PURE function of the artifact's content (ordered profile-item ids,
 * per-item overrides, text blocks, slides) resolved against the owner's profile on the server. Shared by the cv-app
 * preview and print view and by the pages host, so what the owner previews is what a visitor gets.
 *
 * Truth rules (R85, lane X §1.3, §4): nothing is invented. An absent field yields nothing (never «undefined», never a
 * placeholder); skill levels are words, never percentages; a referenced item that is not in the data (deleted since,
 * or not the owner's) is skipped. Links: http(s) only (anything else is dropped); e-mail and phone become `mailto:` and
 * `tel:` here, and only when the projection carries the contact (the artifact's `showContact`).
 */
import type { ArtifactContent } from '../../server/api/validation.ts';
import type { ArtifactKind, ItemKind } from '../../lib/copy/app.ts';
import { APP_COPY } from '../../lib/copy/app.ts';
import { RENDER_COPY, type EmploymentType, type SkillLevel } from '../../lib/copy/render.ts';
import type { Locale } from '../../lib/routing.ts';
import { localizeRenderData } from './localize.ts';

type Rec = Record<string, unknown>;

/** What a renderer receives: the public projection's shape (server/db/repository.ts PublicArtifact). */
export interface RenderData {
  artifact: { kind: string; title: string; locale: string; template: string; content: unknown };
  /** W7 (B4): `locale` is the profile's primary language (absent: es-MX); `translations` its other-language text. */
  profile: { displayName: string; headline: string; summary: string; contact?: unknown; locale?: string; translations?: unknown };
  items: { id: string; kind: string; content: unknown; translations?: unknown }[];
}

export interface DocLink {
  href: string;
  /** What the reader sees: the person's label, else the address without its scheme. */
  text: string;
  /** The destination host, shown next to a label (lane X §4.2). */
  host: string | null;
}

export interface Entry {
  id: string;
  kind: ItemKind;
  title: string | null;
  subtitle: string | null;
  meta: string[];
  dates: string | null;
  summary: string | null;
  highlights: string[];
  links: DocLink[];
}

export interface Section {
  kind: ItemKind;
  heading: string;
  /** Skills, languages and links read best as one compact list. */
  compact: boolean;
  entries: Entry[];
}

export interface Slide {
  title: string | null;
  body: string | null;
  entries: Entry[];
}

export interface DocModel {
  kind: ArtifactKind;
  template: string;
  locale: Locale;
  title: string;
  name: string | null;
  headline: string | null;
  summary: string | null;
  intro: string | null;
  contact: { location: string | null; email: DocLink | null; phone: { text: string; href: string | null } | null; links: DocLink[] } | null;
  sections: Section[];
  blocks: { heading: string | null; body: string }[];
  slides: Slide[];
  greeting: string | null;
  closing: string | null;
}

const ITEM_KINDS: readonly ItemKind[] = ['experience', 'education', 'skill', 'project', 'certification', 'achievement', 'language', 'publication', 'volunteering', 'award', 'link'];
const ARTIFACT_KINDS: readonly ArtifactKind[] = ['cv', 'portfolio', 'presentation', 'cover_letter'];
const COMPACT: ReadonlySet<ItemKind> = new Set(['skill', 'language', 'link']);

export const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter((s): s is string => s !== null) : []);
const join = (parts: (string | null | undefined)[], sep: string): string | null => {
  const kept = parts.filter((p): p is string => !!p);
  return kept.length ? kept.join(sep) : null;
};

export function renderLocale(contentLocale: string): Locale {
  return contentLocale === 'en' ? 'en' : 'es';
}

export function artifactKind(kind: string): ArtifactKind {
  return (ARTIFACT_KINDS as readonly string[]).includes(kind) ? (kind as ArtifactKind) : 'cv';
}

/** The content as stored, read defensively (validated on write; a renderer never trusts shape alone). */
export function readContent(raw: unknown): ArtifactContent {
  const c = rec(raw);
  const items = (Array.isArray(c.items) ? c.items : [])
    .map(rec)
    .filter((i) => typeof i.itemId === 'string')
    .map((i) => {
      const o = rec(i.override);
      const override: NonNullable<ArtifactContent['items'][number]['override']> = {};
      if (str(o.title)) override.title = str(o.title)!;
      if (str(o.summary)) override.summary = str(o.summary)!;
      if (Array.isArray(o.highlights)) override.highlights = strings(o.highlights);
      return { itemId: i.itemId as string, ...(Object.keys(override).length ? { override } : {}) };
    });
  const blocks = (Array.isArray(c.blocks) ? c.blocks : []).map(rec).filter((b) => str(b.body) || str(b.heading)).map((b) => ({ heading: str(b.heading) ?? undefined, body: str(b.body) ?? '' }));
  const slides = (Array.isArray(c.slides) ? c.slides : []).map(rec).map((s) => ({ title: str(s.title) ?? '', body: str(s.body) ?? undefined, itemIds: strings(s.itemIds) }));
  return { ...c, summary: str(c.summary) ?? undefined, items, blocks, showContact: c.showContact === true, slides };
}

/** An http(s) link, or null for anything else (javascript:, data:, mailto:, malformed). */
export function httpLink(url: unknown, label?: unknown): DocLink | null {
  const raw = str(url);
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const named = str(label);
  const bare = raw.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  return { href: u.href, text: named ?? bare, host: named ? u.host : null };
}

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;

export function emailLink(value: unknown): DocLink | null {
  const email = str(value);
  return email && EMAIL.test(email) ? { href: `mailto:${email}`, text: email, host: null } : null;
}

/** The phone as written, with a `tel:` link when it has enough digits to dial. */
export function phoneLink(value: unknown): { text: string; href: string | null } | null {
  const phone = str(value);
  if (!phone) return null;
  const dial = phone.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  return { text: phone, href: dial.replace('+', '').length >= 6 ? `tel:${dial}` : null };
}

/** YYYY, YYYY-MM or YYYY-MM-DD as words of the document's language («ene 2022»); anything else as written. */
export function formatPartialDate(value: unknown, locale: Locale): string | null {
  const v = str(value);
  if (!v) return null;
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(v);
  if (!m) return v;
  const [, y, mo, d] = m;
  if (!mo) return y!;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, d ? Number(d) : 1));
  const options: Intl.DateTimeFormatOptions = d ? { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' } : { month: 'short', year: 'numeric', timeZone: 'UTC' };
  return new Intl.DateTimeFormat(RENDER_COPY[locale].intl, options).format(date);
}

function span(c: Rec, locale: Locale): string | null {
  const start = formatPartialDate(c.startDate, locale);
  const end = c.current === true ? RENDER_COPY[locale].present : formatPartialDate(c.endDate, locale);
  if (start && end) return `${start} – ${end}`;
  return start ?? end;
}

function links(c: Rec): DocLink[] {
  const out: DocLink[] = [];
  const main = httpLink(c.url);
  if (main) out.push(main);
  for (const l of Array.isArray(c.links) ? c.links.map(rec) : []) {
    const link = httpLink(l.url, l.label);
    if (link) out.push(link);
  }
  return out;
}

/** One profile item as an entry, with the artifact's override (title, summary, highlights) applied. */
export function buildEntry(id: string, kind: ItemKind, raw: unknown, override: ArtifactContent['items'][number]['override'] | undefined, locale: Locale): Entry {
  const c = rec(raw);
  const t = RENDER_COPY[locale];
  let title: string | null = null;
  let subtitle: string | null = null;
  let meta: (string | null)[] = [];
  let dates: string | null = null;
  switch (kind) {
    case 'experience':
    case 'volunteering':
      title = str(c.role);
      subtitle = str(c.organization);
      meta = [typeof c.employmentType === 'string' ? (t.employmentTypes[c.employmentType as EmploymentType] ?? null) : null, str(c.location)];
      dates = span(c, locale);
      break;
    case 'education':
      title = join([str(c.degree), str(c.field)], ', ') ?? str(c.institution);
      subtitle = str(c.degree) || str(c.field) ? str(c.institution) : null;
      dates = span(c, locale);
      break;
    case 'project':
      title = str(c.name);
      subtitle = str(c.role);
      dates = span(c, locale);
      break;
    case 'skill': {
      const level = typeof c.level === 'string' ? (t.skillLevels[c.level as SkillLevel] ?? null) : null;
      const years = typeof c.years === 'number' && Number.isInteger(c.years) && c.years > 0 ? t.years(c.years) : null;
      title = str(c.name);
      meta = [level, years];
      break;
    }
    case 'language':
      title = str(c.name);
      meta = [c.level === 'native' ? t.native : str(c.level)];
      break;
    case 'certification': {
      title = str(c.name);
      subtitle = str(c.issuer);
      dates = formatPartialDate(c.date, locale);
      const expires = formatPartialDate(c.expiresOn, locale);
      meta = [expires ? `${t.expires}: ${expires}` : null, str(c.credentialId) ? `${t.credential}: ${str(c.credentialId)}` : null];
      break;
    }
    case 'publication':
      title = str(c.title);
      subtitle = str(c.publisher);
      dates = formatPartialDate(c.date, locale);
      break;
    case 'achievement':
    case 'award':
      title = str(c.title);
      subtitle = str(c.issuer);
      dates = formatPartialDate(c.date, locale);
      break;
    case 'link':
      title = str(c.label);
      break;
  }
  return {
    id,
    kind,
    title: str(override?.title) ?? title,
    subtitle,
    meta: meta.filter((m): m is string => !!m),
    dates,
    summary: str(override?.summary) ?? str(c.summary),
    highlights: override?.highlights !== undefined ? strings(override.highlights) : strings(c.highlights),
    links: kind === 'link' ? [httpLink(c.url, c.label)].filter((l): l is DocLink => l !== null) : links(c),
  };
}

/** The document model of one artifact. `locale` is the CONTENT's language (the artifact's own `locale`). */
export function buildDocModel(raw: RenderData): DocModel {
  // W7 (B4): every text in the document's own language first (components/render/localize.ts); a document in the
  // primary language, or of a profile without translations, gets its data back unchanged.
  const { data } = localizeRenderData(raw);
  const locale = renderLocale(data.artifact.locale);
  const content = readContent(data.artifact.content);
  const kindLabels = APP_COPY[locale].itemKinds;
  const byId = new Map(data.items.map((i) => [i.id, i]));
  const overrides = new Map(content.items.map((i) => [i.itemId, i.override]));

  const entryFor = (id: string): Entry | null => {
    const item = byId.get(id);
    if (!item || !(ITEM_KINDS as readonly string[]).includes(item.kind)) return null;
    return buildEntry(id, item.kind as ItemKind, item.content, overrides.get(id), locale);
  };

  // Sections in the order of each kind's first appearance in the owner's selection; entries in selection order.
  const sections: Section[] = [];
  for (const ref of content.items) {
    const entry = entryFor(ref.itemId);
    if (!entry) continue;
    let section = sections.find((s) => s.kind === entry.kind);
    if (!section) {
      section = { kind: entry.kind, heading: kindLabels[entry.kind], compact: COMPACT.has(entry.kind), entries: [] };
      sections.push(section);
    }
    section.entries.push(entry);
  }

  const blocks = content.blocks.map((b) => ({ heading: str(b.heading), body: b.body }));
  const explicit = (content.slides ?? []).map((s) => ({
    title: str(s.title),
    body: str(s.body),
    entries: s.itemIds.map(entryFor).filter((e): e is Entry => e !== null),
  }));
  // Without slides of its own, a presentation shows the selection one section per slide, then the text blocks.
  const slides: Slide[] = explicit.length
    ? explicit
    : [...sections.map((s) => ({ title: s.heading, body: null, entries: s.entries })), ...blocks.map((b) => ({ title: b.heading, body: b.body, entries: [] }))];

  const contactRaw = data.profile.contact === undefined || data.profile.contact === null ? null : rec(data.profile.contact);
  const contact = contactRaw
    ? {
        location: str(contactRaw.location),
        email: emailLink(contactRaw.email),
        phone: phoneLink(contactRaw.phone),
        links: (Array.isArray(contactRaw.links) ? contactRaw.links.map(rec) : []).map((l) => httpLink(l.url, l.label)).filter((l): l is DocLink => l !== null),
      }
    : null;
  const c = rec(data.artifact.content);
  const summary = str(content.summary) ?? str(data.profile.summary);

  return {
    kind: artifactKind(data.artifact.kind),
    template: data.artifact.template,
    locale,
    title: data.artifact.title,
    name: str(data.profile.displayName),
    headline: str(data.profile.headline),
    summary,
    intro: str(c.intro) ?? summary,
    contact: contact && (contact.location || contact.email || contact.phone || contact.links.length) ? contact : null,
    sections,
    blocks,
    slides,
    greeting: str(c.greeting),
    closing: str(c.closing),
  };
}

/**
 * The owner's own view of an artifact (preview, print), in the SAME shape as the public projection
 * (server/db/repository.ts publicProjection): only the referenced items, and the contact only when `showContact`.
 */
export function ownerRenderData(
  artifact: { kind: string; title: string; locale: string; template: string; content: unknown },
  profile: { displayName: string; headline: string; summary: string; contact: unknown; locale?: string; translations?: unknown } | null,
  items: readonly { id: string; kind: string; content: unknown; translations?: unknown }[],
): RenderData {
  const content = readContent(artifact.content);
  const ids = new Set([...content.items.map((i) => i.itemId), ...(content.slides ?? []).flatMap((s) => s.itemIds)]);
  return {
    artifact: { kind: artifact.kind, title: artifact.title, locale: artifact.locale, template: artifact.template, content: artifact.content },
    profile: {
      displayName: profile?.displayName ?? '',
      headline: profile?.headline ?? '',
      summary: profile?.summary ?? '',
      ...(content.showContact ? { contact: profile?.contact ?? {} } : {}),
      ...(profile?.locale ? { locale: profile.locale } : {}),
      ...(profile?.translations ? { translations: profile.translations } : {}),
    },
    items: items.filter((i) => ids.has(i.id)).map((i) => ({ id: i.id, kind: i.kind, content: i.content, ...(i.translations ? { translations: i.translations } : {}) })),
  };
}
