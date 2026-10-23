/**
 * W5-J: schema.org `JobPosting` (https://schema.org/JobPosting) → draft fields. Most boards and career sites publish it
 * as JSON-LD for search engines (Google's job-posting structured data); microdata becomes the same object shape
 * (html.ts `microdataObject`), so ONE mapper reads both. Only properties the posting states are mapped;
 * `estimatedSalary` is an estimate, not a stated salary, and is ignored.
 */
import { clean, employmentType, isoDate, periodFromUnit } from './fields.ts';
import { decodeEntities, htmlToText } from './html.ts';
import { countryCode, mentionsMexico, mxStateCode } from './mx.ts';
import type { DraftFields } from './types.ts';
import { CURRENCY_PATTERN, SALARY_MAX_AMOUNT, type Provenance } from './vocab.ts';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);

function isJobPosting(o: Obj): boolean {
  return list(o['@type']).some((t) => typeof t === 'string' && /(^|[/:#])JobPosting$/.test(t.trim()));
}

/** JSON.parse, then once more after the usual publishing slips (HTML comment or CDATA wrappers, trailing commas, raw control characters). */
export function parseJsonLoose(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const fixed = text
      .replace(/^\s*(<!--|\/\/\s*<!\[CDATA\[|<!\[CDATA\[)/, '')
      .replace(/(--!?>|\/\/\s*\]\]>|\]\]>)\s*$/, '')
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/[\u0000-\u001f]+/g, ' ');
    try {
      return JSON.parse(fixed) as unknown;
    } catch {
      return undefined;
    }
  }
}

/** Every JobPosting object in a set of JSON-LD blocks (top level, `@graph`, lists, nested entities; depth ≤ 6). */
export function findJobPostings(values: readonly unknown[]): Obj[] {
  const found: Obj[] = [];
  const visit = (v: unknown, depth: number) => {
    if (depth > 6 || found.length >= 20) return;
    if (Array.isArray(v)) v.forEach((x) => visit(x, depth + 1));
    else if (isObj(v)) {
      if (isJobPosting(v)) found.push(v);
      else for (const x of Object.values(v)) if (typeof x === 'object') visit(x, depth + 1);
    }
  };
  values.forEach((v) => visit(v, 0));
  return found;
}

function text(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (isObj(v) && typeof v.name === 'string') return v.name;
  return null;
}

/** A posting's `description`: HTML (sometimes entity-escaped HTML) → readable text. */
export function descriptionText(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const html = /&lt;\/?[a-z]/i.test(value) ? decodeEntities(value) : value;
  const out = htmlToText(html);
  return out || null;
}

function addressParts(place: unknown): { locality: string | null; region: string | null; country: string | null } {
  const p = isObj(place) ? place : {};
  const address = p.address ?? (isObj(place) && place['@type'] === 'PostalAddress' ? place : undefined);
  if (typeof address === 'string') return { locality: clean(address), region: null, country: null };
  const a = isObj(address) ? address : {};
  return { locality: clean(text(a.addressLocality)), region: clean(text(a.addressRegion)), country: clean(text(a.addressCountry)) };
}

function amount(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(v) ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 && n <= SALARY_MAX_AMOUNT ? Math.round(n * 100) / 100 : null;
}

/** Maps one JobPosting object; `from` is 'json-ld' or 'microdata'. */
export function mapJobPosting(o: Obj, from: Provenance): { fields: DraftFields; description: string | null; url: string | null } {
  const fields: DraftFields = {};
  const set = <K extends keyof DraftFields>(key: K, value: NonNullable<DraftFields[K]>['value'] | null) => {
    if (value !== null && value !== undefined && value !== '') fields[key] = { value, from } as DraftFields[K];
  };
  // Some career sites (seen on Workday) entity-escape names inside JSON-LD: «Watches &amp; Fine Jewelry».
  const plain = (v: string | null) => (v === null ? null : decodeEntities(v));
  set('title', clean(plain(text(o.title) ?? text(o.name))));
  set('company', clean(plain(text(o.hiringOrganization))));

  const places = list(o.jobLocation).slice(0, 10).map(addressParts);
  const labels = places.map((p) => [p.locality, p.region, p.country].filter((x, i, all) => x && all.indexOf(x) === i).join(', ')).filter(Boolean);
  const uniq = [...new Set(labels)];
  if (uniq.length) set('location', clean(uniq.length > 3 ? `${uniq.slice(0, 3).join(' · ')} (+${uniq.length - 3})` : uniq.join(' · '), 200));
  const remote = list(o.jobLocationType).some((t) => typeof t === 'string' && /telecommute/i.test(t));
  if (remote) set('workMode', 'remote');

  const first = places[0];
  let country = first?.country ? countryCode(first.country) : null;
  if (!country && remote && !places.length) {
    const req = list(o.applicantLocationRequirements).map(text).filter((x): x is string => !!x);
    if (req.length === 1) country = countryCode(req[0]!);
  }
  if (!country && first && mentionsMexico([first.locality, first.region].filter(Boolean).join(', '))) country = 'MX';
  set('countryCode', country);
  // A state only from the FIRST location, and only when every listed location is in that same state.
  if (first && (country === 'MX' || country === null)) {
    const codes = places.map((p) => mxStateCode([p.locality, p.region].filter(Boolean).join(', '), country ?? (p.country ? countryCode(p.country) : null)));
    if (codes.length && codes.every((c) => c && c === codes[0])) {
      set('stateCode', codes[0]!);
      if (!country) set('countryCode', 'MX');
    }
  }

  set('employmentType', employmentType(o.employmentType));

  const salary = list(o.baseSalary).find(isObj);
  if (salary) {
    const value = salary.value;
    const q = isObj(value) ? value : {};
    const exact = amount(isObj(value) ? q.value : value);
    const min = amount(q.minValue) ?? exact;
    const max = amount(q.maxValue) ?? exact;
    if (min !== null || max !== null) {
      const [lo, hi] = min !== null && max !== null && min > max ? [max, min] : [min, max];
      set('salaryMin', lo);
      set('salaryMax', hi);
      const currency = typeof salary.currency === 'string' ? salary.currency.trim().toUpperCase() : null;
      set('salaryCurrency', currency && CURRENCY_PATTERN.test(currency) ? currency : null);
      set('salaryPeriod', periodFromUnit(q.unitText ?? salary.unitText));
    }
  }
  set('datePosted', isoDate(o.datePosted));
  set('validThrough', isoDate(o.validThrough));
  return { fields, description: descriptionText(o.description), url: typeof o.url === 'string' ? o.url : null };
}
