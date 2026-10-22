/**
 * What an import produces before anything is sent: candidate profile items (per kind, content in the API's camelCase
 * keys) and candidate header fields, each with notes the preview shows («recortado», «fecha ilegible», ...).
 *
 * `fitContent` shapes raw values to the editor's own field descriptors (components/profile/fields.ts, which a test
 * keeps in step with the server's zod schemas): unknown keys dropped, text trimmed and cut to its limit, dates read by
 * `toPartialDate`, URLs kept only when http(s), enums kept only when valid. A candidate without its required fields is
 * not a candidate (it is counted as skipped). The server validates again; this only spares the person a refusal.
 */
import type { ItemKind } from '../../lib/copy/app.ts';
import { CONTACT_FIELDS, HEADER_FIELDS, ITEM_FIELDS, LINK_LABEL_MAX, TAGS_MAX, TAG_MAX, URL_MAX, isHttpUrl, type FieldSpec, type LinkRow } from '../profile/fields.ts';
import { toPartialDate } from './dates.ts';

export type ImportSource = 'linkedin' | 'json-resume';
export type ImportNote = 'truncated' | 'date_dropped' | 'url_dropped' | 'value_dropped';

export interface ImportItem {
  /** Stable within one import: `${file or section}#${row}`. */
  key: string;
  kind: ItemKind;
  content: Record<string, unknown>;
  tags: string[];
  /** Where it came from, for the preview («Positions.csv, fila 3» / «work[2]»). */
  origin: { file: string; row: number };
  notes: ImportNote[];
}

export interface ImportHeader {
  displayName?: string;
  headline?: string;
  summary?: string;
  contact: { email?: string; phone?: string; location?: string; links?: LinkRow[] };
}

export interface ImportResult {
  source: ImportSource;
  items: ImportItem[];
  header: ImportHeader;
  /** Rows or entries that could not become an item (a required field missing). */
  skipped: { file: string; row: number }[];
  /** Files (LinkedIn) or sections (JSON Resume) that were read. */
  read: string[];
  /** How many other files / sections were present and ignored (never read). */
  ignored: number;
}

export type Raw = Record<string, unknown>;

/** zod 4's email pattern, as components/profile/fields.ts keeps it (test/import-model.test.ts checks parity). */
const EMAIL = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;

function clampText(value: string, max: number, notes: Set<ImportNote>): string {
  const v = value.trim();
  if (v.length <= max) return v;
  notes.add('truncated');
  return `${v.slice(0, max - 1).trimEnd()}…`;
}

export function fitUrl(value: unknown, notes: Set<ImportNote>): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  let v = value.trim();
  if (/^www\./i.test(v)) v = `https://${v}`;
  if (v.length <= URL_MAX && isHttpUrl(v)) return v;
  notes.add('url_dropped');
  return undefined;
}

export function fitLinks(value: unknown, max: number, notes: Set<ImportNote>): LinkRow[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: LinkRow[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const r = (raw ?? {}) as Raw;
    const url = fitUrl(r.url, notes);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const label = typeof r.label === 'string' && r.label.trim() ? clampText(r.label, LINK_LABEL_MAX, notes) : hostLabel(url);
    out.push({ label, url });
  }
  if (out.length > max) notes.add('truncated');
  return out.length ? out.slice(0, max) : undefined;
}

/** «https://www.example.test/ana» → «example.test». */
export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').slice(0, LINK_LABEL_MAX) || url.slice(0, LINK_LABEL_MAX);
  } catch {
    return url.slice(0, LINK_LABEL_MAX);
  }
}

function fitField(spec: FieldSpec, value: unknown, notes: Set<ImportNote>): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  switch (spec.type) {
    case 'text':
    case 'textarea':
    case 'email': {
      if (typeof value !== 'string') return undefined;
      const v = clampText(value, spec.max, notes);
      if (spec.type === 'email' && !EMAIL.test(v)) {
        notes.add('value_dropped');
        return undefined;
      }
      return v || undefined;
    }
    case 'url':
      return fitUrl(value, notes);
    case 'date': {
      const d = toPartialDate(value);
      if (!d) notes.add('date_dropped');
      return d;
    }
    case 'enum':
      if (typeof value === 'string' && spec.options.includes(value)) return value;
      notes.add('value_dropped');
      return undefined;
    case 'int':
      return typeof value === 'number' && Number.isInteger(value) && value >= spec.min && value <= spec.max ? value : undefined;
    case 'bool':
      return typeof value === 'boolean' ? value : undefined;
    case 'bullets': {
      if (!Array.isArray(value)) return undefined;
      const lines = value.filter((l): l is string => typeof l === 'string' && l.trim() !== '').map((l) => clampText(l, spec.itemMax, notes));
      if (lines.length > spec.max) notes.add('truncated');
      return lines.length ? lines.slice(0, spec.max) : undefined;
    }
    case 'links':
      return fitLinks(value, spec.max, notes);
  }
}

/** Raw values → content for `kind`, or null when a required field is missing. */
export function fitContent(kind: ItemKind, raw: Raw): { content: Record<string, unknown>; notes: ImportNote[] } | null {
  const notes = new Set<ImportNote>();
  const content: Record<string, unknown> = {};
  for (const spec of ITEM_FIELDS[kind]) {
    const v = fitField(spec, raw[spec.name], notes);
    if (v !== undefined) content[spec.name] = v;
    else if (spec.required) return null;
  }
  // An end date before the start date is a typo in the export; keep the start, drop the end.
  if (typeof content.startDate === 'string' && typeof content.endDate === 'string' && content.endDate < content.startDate) {
    delete content.endDate;
    notes.add('date_dropped');
  }
  return { content, notes: [...notes] };
}

/** Tags (keywords): trimmed, unique (case-insensitive), at most 50 of 60 characters each. */
export function fitTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of value) {
    if (typeof t !== 'string') continue;
    const v = t.trim().slice(0, TAG_MAX).trim();
    const k = v.toLowerCase();
    if (!v || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out.slice(0, TAGS_MAX);
}

/** Header candidates, cut to the header's limits. */
export function fitHeader(raw: { displayName?: unknown; headline?: unknown; summary?: unknown; contact?: Raw }): ImportHeader {
  const notes = new Set<ImportNote>();
  const header: ImportHeader = { contact: {} };
  for (const spec of HEADER_FIELDS) {
    const v = fitField(spec, (raw as Raw)[spec.name], notes);
    if (typeof v === 'string') (header as unknown as Raw)[spec.name] = v;
  }
  for (const spec of CONTACT_FIELDS) {
    const v = fitField(spec, raw.contact?.[spec.name], notes);
    if (v !== undefined) (header.contact as Raw)[spec.name] = v;
  }
  return header;
}

/** Builds an item (or null) and records the row as skipped when it cannot be one. */
export function makeItem(result: Pick<ImportResult, 'items' | 'skipped'>, kind: ItemKind, raw: Raw, origin: { file: string; row: number }, tags: unknown = []): void {
  const fitted = fitContent(kind, raw);
  if (!fitted) {
    result.skipped.push(origin);
    return;
  }
  result.items.push({ key: `${origin.file}#${origin.row}`, kind, content: fitted.content, tags: fitTags(tags), origin, notes: fitted.notes });
}

// ---- duplicates ----------------------------------------------------------------------------------------------------

/** The fields that make two items of a kind «the same» (the preview unchecks a candidate whose key already exists). */
export const DUPLICATE_FIELDS: Record<ItemKind, readonly string[]> = {
  experience: ['role', 'organization', 'startDate'],
  education: ['institution', 'degree'],
  skill: ['name'],
  project: ['name'],
  certification: ['name', 'issuer'],
  achievement: ['title'],
  language: ['name'],
  publication: ['title'],
  volunteering: ['role', 'organization'],
  award: ['title'],
  link: ['url'],
};

const fold = (v: unknown) =>
  typeof v === 'string'
    ? v
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
    : '';

export function duplicateKey(kind: ItemKind, content: Record<string, unknown>): string {
  return `${kind}|${DUPLICATE_FIELDS[kind].map((f) => fold(content[f])).join('|')}`;
}

/** Keys of the candidates that already exist among `existing` or earlier in the same import. */
export function findDuplicates(candidates: readonly ImportItem[], existing: readonly { kind: ItemKind; content: Record<string, unknown> }[]): Set<string> {
  const known = new Set(existing.map((e) => duplicateKey(e.kind, e.content)));
  const dup = new Set<string>();
  for (const c of candidates) {
    const k = duplicateKey(c.kind, c.content);
    if (known.has(k)) dup.add(c.key);
    else known.add(k);
  }
  return dup;
}

/** The most items one import sends (= validation.ts ITEM_BATCH_MAX; a unit test keeps them equal). */
export const IMPORT_MAX_ITEMS = 300;
/** The API refuses request bodies over 256 KiB (handler.ts); the panel stops a little below. */
export const IMPORT_MAX_BODY_BYTES = 250 * 1024;
