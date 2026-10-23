/**
 * The two downloads of «Descargar mis datos» (`GET /api/v1/me/export`), pure functions over what the owner holds:
 *
 * - the full export (`format=full`, the default): every profile, item, job and artifact field, share state included
 *   (visibility, share token, slug, indexable, publish and suspension dates), under a schema name and version, so a
 *   later version of this app (or anyone) can read it back. The owner key is never written (the person knows it).
 * - JSON Resume v1.0.0 (`format=json-resume`, https://jsonresume.org/schema): the core profile only, for other tools.
 *   Fields JSON Resume has no place for (employment type, education summary, item tags other than skill/project
 *   keywords) stay in the full export.
 */
import type { OwnerData } from '../db/data-rights.ts';
import type { ItemKind } from '../../lib/copy/app.ts';
import { contentLocale, localizeHeader, localizeItem, type ContentLocale } from '../../lib/profile-text.ts';

export const EXPORT_SCHEMA = 'madfam-cv-export';
export const EXPORT_VERSION = 1;
export const EXPORT_FORMATS = ['full', 'json-resume'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

const strip = <T extends { ownerSub?: string }>(row: T): Omit<T, 'ownerSub'> => {
  const { ownerSub: _ownerSub, ...rest } = row;
  return rest;
};

export function fullExport(data: OwnerData, now: Date) {
  return {
    schema: EXPORT_SCHEMA,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    profile: data.profile ? strip(data.profile) : null,
    items: data.items.map(strip),
    jobs: data.jobs.map(strip),
    artifacts: data.artifacts.map(strip),
  };
}

/** «cv-mis-datos-2026-10-22.json» / «cv-json-resume-2026-10-22.json» (UTC date); W7-B4: «cv-json-resume-en-…» per language. */
export function exportFilename(format: ExportFormat, now: Date, locale?: string): string {
  const day = now.toISOString().slice(0, 10);
  if (format !== 'json-resume') return `cv-mis-datos-${day}.json`;
  return locale ? `cv-json-resume-${locale === 'en' ? 'en' : 'es'}-${day}.json` : `cv-json-resume-${day}.json`;
}

type C = Record<string, unknown>;
const s = (c: C, k: string): string | undefined => (typeof c[k] === 'string' && c[k] !== '' ? (c[k] as string) : undefined);
const list = (c: C, k: string): string[] | undefined => (Array.isArray(c[k]) && (c[k] as unknown[]).length ? (c[k] as string[]) : undefined);
const nonEmpty = <T>(xs: T[]): T[] | undefined => (xs.length ? xs : undefined);

/**
 * The core profile as a JSON Resume v1.0.0 document, in ONE language (JSON Resume has no place for two): `locale`, or
 * the profile's primary language when absent. W7 (B4): in the other language each text field is its translation when
 * there is one, else the primary text (as a document falls back); language names come from their ISO 639 codes.
 * The full export carries every translation as stored.
 */
export function toJsonResume(data: OwnerData, now: Date, locale?: ContentLocale) {
  const primary = contentLocale(data.profile?.locale);
  const target = locale ?? primary;
  const header = data.profile
    ? localizeHeader(
        { headline: data.profile.headline, summary: data.profile.summary, location: typeof (data.profile.contact as C)?.location === 'string' ? ((data.profile.contact as C).location as string) : undefined },
        data.profile.translations,
        primary,
        target,
      ).header
    : null;
  const p = data.profile && header ? { ...data.profile, headline: header.headline, summary: header.summary, contact: { ...((data.profile.contact ?? {}) as C), ...(header.location === undefined ? {} : { location: header.location }) } } : data.profile;
  const contact = ((p?.contact ?? {}) as C) ?? {};
  const of = (kind: string) =>
    data.items.filter((i) => i.kind === kind).map((i) => ({ c: localizeItem(i.kind as ItemKind, i.content, i.translations, primary, target).content as C, tags: i.tags }));
  const contactLinks = Array.isArray(contact.links) ? (contact.links as { label: string; url: string }[]) : [];
  const sampleLinks = of('link').map(({ c }) => ({ label: s(c, 'label') ?? '', url: s(c, 'url') ?? '' }));
  return {
    $schema: 'https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json',
    basics: {
      name: p?.displayName || undefined,
      label: p?.headline || undefined,
      email: s(contact, 'email'),
      phone: s(contact, 'phone'),
      summary: p?.summary || undefined,
      location: s(contact, 'location') ? { address: s(contact, 'location') } : undefined,
      profiles: nonEmpty([...contactLinks, ...sampleLinks].filter((l) => l.url).map((l) => ({ network: l.label || undefined, url: l.url }))),
    },
    work: nonEmpty(
      of('experience').map(({ c }) => ({
        name: s(c, 'organization'),
        position: s(c, 'role'),
        location: s(c, 'location'),
        startDate: s(c, 'startDate'),
        endDate: s(c, 'endDate'),
        summary: s(c, 'summary'),
        highlights: list(c, 'highlights'),
      })),
    ),
    volunteer: nonEmpty(
      of('volunteering').map(({ c }) => ({ organization: s(c, 'organization'), position: s(c, 'role'), startDate: s(c, 'startDate'), endDate: s(c, 'endDate'), summary: s(c, 'summary') })),
    ),
    education: nonEmpty(
      of('education').map(({ c }) => ({
        institution: s(c, 'institution'),
        area: s(c, 'field'),
        studyType: s(c, 'degree'),
        startDate: s(c, 'startDate'),
        endDate: s(c, 'endDate'),
        courses: list(c, 'highlights'),
      })),
    ),
    awards: nonEmpty([
      ...of('award').map(({ c }) => ({ title: s(c, 'title'), date: s(c, 'date'), awarder: s(c, 'issuer'), summary: s(c, 'summary') })),
      ...of('achievement').map(({ c }) => ({ title: s(c, 'title'), date: s(c, 'date'), summary: s(c, 'summary') })),
    ]),
    certificates: nonEmpty(of('certification').map(({ c }) => ({ name: s(c, 'name'), date: s(c, 'date'), issuer: s(c, 'issuer'), url: s(c, 'url') }))),
    publications: nonEmpty(
      of('publication').map(({ c }) => ({ name: s(c, 'title'), publisher: s(c, 'publisher'), releaseDate: s(c, 'date'), url: s(c, 'url'), summary: s(c, 'summary') })),
    ),
    skills: nonEmpty(of('skill').map(({ c, tags }) => ({ name: s(c, 'name'), level: s(c, 'level'), keywords: nonEmpty(tags) }))),
    languages: nonEmpty(of('language').map(({ c }) => ({ language: s(c, 'name'), fluency: s(c, 'level') === 'native' ? 'Native speaker' : s(c, 'level') }))),
    projects: nonEmpty(
      of('project').map(({ c, tags }) => ({
        name: s(c, 'name'),
        description: s(c, 'summary'),
        highlights: list(c, 'highlights'),
        keywords: nonEmpty(tags),
        startDate: s(c, 'startDate'),
        endDate: s(c, 'endDate'),
        url: s(c, 'url'),
        roles: s(c, 'role') ? [s(c, 'role')] : undefined,
      })),
    ),
    meta: { version: 'v1.0.0', lastModified: now.toISOString() },
  };
}
