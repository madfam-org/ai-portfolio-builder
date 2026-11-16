/**
 * The person's OWN LinkedIn profile PDF («Guardar como PDF» / «Save to PDF» on their profile:
 * https://www.linkedin.com/help/linkedin/answer/a541960), read in the browser with the same pdf.js setup as the job
 * intake (jobs/intake/pdf.ts: main thread, no network, no fonts, no eval). Dormant unless `CV_IMPORT_LINKEDIN_PDF` is on
 * (lib/import-config.ts).
 *
 * Why this file and not a script on linkedin.com: LinkedIn's User Agreement §8.2 forbids «scripts … browser plugins
 * and add-ons» that «scrape or copy the Services, including profiles», with no exception for one's own profile; «Save
 * to PDF» is LinkedIn's own feature, so the person downloads it themselves and cv only reads the file they pick.
 *
 * Layout (not published by LinkedIn; read from the file's own geometry, never from fixed coordinates): a narrow left
 * column (Contact, Top Skills, Languages, Certifications, Honors-Awards, Publications) and a main column (name in the
 * largest type, headline, location, then Summary, Experience, Education). Section headings are recognised by their
 * label (English and Spanish, also with the accented letters lost: LinkedIn says the PDF supports only English
 * characters) AND by being set larger than the body text. A heading-sized line with an unknown label starts a section
 * that is skipped (counted as «not read»), so an unexpected section never bleeds into a known one.
 *
 * Everything here is a best reading of a printed layout: the preview shows each candidate with a checkbox, nothing is
 * saved until the person confirms, and anything ambiguous (a description line taken as a location) is editable later.
 * The PDF lists only the TOP skills; the copy says so and points to the ZIP for all of them.
 */
import type { ItemKind } from '../../lib/copy/app.ts';
import { languageCodeFromName } from '../../lib/languages.ts';
import { readPdfRuns, type PdfPageRuns } from '../jobs/intake/pdf.ts';
import { toPartialDate } from './dates.ts';
import { languageLevel } from './linkedin.ts';
import { fitHeader, makeItem, type ImportResult, type Raw } from './model.ts';

export interface PdfLine {
  page: number;
  col: 'side' | 'main';
  x: number;
  y: number;
  size: number;
  text: string;
}

/** A line that starts left of this share of the page width belongs to the left column. */
export const SIDEBAR_SPLIT = 0.3;

const clean = (s: string) => s.replace(/[\s ]+/g, ' ').trim();

/**
 * pdf.js runs → lines per page and column, top to bottom. A run continues the current line unless it ends a line
 * (`eol`), moves vertically by more than half the type size, jumps back to the left, or leaves a gap wider than three
 * type sizes (the gutter between the columns).
 */
export function groupLines(pages: readonly PdfPageRuns[]): PdfLine[] {
  const out: PdfLine[] = [];
  pages.forEach((page, index) => {
    const split = page.width * SIDEBAR_SPLIT;
    const lines: PdfLine[] = [];
    let cur: OpenLine | null = null;
    for (const run of page.runs) {
      const blank = run.str.trim() === '';
      if (cur && !blank && breaksLine(cur, run)) cur = closeLine(cur, lines);
      if (blank) {
        if (cur) cur.text += ' ';
      } else if (!cur) {
        cur = { page: index + 1, col: run.x < split ? 'side' : 'main', x: run.x, y: run.y, size: run.size, text: run.str, end: run.x + run.width };
      } else {
        const gap = run.x - cur.end > run.size * 0.15 && !/\s$/.test(cur.text) && !/^\s/.test(run.str);
        cur.text += (gap ? ' ' : '') + run.str;
        cur.end = Math.max(cur.end, run.x + run.width);
        cur.size = Math.max(cur.size, run.size);
      }
      if (run.eol && cur) cur = closeLine(cur, lines);
    }
    if (cur) closeLine(cur, lines);
    // Top to bottom (PDF y grows upwards); a stable sort keeps the reading order of runs on one baseline.
    lines.sort((a, b) => b.y - a.y);
    out.push(...lines);
  });
  return out;
}

type OpenLine = PdfLine & { end: number };

function breaksLine(cur: OpenLine, run: PdfPageRuns['runs'][number]): boolean {
  const tall = Math.max(cur.size, run.size, 1);
  return Math.abs(run.y - cur.y) > tall * 0.5 || run.x < cur.end - tall || run.x - cur.end > tall * 3;
}

/** Keeps a finished line (when it has text) and returns null: the next run opens a new one. */
function closeLine(cur: OpenLine, lines: PdfLine[]): null {
  const text = clean(cur.text);
  if (text) lines.push({ page: cur.page, col: cur.col, x: cur.x, y: cur.y, size: cur.size, text });
  return null;
}

// ---- labels ---------------------------------------------------------------------------------------------------------

type SideId = 'contact' | 'skills' | 'languages' | 'certifications' | 'honors' | 'publications';
type MainId = 'summary' | 'experience' | 'education';
type SectionId = SideId | MainId;

/** English and Spanish labels of the PDF's sections (the profile's own interface language decides which). */
const LABELS: Record<SectionId, readonly string[]> = {
  contact: ['Contact', 'Contactar', 'Contacto', 'Información de contacto'],
  skills: ['Top Skills', 'Aptitudes principales', 'Principales aptitudes', 'Skills', 'Aptitudes'],
  languages: ['Languages', 'Idiomas'],
  certifications: ['Certifications', 'Licenses & Certifications', 'Certificaciones', 'Licencias y certificaciones'],
  honors: ['Honors-Awards', 'Honors & Awards', 'Reconocimientos y premios', 'Premios y reconocimientos', 'Honores y premios'],
  publications: ['Publications', 'Publicaciones'],
  summary: ['Summary', 'About', 'Extracto', 'Resumen', 'Acerca de'],
  experience: ['Experience', 'Experiencia'],
  education: ['Education', 'Educación', 'Formación académica', 'Formación'],
};

const SIDE_IDS: readonly SideId[] = ['contact', 'skills', 'languages', 'certifications', 'honors', 'publications'];
const MAIN_IDS: readonly MainId[] = ['summary', 'experience', 'education'];

/** Letters only, accents folded («Educación» → «educacion»). */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
/** Letters only, non-ASCII letters DROPPED: how a label reads when the PDF lost its accents («Educaci n» → «educacin»). */
const lossy = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

const KEYS = new Map<string, SectionId>();
for (const [id, labels] of Object.entries(LABELS) as [SectionId, readonly string[]][]) {
  for (const label of labels) {
    KEYS.set(fold(label), id);
    KEYS.set(lossy(label), id);
  }
}

export function sectionOf(text: string): SectionId | null {
  const t = clean(text);
  if (t.length > 40) return null;
  return KEYS.get(fold(t)) ?? KEYS.get(lossy(t)) ?? null;
}

const FOOTER = /^(page|p\S{0,2}\s?gina)\s*\d+\s*(of|de)\s*\d+$/i;

/** The most common type size (to 0.25 pt) among `lines`: the body text. */
function bodySize(lines: readonly PdfLine[]): number {
  const counts = new Map<number, number>();
  for (const l of lines) {
    const k = Math.round(l.size * 4) / 4;
    counts.set(k, (counts.get(k) ?? 0) + Math.max(1, l.text.length));
  }
  let best = 0;
  let max = -1;
  for (const [k, n] of counts) if (n > max || (n === max && k < best)) [best, max] = [k, n];
  return best;
}

interface Section {
  id: SectionId | null;
  /** The heading as printed (the preview's «Leímos: …»). */
  label: string;
  lines: PdfLine[];
}

/**
 * Splits one column into its top block (lines before the first heading) and sections. A heading is a line whose label
 * is known and that is set larger than the column's body text (when the column has more than one size), or any line
 * set at a known heading's size (an unknown section: kept apart and skipped).
 */
function splitSections(lines: readonly PdfLine[], ids: readonly SectionId[]): { top: PdfLine[]; sections: Section[] } {
  const body = bodySize(lines);
  const varied = lines.some((l) => Math.abs(l.size - body) > 0.25);
  const known = (l: PdfLine) => {
    const id = sectionOf(l.text);
    return id && ids.includes(id) && (!varied || l.size > body + 0.25) ? id : null;
  };
  const headingSizes = lines.filter((l) => known(l)).map((l) => l.size);
  const top: PdfLine[] = [];
  const sections: Section[] = [];
  for (const l of lines) {
    const id = known(l);
    const unknown = !id && varied && headingSizes.some((s) => Math.abs(s - l.size) < 0.3) && l.text.length <= 40;
    if (id || (unknown && (sections.length > 0 || top.length > 0))) sections.push({ id, label: l.text, lines: [] });
    else if (sections.length) sections[sections.length - 1]!.lines.push(l);
    else top.push(l);
  }
  return { top, sections };
}

/** Joins wrapped lines into paragraphs: a vertical gap of about two lines (or a page change) starts a new one. */
function paragraphs(lines: readonly PdfLine[]): string {
  let out = '';
  lines.forEach((l, i) => {
    const prev = lines[i - 1];
    if (!prev) out = l.text;
    else if (prev.page !== l.page || prev.y - l.y > Math.max(prev.size, l.size) * 1.9) out += `\n\n${l.text}`;
    else if (/^[•·*\-–]\s/.test(l.text)) out += `\n${l.text}`;
    else out += ` ${l.text}`;
  });
  return out.trim();
}

// ---- experience and education -------------------------------------------------------------------------------------

const PRESENT = new Set(['present', 'presente', 'actualidad', 'laactualidad', 'actual', 'hoy', 'now', 'current']);

/** «January 2020 - Present (4 years 11 months)» / «enero de 2019 - mayo de 2021 (2 años 5 meses)» → its two ends. */
export function dateRange(text: string): { start: string; end: string; current: boolean } | null {
  const m = clean(text).match(/^(.+?)\s+[-–—]\s+(.+?)(?:\s*\([^)]*\))?$/);
  if (!m) return null;
  const [start, end] = [m[1]!, m[2]!];
  if (!toPartialDate(start)) return null;
  if (PRESENT.has(fold(end))) return { start, end: '', current: true };
  return toPartialDate(end) ? { start, end, current: false } : null;
}

/** «3 years 2 months» / «1 año» / «4 a os 11 meses» (accents lost): the total time at a company with several roles. */
export function isDuration(text: string): boolean {
  const t = clean(text)
    .replace(/^\(|\)$/g, '')
    .toLowerCase();
  return t.length < 40 && /^(?:\d+\s+(?:years?|yrs?|months?|mos?|a\S{0,2}os?|a\s+os?|mes(?:es)?)\s*)+$/.test(t);
}

const REMOTE = /^(remote|remoto|en remoto|híbrido|hibrido|hybrid|presencial|on-site)$/i;
const AREA = /\b(area|área|region|región|metropolitan|metropolitana)\b/i;

/** A short line right under the dates that reads like a place («Ciudad de México, México», «Remoto»). */
function looksLikePlace(text: string): boolean {
  return text.length <= 70 && !/[.;:!?]$/.test(text) && !/^[•·*\-–]/.test(text) && (text.includes(',') || REMOTE.test(text) || AREA.test(text));
}

interface Fit {
  body: number;
  varied: boolean;
}
const fitOf = (lines: readonly PdfLine[]): Fit => {
  const body = bodySize(lines);
  return { body, varied: lines.some((l) => Math.abs(l.size - body) > 0.25) };
};
const isHead = (l: PdfLine | undefined, f: Fit) => !!l && f.varied && l.size > f.body + 0.25;

/**
 * Experience entries, anchored on the date lines: the line above a date is the role; above that, a company line (set
 * larger than the description text) or a company plus its total time; otherwise the role belongs to the company of the
 * role before it (LinkedIn groups several roles under one company). Under the date: an optional place, then the
 * description, up to the next company or role.
 */
export function readExperience(lines: readonly PdfLine[]): Raw[] {
  const f = fitOf(lines);
  const dates = lines.map((l, i) => (dateRange(l.text) ? i : -1)).filter((i) => i >= 0);
  const roles: { company: number; title: number; date: number }[] = [];
  let company = -1;
  dates.forEach((d, k) => {
    const title = d - 1;
    const floor = k > 0 ? dates[k - 1]! : -1;
    if (title <= floor) return;
    const above = title - 1;
    if (above > floor && isDuration(lines[above]!.text) && above - 1 > floor) company = above - 1;
    else if (above > floor && (k === 0 || isHead(lines[above], f))) company = above;
    roles.push({ company, title, date: d });
  });
  return roles.map((r, k) => {
    const next = roles[k + 1];
    const stop = next ? (next.company > r.date ? Math.min(next.company, next.title) : next.title) : lines.length;
    const below = lines.slice(r.date + 1, stop);
    const range = dateRange(lines[r.date]!.text)!;
    let location = '';
    let rest = below;
    if (below[0] && !isHead(below[0], f) && looksLikePlace(below[0].text)) {
      location = below[0].text;
      rest = below.slice(1);
    }
    return {
      role: lines[r.title]!.text,
      organization: r.company >= 0 ? lines[r.company]!.text : '',
      location,
      summary: paragraphs(rest),
      startDate: range.start,
      endDate: range.end,
      current: range.current ? true : undefined,
    };
  });
}

const DETAIL = /·|\(\s*(?:\d{4}|[A-Za-zÀ-ÿ]+\.?\s+(?:de\s+)?\d{4})/;

/**
 * Education entries: a school line (set larger than the detail text), then «Degree, Field · (2010 - 2014)». Without
 * size differences, a line is a detail when it carries the «·» or a parenthesised year.
 */
export function readEducation(lines: readonly PdfLine[]): Raw[] {
  const f = fitOf(lines);
  const entries: { school: string; details: string[] }[] = [];
  for (const l of lines) {
    const school = f.varied ? isHead(l, f) : !DETAIL.test(l.text);
    if (school) {
      const last = entries[entries.length - 1];
      // A school name wrapped over two lines: both larger, with no detail between them.
      if (last && last.details.length === 0 && f.varied) last.school += ` ${l.text}`;
      else entries.push({ school: l.text, details: [] });
    } else if (entries.length) entries[entries.length - 1]!.details.push(l.text);
  }
  return entries.map(({ school, details }) => {
    const text = details.join(' ');
    const parts = text.split('·').map((p) => p.trim());
    let start = '';
    let end = '';
    const when = text.match(/\(([^)]*\d{4}[^)]*)\)\s*$/);
    if (when) {
      const [a, b] = when[1]!.split(/\s+[-–—]\s+/);
      start = a?.trim() ?? '';
      end = b && !PRESENT.has(fold(b)) ? b.trim() : '';
    }
    const first = when && parts.length === 1 ? '' : parts[0]!.replace(/\([^)]*\)\s*$/, '').trim();
    const comma = first.indexOf(', ');
    return {
      institution: school,
      degree: comma >= 0 ? first.slice(0, comma) : first,
      field: comma >= 0 ? first.slice(comma + 2) : '',
      startDate: start,
      endDate: end,
    };
  });
}

// ---- the left column ------------------------------------------------------------------------------------------------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d][\d\s().-]{6,}\d$/;

/** Contact lines → email, phone and links. Long URLs wrap without spaces; an entry ends at its «(Label)». */
export function readContact(lines: readonly PdfLine[]): { email?: string; phone?: string; links: { label?: string; url: string }[] } {
  const out: { email?: string; phone?: string; links: { label?: string; url: string }[] } = { links: [] };
  const entries: string[] = [];
  let buf = '';
  for (const l of lines) {
    const t = l.text;
    buf = !buf ? t : /\s/.test(buf) ? `${buf} ${t}` : `${buf}${t}`;
    if (/\)$/.test(t) || EMAIL.test(buf) || PHONE.test(buf)) {
      entries.push(buf);
      buf = '';
    }
  }
  if (buf) entries.push(buf);
  for (const e of entries) {
    const labelled = e.match(/^(.*?)\s*\(([^)]+)\)$/);
    const value = (labelled ? labelled[1]! : e).trim();
    const label = labelled?.[2]?.trim();
    if (EMAIL.test(value)) out.email ??= value;
    else if (PHONE.test(value)) out.phone ??= value;
    else if (/^\S+\.\S+$/.test(value)) out.links.push({ label: label && /linkedin/i.test(value) ? 'LinkedIn' : label, url: /^https?:\/\//i.test(value) ? value : `https://${value}` });
  }
  return out;
}

/** «Spanish (Native or Bilingual)» / «Inglés (Competencia profesional completa)» → name and level. */
function readLanguage(text: string): Raw {
  const m = text.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  const name = (m ? m[1]! : text).trim();
  return { code: languageCodeFromName(name) ?? undefined, name, level: m ? languageLevel(m[2]!) : undefined };
}

// ---- the whole file -------------------------------------------------------------------------------------------------

export class NotLinkedInPdfError extends Error {}

const SIDE_KIND: Partial<Record<SideId, ItemKind>> = { skills: 'skill', certifications: 'certification', honors: 'award', publications: 'publication' };

/** Lines → an import (pure). Throws NotLinkedInPdfError when none of the profile's sections is found. */
export function mapLinkedInPdf(all: readonly PdfLine[]): ImportResult {
  const result: ImportResult = { source: 'linkedin-pdf', items: [], header: { contact: {} }, skipped: [], read: [], ignored: 0 };
  const lines = all.filter((l) => !FOOTER.test(l.text));
  const side = splitSections(
    lines.filter((l) => l.col === 'side'),
    SIDE_IDS,
  );
  const main = splitSections(
    lines.filter((l) => l.col === 'main'),
    MAIN_IDS,
  );
  const sections = [...side.sections, ...main.sections];
  if (!sections.some((s) => s.id)) throw new NotLinkedInPdfError('no LinkedIn profile sections in this PDF');

  const add = (kind: ItemKind, raws: Raw[], label: string) => raws.forEach((raw, i) => makeItem(result, kind, raw, { file: label, row: i + 1 }));
  let contact: ReturnType<typeof readContact> = { links: [] };
  let summary = '';
  for (const s of sections) {
    if (!s.id) {
      result.ignored += 1;
      continue;
    }
    if (s.lines.length === 0) continue;
    result.read.push(s.label);
    if (s.id === 'contact') contact = readContact(s.lines);
    else if (s.id === 'summary') summary = paragraphs(s.lines);
    else if (s.id === 'experience') add('experience', readExperience(s.lines), s.label);
    else if (s.id === 'education') add('education', readEducation(s.lines), s.label);
    else if (s.id === 'languages') add('language', s.lines.map((l) => readLanguage(l.text)), s.label);
    else {
      const kind = SIDE_KIND[s.id]!;
      const field = kind === 'award' || kind === 'publication' ? 'title' : 'name';
      add(kind, s.lines.map((l) => ({ [field]: l.text })), s.label);
    }
  }

  // The top of the main column: the name (largest type), the headline under it, the location last.
  const top = main.top;
  let name = '';
  let headline = '';
  let location = '';
  if (top.length) {
    const nameAt = top.reduce((best, l, i) => (l.size > top[best]!.size + 0.25 ? i : best), 0);
    name = top[nameAt]!.text;
    const after = top.slice(nameAt + 1).map((l) => l.text);
    if (after.length >= 2) {
      location = after[after.length - 1]!;
      headline = after.slice(0, -1).join(' ');
    } else headline = after[0] ?? '';
  }
  result.header = fitHeader({ displayName: name, headline, summary, contact: { email: contact.email, phone: contact.phone, location, links: contact.links } });
  return result;
}

/** Reads a picked PDF: pdf.js (lazy) → lines → import. Throws ScannedPdfError (no text) or NotLinkedInPdfError. */
export async function readLinkedInPdf(file: Blob): Promise<ImportResult> {
  return mapLinkedInPdf(groupLines(await readPdfRuns(file)));
}
