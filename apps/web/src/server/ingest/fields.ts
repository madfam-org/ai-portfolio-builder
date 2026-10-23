/**
 * W5-J: deterministic normalisers from what a posting STATES to the typed job fields. Each returns null when the input
 * does not say it plainly; nothing is guessed (a salary «a convenir» is no salary, «$» without a code is no currency).
 */
import { fold } from './mx.ts';
import { SALARY_MAX_AMOUNT, type EmploymentType, type SalaryPeriod, type WorkMode } from './vocab.ts';

const SCHEMA_EMPLOYMENT: Record<string, EmploymentType> = {
  full_time: 'full_time', fulltime: 'full_time', part_time: 'part_time', parttime: 'part_time', contractor: 'contract', contract: 'contract',
  temporary: 'temporary', intern: 'internship', internship: 'internship', volunteer: 'volunteer', per_diem: 'per_diem', other: 'other',
};

/** Words in postings (es-MX and en) → employment type, matched on the folded text. Order: most specific first. */
const EMPLOYMENT_WORDS: readonly [RegExp, EmploymentType][] = [
  [/\b(medio tiempo|tiempo parcial|part[ -]?time)\b/, 'part_time'],
  [/\b(tiempo completo|jornada completa|full[ -]?time|fulltime)\b/, 'full_time'],
  [/\b(practicas( profesionales)?|becari[oa]|pasantia|trainee|internship|intern)\b/, 'internship'],
  [/\b(por proyecto|freelance|honorarios|contractor|contrato por obra)\b/, 'contract'],
  [/\b(temporal|eventual|temporary|seasonal|por temporada)\b/, 'temporary'],
  [/\b(voluntariado|voluntari[oa]|volunteer)\b/, 'volunteer'],
];

/** schema.org `employmentType` (string or list) or a free-text value → one type, or null. */
export function employmentType(value: unknown): EmploymentType | null {
  const values = Array.isArray(value) ? value : [value];
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const key = v.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (SCHEMA_EMPLOYMENT[key]) return SCHEMA_EMPLOYMENT[key];
    const f = fold(v);
    for (const [re, type] of EMPLOYMENT_WORDS) if (re.test(f)) return type;
  }
  return null;
}

const WORK_MODE_WORDS: readonly [RegExp, WorkMode][] = [
  [/\b(hibrido|hybrid|mixto)\b/, 'hybrid'],
  [/\b(remoto|remote|home ?office|teletrabajo|a distancia|telecommute|work from home|wfh)\b/, 'remote'],
  [/\b(presencial|en sitio|on[ -]?site|in[ -]office|en oficina)\b/, 'onsite'],
];

/** Free text («Remoto», «Híbrido», «Presencial», «Home office») → work mode, or null. «Hybrid» wins over «remote». */
export function workMode(value: string): WorkMode | null {
  const f = fold(value);
  for (const [re, mode] of WORK_MODE_WORDS) if (re.test(f)) return mode;
  return null;
}

const UNIT_PERIOD: Record<string, SalaryPeriod> = { HOUR: 'hour', DAY: 'day', WEEK: 'week', MONTH: 'month', YEAR: 'year' };

/** schema.org `unitText` (HOUR … YEAR) → period. */
export function periodFromUnit(unit: unknown): SalaryPeriod | null {
  return typeof unit === 'string' ? (UNIT_PERIOD[unit.trim().toUpperCase()] ?? null) : null;
}

const PERIOD_WORDS: readonly [RegExp, SalaryPeriod][] = [
  [/(\bpor hora\b|\/ ?(hr|hora|hour)\b|\bper hour\b|\bhourly\b|\bla hora\b)/, 'hour'],
  [/(\bpor dia\b|\bdiario\b|\/ ?(dia|day)\b|\bper day\b|\bdaily\b)/, 'day'],
  [/(\bsemanal(es)?\b|\bpor semana\b|\/ ?(semana|week)\b|\bper week\b|\bweekly\b)/, 'week'],
  [/(\bmensual(es)?\b|\bal mes\b|\bpor mes\b|\/ ?(mes|month|mo)\b|\bper month\b|\bmonthly\b|\bbruto mensual\b)/, 'month'],
  [/(\banual(es)?\b|\bal ano\b|\bpor ano\b|\/ ?(ano|year|yr)\b|\bper (year|annum)\b|\byearly\b|\bannual(ly)?\b)/, 'year'],
];

const CURRENCY_WORDS: readonly [RegExp, string][] = [
  [/(^|[^a-z])(mxn|m\.n\.|pesos mexicanos|mexican pesos)(?=$|[^a-z])/, 'MXN'],
  [/(^|[^a-z])(usd|us\$|dolares estadounidenses|us dollars)(?=$|[^a-z])/, 'USD'],
  [/(^|[^a-z])(eur|euros?)(?=$|[^a-z])|€/, 'EUR'],
  [/(^|[^a-z])(cop|ars|clp|pen|brl|cad|gbp)(?=$|[^a-z])/, ''],
];

function currencyOf(f: string): string | null {
  for (const [re, code] of CURRENCY_WORDS) {
    const m = re.exec(f);
    if (m) return code || m[2]!.toUpperCase();
  }
  return null;
}

/** A number as postings write it: 15,000 · 15.000 · 15 000 · 15,000.50 · 15.000,50 · 25k · 25 mil. */
export function parseAmount(raw: string, suffix: string | undefined): number | null {
  let s = raw.replace(/\s/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    const decimal = lastComma > lastDot ? ',' : '.';
    s = s.replace(decimal === ',' ? /\./g : /,/g, '').replace(',', '.');
  } else if (lastComma !== -1) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (lastDot !== -1) {
    s = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s;
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  let n = Number(s);
  const k = (suffix ?? '').toLowerCase();
  if (k === 'k' || k === 'mil') n *= 1000;
  if (!Number.isFinite(n) || n <= 0 || n > SALARY_MAX_AMOUNT) return null;
  return Math.round(n * 100) / 100;
}

export interface Salary {
  min: number | null;
  max: number | null;
  currency: string | null;
  period: SalaryPeriod | null;
}

const NUM = String.raw`(\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)`;
const SUFFIX = String.raw`\s?(k|mil)?\b`;
const RANGE = new RegExp(String.raw`(?:\$|us\$|mxn|usd)?\s?${NUM}${SUFFIX}\s*(?:mxn|usd)?\s*(?:-|–|—|a|to|hasta|y)\s*(?:\$|us\$|mxn|usd)?\s?${NUM}${SUFFIX}`, 'i');
const SINGLE_MARKED = new RegExp(String.raw`(?:\$|us\$|€)\s?${NUM}${SUFFIX}|${NUM}${SUFFIX}\s?(?:mxn|usd|eur|pesos|dolares)`, 'i');

/**
 * A salary STATED in text («$15,000 - $20,000 MXN mensuales», «Sueldo: 25k USD al año»), or null («A convenir»,
 * «Competitivo», no number). A single amount sets min = max. The currency and the period only when written.
 */
export function parseSalary(text: string): Salary | null {
  const f = fold(text);
  if (!/\d/.test(f)) return null;
  let min: number | null = null;
  let max: number | null = null;
  const range = RANGE.exec(f);
  // «25-30k»: the suffix of the second amount applies to a bare first one.
  const lo = range ? parseAmount(range[1]!, range[2] ?? (range[4] && Number(range[1]!.replace(/\D/g, '')) < 1000 ? range[4] : undefined)) : null;
  const hi = range ? parseAmount(range[3]!, range[4]) : null;
  // A range needs a money marker («$», a currency) or amounts of 1 000 and more: «3 a 5 bonos» is not a salary.
  if (range && (/\$|€|mxn|usd|eur|pesos/.test(range[0]) || ((lo ?? 0) >= 1000 && (hi ?? 0) >= 1000))) {
    [min, max] = lo !== null && hi !== null && lo > hi ? [hi, lo] : [lo, hi];
  } else {
    const single = SINGLE_MARKED.exec(f);
    // Unmarked: only a text holding exactly one number of 1 000 or more («Sueldo: 18000 mensuales»).
    const bare = single ? null : [...f.matchAll(new RegExp(`${NUM}${SUFFIX}`, 'gi'))];
    if (!single && !(bare && bare.length === 1 && (parseAmount(bare[0]![1]!, bare[0]![2]) ?? 0) >= 1000)) return null;
    const amount = single ? (single[1] !== undefined ? parseAmount(single[1], single[2]) : parseAmount(single[3]!, single[4])) : parseAmount(bare![0]![1]!, bare![0]![2]);
    min = amount;
    max = amount;
  }
  if (min === null && max === null) return null;
  let period: SalaryPeriod | null = null;
  for (const [re, p] of PERIOD_WORDS) {
    if (re.test(f)) {
      period = p;
      break;
    }
  }
  return { min, max, currency: currencyOf(f), period };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * W7 (B3): «Wed Oct 14 00:00:00 UTC 2026», the Java `Date.toString()` form some career sites write into their
 * JobPosting microdata (seen on SAP SuccessFactors Career Site Builder pages) → [year, month, day] as written.
 */
function javaDateParts(value: string): [string, string, string] | null {
  const m = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) ([A-Za-z]{3}) (\d{1,2}) \d{2}:\d{2}:\d{2} [A-Za-z]{1,5} (\d{4})$/.exec(value);
  const month = m ? MONTHS.indexOf(m[1]!.toLowerCase()) : -1;
  if (!m || month < 0) return null;
  return [m[3]!, String(month + 1).padStart(2, '0'), m[2]!.padStart(2, '0')];
}

/** An ISO date or date-time (or a Java `Date.toString()`) → YYYY-MM-DD (a real calendar date), else null. */
export function isoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  const parts = iso ? ([iso[1]!, iso[2]!, iso[3]!] as const) : javaDateParts(value.trim());
  if (!parts) return null;
  const [y, mo, day] = parts.map(Number) as [number, number, number];
  const d = new Date(Date.UTC(y, mo - 1, day));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== day) return null;
  if (y < 1990 || y > 2100) return null;
  return `${parts[0]}-${parts[1]}-${parts[2]}`;
}

/** Epoch milliseconds (Lever `createdAt`) → YYYY-MM-DD. */
export function dateFromEpochMs(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return isoDate(new Date(value).toISOString());
}

/** One line, trimmed, at most `max` characters (titles and company names). */
export function clean(value: unknown, max = 200): string | null {
  if (typeof value !== 'string') return null;
  const v = value.replace(/\s+/g, ' ').trim();
  return v ? v.slice(0, max) : null;
}
