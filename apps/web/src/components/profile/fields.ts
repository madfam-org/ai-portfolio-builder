/**
 * The profile editor's field descriptors: one entry per field of every item kind of `ITEM_CONTENT`
 * (server/api/validation.ts) and of the profile header (`profileBody`), with the same limits. The forms are rendered
 * from these descriptors, and the browser checks the same rules zod checks on the server, so a mistake is shown next to
 * its field before anything is sent. The server stays the authority: its 400 issues are mapped back onto the fields.
 *
 * No zod import here (and no server import): this file reaches the client bundle. test/profile-fields.test.ts keeps it
 * in step with the zod schemas field by field (names, required, types, enum options, every limit), in both directions.
 */
import type { ItemKind } from '../../lib/copy/app.ts';

export const ITEM_KIND_ORDER: readonly ItemKind[] = [
  'experience',
  'education',
  'project',
  'skill',
  'language',
  'certification',
  'achievement',
  'award',
  'publication',
  'volunteering',
  'link',
];

export const URL_MAX = 2000;
export const LINK_LABEL_MAX = 120;
export const TAG_MAX = 60;
export const TAGS_MAX = 50;

export type FieldSpec = { name: string; required?: boolean } & (
  | { type: 'text'; max: number }
  | { type: 'textarea'; max: number }
  | { type: 'email'; max: number }
  | { type: 'url' }
  | { type: 'date'; nullable?: boolean }
  | { type: 'enum'; options: readonly string[] }
  | { type: 'int'; min: number; max: number }
  | { type: 'bool' }
  | { type: 'bullets'; max: number; itemMax: number }
  | { type: 'links'; max: number }
);

export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'freelance', 'internship', 'volunteer', 'other'] as const;
export const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'] as const;
export const LANGUAGE_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'native'] as const;

const start: FieldSpec = { name: 'startDate', type: 'date' };
const end: FieldSpec = { name: 'endDate', type: 'date', nullable: true };
const summary: FieldSpec = { name: 'summary', type: 'textarea', max: 3000 };
const highlights: FieldSpec = { name: 'highlights', type: 'bullets', max: 30, itemMax: 500 };

export const ITEM_FIELDS: Record<ItemKind, readonly FieldSpec[]> = {
  experience: [
    { name: 'role', type: 'text', max: 200, required: true },
    { name: 'organization', type: 'text', max: 200, required: true },
    { name: 'employmentType', type: 'enum', options: EMPLOYMENT_TYPES },
    { name: 'location', type: 'text', max: 200 },
    start,
    end,
    { name: 'current', type: 'bool' },
    summary,
    highlights,
  ],
  education: [
    { name: 'institution', type: 'text', max: 200, required: true },
    { name: 'degree', type: 'text', max: 200 },
    { name: 'field', type: 'text', max: 200 },
    start,
    end,
    summary,
    highlights,
  ],
  skill: [
    { name: 'name', type: 'text', max: 120, required: true },
    { name: 'level', type: 'enum', options: SKILL_LEVELS },
    { name: 'years', type: 'int', min: 0, max: 80 },
  ],
  project: [
    { name: 'name', type: 'text', max: 200, required: true },
    { name: 'role', type: 'text', max: 200 },
    { name: 'url', type: 'url' },
    { name: 'links', type: 'links', max: 20 },
    start,
    end,
    summary,
    highlights,
  ],
  certification: [
    { name: 'name', type: 'text', max: 200, required: true },
    { name: 'issuer', type: 'text', max: 200 },
    { name: 'date', type: 'date' },
    { name: 'expiresOn', type: 'date' },
    { name: 'url', type: 'url' },
    { name: 'credentialId', type: 'text', max: 200 },
  ],
  achievement: [{ name: 'title', type: 'text', max: 200, required: true }, { name: 'date', type: 'date' }, summary],
  language: [
    { name: 'name', type: 'text', max: 80, required: true },
    { name: 'level', type: 'enum', options: LANGUAGE_LEVELS },
  ],
  publication: [
    { name: 'title', type: 'text', max: 300, required: true },
    { name: 'publisher', type: 'text', max: 200 },
    { name: 'date', type: 'date' },
    { name: 'url', type: 'url' },
    summary,
  ],
  volunteering: [{ name: 'role', type: 'text', max: 200, required: true }, { name: 'organization', type: 'text', max: 200, required: true }, start, end, summary],
  award: [{ name: 'title', type: 'text', max: 200, required: true }, { name: 'issuer', type: 'text', max: 200 }, { name: 'date', type: 'date' }, summary],
  link: [
    { name: 'label', type: 'text', max: LINK_LABEL_MAX, required: true },
    { name: 'url', type: 'url', required: true },
  ],
};

/** The fields that name an item in its list row: the first is the title, the second (if any) follows it. */
export const ITEM_HEADING: Record<ItemKind, readonly string[]> = {
  experience: ['role', 'organization'],
  education: ['degree', 'institution'],
  skill: ['name'],
  project: ['name', 'role'],
  certification: ['name', 'issuer'],
  achievement: ['title'],
  language: ['name'],
  publication: ['title', 'publisher'],
  volunteering: ['role', 'organization'],
  award: ['title', 'issuer'],
  link: ['label'],
};

/** The profile header (`profileBody` + `contactSchema`): the person, shown on top of every document. */
export const HEADER_FIELDS: readonly FieldSpec[] = [
  { name: 'displayName', type: 'text', max: 200 },
  { name: 'headline', type: 'text', max: 200 },
  { name: 'summary', type: 'textarea', max: 5000 },
];
export const CONTACT_FIELDS: readonly FieldSpec[] = [
  { name: 'email', type: 'email', max: 320 },
  { name: 'phone', type: 'text', max: 60 },
  { name: 'location', type: 'text', max: 200 },
  { name: 'links', type: 'links', max: 20 },
];

// ---- values, errors ------------------------------------------------------------------------------------------------

export interface LinkRow {
  label: string;
  url: string;
}
export type FormValue = string | boolean | LinkRow[];
export type FormValues = Record<string, FormValue>;

export type ErrorCode = 'required' | 'tooLong' | 'url' | 'date' | 'email' | 'choice' | 'int' | 'tooMany' | 'lineTooLong' | 'server';
export interface FieldError {
  code: ErrorCode;
  /** The limit the message names (characters, items, or the int range's upper bound). */
  max?: number;
  min?: number;
  /** For list fields: the row with the problem (0-based) and which part of it. */
  row?: number;
  part?: 'label' | 'url';
  /** `server` only: the API's own message. */
  message?: string;
}
export type FieldErrors = Record<string, FieldError>;

const PARTIAL_DATE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;
/** zod 4's email pattern (z.string().email()), kept identical; the parity test runs the same samples through both. */
const EMAIL = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function checkUrl(value: string, required: boolean | undefined): FieldError | null {
  if (value === '') return required ? { code: 'required' } : null;
  if (value.length > URL_MAX) return { code: 'tooLong', max: URL_MAX };
  return isHttpUrl(value) ? null : { code: 'url' };
}

/** Rows that are entirely blank are dropped; a half-filled row is an error on the missing part. */
export function checkLinks(rows: readonly LinkRow[], max: number): { links: LinkRow[]; error: FieldError | null } {
  const links = rows.map((r) => ({ label: r.label.trim(), url: r.url.trim() })).filter((r) => r.label !== '' || r.url !== '');
  if (links.length > max) return { links, error: { code: 'tooMany', max } };
  for (const [row, r] of links.entries()) {
    if (r.label === '') return { links, error: { code: 'required', row, part: 'label' } };
    if (r.label.length > LINK_LABEL_MAX) return { links, error: { code: 'tooLong', max: LINK_LABEL_MAX, row, part: 'label' } };
    const bad = checkUrl(r.url, true);
    if (bad) return { links, error: { ...bad, row, part: 'url' } };
  }
  return { links, error: null };
}

/**
 * Form values → the content object the API accepts, plus one error per field. Empty optional fields are left out
 * (never stored as ''), strings are trimmed as zod trims them, highlights are one per line (blank lines dropped).
 */
export function formToContent(specs: readonly FieldSpec[], values: FormValues): { content: Record<string, unknown>; errors: FieldErrors } {
  const content: Record<string, unknown> = {};
  const errors: FieldErrors = {};
  for (const spec of specs) {
    const raw = values[spec.name];
    switch (spec.type) {
      case 'bool': {
        if (raw === true) content[spec.name] = true;
        break;
      }
      case 'links': {
        const { links, error } = checkLinks(Array.isArray(raw) ? raw : [], spec.max);
        if (error) errors[spec.name] = error;
        else if (links.length > 0) content[spec.name] = links;
        break;
      }
      case 'bullets': {
        const lines = (typeof raw === 'string' ? raw : '')
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l !== '');
        if (lines.length > spec.max) errors[spec.name] = { code: 'tooMany', max: spec.max };
        else if (lines.some((l) => l.length > spec.itemMax)) errors[spec.name] = { code: 'lineTooLong', max: spec.itemMax };
        else if (lines.length > 0) content[spec.name] = lines;
        break;
      }
      default: {
        const value = (typeof raw === 'string' ? raw : '').trim();
        if (value === '') {
          if (spec.required) errors[spec.name] = { code: 'required' };
          break;
        }
        const error = checkScalar(spec, value);
        if (error) errors[spec.name] = error;
        else content[spec.name] = spec.type === 'int' ? Number(value) : value;
      }
    }
  }
  return { content, errors };
}

function checkScalar(spec: FieldSpec, value: string): FieldError | null {
  switch (spec.type) {
    case 'text':
    case 'textarea':
      return value.length > spec.max ? { code: 'tooLong', max: spec.max } : null;
    case 'email':
      if (value.length > spec.max) return { code: 'tooLong', max: spec.max };
      return EMAIL.test(value) ? null : { code: 'email' };
    case 'url':
      return checkUrl(value, spec.required);
    case 'date':
      return PARTIAL_DATE.test(value) ? null : { code: 'date' };
    case 'enum':
      return spec.options.includes(value) ? null : { code: 'choice' };
    case 'int': {
      const n = Number(value);
      return /^-?\d+$/.test(value) && n >= spec.min && n <= spec.max ? null : { code: 'int', min: spec.min, max: spec.max };
    }
    default:
      return null;
  }
}

/** Stored content → form values (unknown keys are ignored; every field gets a value, so inputs stay controlled). */
export function contentToForm(specs: readonly FieldSpec[], content: Record<string, unknown> | null | undefined): FormValues {
  const values: FormValues = {};
  const c = content ?? {};
  for (const spec of specs) {
    const v = c[spec.name];
    if (spec.type === 'bool') values[spec.name] = v === true;
    else if (spec.type === 'links') values[spec.name] = Array.isArray(v) ? v.map((r: { label?: unknown; url?: unknown }) => ({ label: String(r?.label ?? ''), url: String(r?.url ?? '') })) : [];
    else if (spec.type === 'bullets') values[spec.name] = Array.isArray(v) ? v.map(String).join('\n') : '';
    else values[spec.name] = v === undefined || v === null ? '' : String(v);
  }
  return values;
}

/** Keywords typed as «a, b; c» or one per line: trimmed, de-duplicated (case-insensitive), in the order typed. */
export function splitTags(input: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of input.split(/[,;\n]/)) {
    const tag = part.trim();
    if (tag === '' || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
  }
  return out;
}

export function checkTags(tags: readonly string[]): FieldError | null {
  if (tags.length > TAGS_MAX) return { code: 'tooMany', max: TAGS_MAX };
  if (tags.some((t) => t.trim().length > TAG_MAX)) return { code: 'tooLong', max: TAG_MAX };
  return null;
}

/**
 * The API's 400 issues (`{path, message}`) → field errors. Item content issues come relative to the content (`role`,
 * `links.1.url`); body issues carry the body path (`tags.3`, `contact.email`). Unknown paths go under `_form`.
 */
export function issuesToErrors(issues: readonly { path: string; message: string }[] | undefined, known: readonly string[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues ?? []) {
    const parts = issue.path.split('.').filter((p) => p !== '');
    const head = parts[0] === 'content' || parts[0] === 'contact' ? parts[1] : parts[0];
    const key = head && (known.includes(head) || head === 'tags') ? head : '_form';
    if (!errors[key]) errors[key] = { code: 'server', message: issue.message };
  }
  return errors;
}

/** The text a list row shows for an item: its title and, after a separator, its second identifying field. */
export function itemHeading(kind: ItemKind, content: Record<string, unknown>): { title: string; detail: string } {
  const [first = '', second] = ITEM_HEADING[kind];
  const str = (k: string | undefined) => (k && typeof content[k] === 'string' ? (content[k] as string) : '');
  const title = str(first) || str(second);
  return { title, detail: str(first) ? str(second) : '' };
}

/** «2019-03 – 2022» / «2019 – actual» / a single date; '' when the item has none. */
export function itemPeriod(content: Record<string, unknown>, presentLabel: string): string {
  const s = typeof content.startDate === 'string' ? content.startDate : '';
  const e = typeof content.endDate === 'string' ? content.endDate : '';
  if (s || e) return `${s || '…'} – ${e || (content.current === true ? presentLabel : '…')}`;
  return typeof content.date === 'string' ? content.date : '';
}
