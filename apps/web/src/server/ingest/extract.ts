/**
 * W5-J: one page (fetched HTML, the person's browser capture, an HTML file) or one text (a paste, a PDF or Word file's
 * text) → a draft job. Order of trust, per field (the first source that states a field keeps it):
 *   JSON-LD JobPosting → microdata JobPosting → Open Graph (title, description) → the page <title> → labeled lines of
 *   the readable text. The posting text is the JobPosting description, else the page's readable text.
 * Null when nothing usable was found (no title and less than 80 characters of text): the caller says so honestly.
 */
import { SOURCE_TEXT_MAX } from '../db/schema.ts';
import { clean } from './fields.ts';
import { pageParts, parseHtml, find, microdataObject, type PageParts } from './html.ts';
import { findJobPostings, mapJobPosting, parseJsonLoose } from './jsonld.ts';
import { fieldsFromText } from './text.ts';
import type { DraftFields, IntakeDraft, IntakeNote } from './types.ts';
import type { Provenance, SourceKind } from './vocab.ts';

const MIN_TEXT = 80;

function merge(into: DraftFields, from: DraftFields): void {
  for (const [k, v] of Object.entries(from) as [keyof DraftFields, DraftFields[keyof DraftFields]][]) {
    if (v && !into[k]) (into as Record<string, unknown>)[k] = v;
  }
}

function capText(text: string, notes: IntakeNote[]): string {
  const t = text.trim();
  if (t.length <= SOURCE_TEXT_MAX) return t;
  notes.push('text_truncated');
  return t.slice(0, SOURCE_TEXT_MAX);
}

/** http(s) only; relative URLs resolved against the page. */
function absoluteUrl(value: string | null, base: URL | null): string | null {
  if (!value) return null;
  try {
    const u = base ? new URL(value, base) : new URL(value);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    u.hash = '';
    return u.toString().slice(0, 2000);
  } catch {
    return null;
  }
}

function sameSite(a: string | null, b: URL | null): boolean {
  if (!a || !b) return false;
  try {
    const h = new URL(a).hostname.replace(/^www\./, '');
    return h === b.hostname.replace(/^www\./, '');
  } catch {
    return false;
  }
}

/** The posting whose `url` is this page, else the first one (and a note when there are several). */
function choose(postings: Record<string, unknown>[], page: URL | null, notes: IntakeNote[]): Record<string, unknown> | null {
  if (postings.length === 0) return null;
  if (postings.length > 1) {
    const here = page ? `${page.origin}${page.pathname}`.replace(/\/$/, '') : null;
    const hit = postings.find((p) => typeof p.url === 'string' && here && p.url.replace(/[?#].*$/, '').replace(/\/$/, '') === here);
    if (hit) return hit;
    notes.push('several_postings');
  }
  return postings[0]!;
}

export interface PageInput {
  parts: PageParts;
  /** The page's address (fetched URL, or the URL the person's browser reported). */
  pageUrl: URL | null;
  sourceKind: SourceKind;
}

export function draftFromParts({ parts, pageUrl, sourceKind }: PageInput): IntakeDraft | null {
  const notes: IntakeNote[] = [];
  const fields: DraftFields = {};
  let description: string | null = null;
  let descriptionFrom: Provenance = 'text';
  let canonical: string | null = null;

  const posting = choose(findJobPostings(parts.jsonLd.map(parseJsonLoose).filter((v) => v !== undefined)), pageUrl, notes);
  if (posting) {
    const mapped = mapJobPosting(posting, 'json-ld');
    merge(fields, mapped.fields);
    if (mapped.description) [description, descriptionFrom] = [mapped.description, 'json-ld'];
    canonical = mapped.url;
  }
  if (parts.microdataRoot) {
    const mapped = mapJobPosting(microdataObject(parts.microdataRoot), 'microdata');
    merge(fields, mapped.fields);
    if (!description && mapped.description) [description, descriptionFrom] = [mapped.description, 'microdata'];
    canonical ??= mapped.url;
  }
  if (!posting && !parts.microdataRoot) notes.push('no_structured_data');
  const og = parts.meta;
  if (!fields.title && clean(og['og:title'])) fields.title = { value: clean(og['og:title'])!, from: 'open-graph' };
  if (!fields.title && clean(parts.title)) fields.title = { value: clean(parts.title)!, from: 'page-title' };
  const fromText = fieldsFromText(parts.text);
  // The page's own first line is navigation more often than a title: on pages, only labeled lines count.
  if (fromText.fields.title?.from === 'first-line') delete fromText.fields.title;
  merge(fields, fromText.fields);
  for (const n of fromText.notes) if (!notes.includes(n)) notes.push(n);

  let sourceText = description ?? '';
  if (sourceText.length < MIN_TEXT && parts.text.length > sourceText.length) [sourceText, descriptionFrom] = [parts.text, 'text'];
  if (sourceText.length < MIN_TEXT && clean(og['og:description'], 5000) && !description) [sourceText, descriptionFrom] = [clean(og['og:description'], 5000)!, 'open-graph'];
  // Without a posting (JSON-LD or microdata) naming the job, a page needs real text: a home page's «Inicio» is not a job.
  const structuredTitle = fields.title && (fields.title.from === 'json-ld' || fields.title.from === 'microdata');
  if (!sourceText.trim() || (sourceText.length < MIN_TEXT && !structuredTitle)) return null;
  if (!fields.title) notes.push('title_missing');

  const canon = absoluteUrl(canonical ?? parts.canonical, pageUrl);
  const sourceUrl = canon && sameSite(canon, pageUrl) ? canon : pageUrl ? absoluteUrl(pageUrl.toString(), null) : canon;
  return { sourceKind, sourceUrl, provider: null, fields, sourceText: capText(sourceText, notes), sourceTextFrom: descriptionFrom, notes };
}

export function draftFromHtml(html: string, pageUrl: URL | null, sourceKind: SourceKind): IntakeDraft | null {
  return draftFromParts({ parts: pageParts(html), pageUrl, sourceKind });
}

/** What the person's browser sends from an open page (the bookmarklet) or an HTML file (read in the browser). */
export interface Capture {
  url: string | null;
  canonical: string | null;
  title: string;
  jsonLd: string[];
  meta: Record<string, string>;
  /** outerHTML of the element carrying JobPosting microdata, or ''. */
  microdata: string;
  text: string;
}

export function draftFromCapture(c: Capture, sourceKind: SourceKind): IntakeDraft | null {
  let pageUrl: URL | null = null;
  try {
    pageUrl = c.url ? new URL(c.url) : null;
  } catch {
    pageUrl = null;
  }
  const microdataRoot = c.microdata ? find(parseHtml(c.microdata), (e) => e.attrs.itemscope !== undefined && /schema\.org\/JobPosting/i.test(e.attrs.itemtype ?? '')) : null;
  const meta = Object.fromEntries(Object.entries(c.meta).map(([k, v]) => [k.toLowerCase(), v]));
  return draftFromParts({ parts: { title: c.title || null, canonical: c.canonical, meta, jsonLd: c.jsonLd, microdataRoot, text: c.text }, pageUrl, sourceKind });
}

/** A paste or a file's text. A paste that is really a page's HTML (or JSON-LD) is read as a page. */
export function draftFromText(input: string, sourceKind: SourceKind): IntakeDraft | null {
  const text = input.replace(/\u0000/g, '').trim();
  if (!text) return null;
  if (/^</.test(text) && /<(html|body|script[^>]+ld\+json|div|article|main)\b/i.test(text)) return draftFromHtml(text, null, sourceKind);
  if (/^[[{]/.test(text) && /JobPosting/.test(text)) {
    const fromLd = draftFromParts({ parts: { title: null, canonical: null, meta: {}, jsonLd: [text], microdataRoot: null, text: '' }, pageUrl: null, sourceKind });
    if (fromLd) return fromLd;
  }
  const notes: IntakeNote[] = [];
  const { fields, notes: textNotes } = fieldsFromText(text);
  notes.push(...textNotes);
  // A posting is more than a line: under 80 characters only a labeled title («Puesto: …») makes it one.
  if (text.length < MIN_TEXT && fields.title?.from !== 'labeled-text') return null;
  if (!fields.title) notes.push('title_missing');
  return { sourceKind, sourceUrl: null, provider: null, fields, sourceText: capText(text, notes), sourceTextFrom: 'text', notes };
}
