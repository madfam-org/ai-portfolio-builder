/**
 * What the benchmark needs from a saved job, and nothing else: the title, the Mexican state (ISO 3166-2:MX) and the
 * posting's stated salary. Pure and deterministic.
 *
 * STRUCTURED FIELDS FIRST. Lane W5-J (migration 0002) types the job: `countryCode` (ISO 3166-1), `stateCode`
 * (ISO 3166-2, only when unambiguous) and a STATED salary (`salaryMin`/`salaryMax` in `salaryCurrency` per
 * `salaryPeriod`: hour, day, week, month or year). Rows from before W5-J have none of them: the state then comes from
 * the free-text location when it names one state unambiguously (`Ciudad de México`, `Monterrey, Nuevo León`).
 * `stateSource` says which one was used, so the page can say so. A job outside Mexico gets the national Mexican
 * figure and the page says so. test/hcm-facts.test.ts pins the field names.
 */

/** ISO 3166-2:MX code -> INEGI entidad key, as Symbiosis HCM checks it against INEGI's own catalog. */
export const MX_STATES: Readonly<Record<string, { inegi: string; names: readonly string[] }>> = {
  'MX-AGU': { inegi: '01', names: ['aguascalientes'] },
  'MX-BCN': { inegi: '02', names: ['baja california'] },
  'MX-BCS': { inegi: '03', names: ['baja california sur'] },
  'MX-CAM': { inegi: '04', names: ['campeche'] },
  'MX-COA': { inegi: '05', names: ['coahuila', 'coahuila de zaragoza'] },
  'MX-COL': { inegi: '06', names: ['colima'] },
  'MX-CHP': { inegi: '07', names: ['chiapas'] },
  'MX-CHH': { inegi: '08', names: ['chihuahua'] },
  'MX-CMX': { inegi: '09', names: ['ciudad de mexico', 'cdmx', 'distrito federal'] },
  'MX-DUR': { inegi: '10', names: ['durango'] },
  'MX-GUA': { inegi: '11', names: ['guanajuato'] },
  'MX-GRO': { inegi: '12', names: ['guerrero'] },
  'MX-HID': { inegi: '13', names: ['hidalgo'] },
  'MX-JAL': { inegi: '14', names: ['jalisco'] },
  'MX-MEX': { inegi: '15', names: ['estado de mexico', 'edomex', 'edo mex', 'edo de mexico'] },
  'MX-MIC': { inegi: '16', names: ['michoacan', 'michoacan de ocampo'] },
  'MX-MOR': { inegi: '17', names: ['morelos'] },
  'MX-NAY': { inegi: '18', names: ['nayarit'] },
  'MX-NLE': { inegi: '19', names: ['nuevo leon'] },
  'MX-OAX': { inegi: '20', names: ['oaxaca'] },
  'MX-PUE': { inegi: '21', names: ['puebla'] },
  'MX-QUE': { inegi: '22', names: ['queretaro'] },
  'MX-ROO': { inegi: '23', names: ['quintana roo'] },
  'MX-SLP': { inegi: '24', names: ['san luis potosi'] },
  'MX-SIN': { inegi: '25', names: ['sinaloa'] },
  'MX-SON': { inegi: '26', names: ['sonora'] },
  'MX-TAB': { inegi: '27', names: ['tabasco'] },
  'MX-TAM': { inegi: '28', names: ['tamaulipas'] },
  'MX-TLA': { inegi: '29', names: ['tlaxcala'] },
  'MX-VER': { inegi: '30', names: ['veracruz', 'veracruz de ignacio de la llave'] },
  'MX-YUC': { inegi: '31', names: ['yucatan'] },
  'MX-ZAC': { inegi: '32', names: ['zacatecas'] },
};

export const STATE_FIELDS = ['stateCode'] as const;
export const COUNTRY_FIELD = 'countryCode';
export const SALARY_FIELDS = { min: 'salaryMin', max: 'salaryMax', currency: 'salaryCurrency', period: 'salaryPeriod' } as const;
const MONTHLY = new Set(['month', 'monthly', 'mensual', 'mes']);
const TITLE_MAX = 120;

export interface StatedSalary {
  min: number | null;
  max: number | null;
  currency: string | null;
  period: string | null;
}

export interface JobFacts {
  title: string;
  /** ISO 3166-1 country the job states (W5-J), or null when it states none. */
  country: string | null;
  state: string | null;
  stateSource: 'job_field' | 'location_text' | null;
  salary: StatedSalary | null;
  /** A monthly MXN amount comparable with the ENOE figures (the midpoint of a stated range), else null. */
  comparableMonthlyMxn: number | null;
}

const fold = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** An ISO (`MX-CMX`), three-letter (`CMX`) or INEGI (`09`, `9`) state code -> ISO, else null. */
export function normalizeStateCode(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const text = String(raw).trim().toUpperCase();
  if (MX_STATES[text]) return text;
  if (/^[A-Z]{3}$/.test(text) && MX_STATES[`MX-${text}`]) return `MX-${text}`;
  if (/^\d{1,2}$/.test(text)) {
    const key = text.padStart(2, '0');
    return Object.entries(MX_STATES).find(([, s]) => s.inegi === key)?.[0] ?? null;
  }
  return null;
}

/**
 * The state a free-text location names, when exactly one state matches. Longest names first, so «Baja California
 * Sur» is not read as «Baja California», and «Estado de México» wins over «México». A bare «México» is the country,
 * not a state: it yields null.
 */
export function stateFromLocation(location: string): string | null {
  const text = ` ${fold(location)} `;
  if (!text.trim()) return null;
  const hits = new Set<string>();
  let remaining = text;
  const names = Object.entries(MX_STATES)
    .flatMap(([iso, s]) => s.names.map((name) => ({ iso, name })))
    .sort((a, b) => b.name.length - a.name.length);
  for (const { iso, name } of names) {
    if (remaining.includes(` ${name} `)) {
      hits.add(iso);
      remaining = remaining.replace(` ${name} `, ' ');
    }
  }
  return hits.size === 1 ? [...hits][0]! : null;
}

function amount(raw: unknown): number | null {
  const n = typeof raw === 'string' ? Number(raw.replace(/[,\s$]/g, '')) : typeof raw === 'number' ? raw : NaN;
  return Number.isFinite(n) && n > 0 && n < 100_000_000 ? n : null;
}

function salaryOf(row: Record<string, unknown>): StatedSalary | null {
  const nested = row.salary && typeof row.salary === 'object' ? (row.salary as Record<string, unknown>) : null;
  const pick = (flat: string, key: string) => row[flat] ?? nested?.[key];
  const min = amount(pick(SALARY_FIELDS.min, 'min'));
  const max = amount(pick(SALARY_FIELDS.max, 'max'));
  if (min === null && max === null) return null;
  const currency = pick(SALARY_FIELDS.currency, 'currency');
  const period = pick(SALARY_FIELDS.period, 'period');
  return {
    min,
    max,
    currency: typeof currency === 'string' ? currency.toUpperCase().slice(0, 3) : null,
    period: typeof period === 'string' ? period.toLowerCase().slice(0, 20) : null,
  };
}

/** The title HCM may receive: no control characters, collapsed spaces, at most 120 characters. */
export function sanitizeTitle(title: string): string {
  return title
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TITLE_MAX)
    .trim();
}

export function jobFacts(row: { title: string; location?: string | null } & Record<string, unknown>): JobFacts {
  let state: string | null = null;
  let stateSource: JobFacts['stateSource'] = null;
  const rawCountry = row[COUNTRY_FIELD];
  const country = typeof rawCountry === 'string' && /^[A-Za-z]{2}$/.test(rawCountry) ? rawCountry.toUpperCase() : null;
  const abroad = country !== null && country !== 'MX';
  for (const field of abroad ? [] : STATE_FIELDS) {
    const iso = normalizeStateCode(row[field]);
    if (iso) {
      state = iso;
      stateSource = 'job_field';
      break;
    }
  }
  if (!state && !abroad && typeof row.location === 'string') {
    state = stateFromLocation(row.location);
    stateSource = state ? 'location_text' : null;
  }
  const salary = salaryOf(row);
  let comparableMonthlyMxn: number | null = null;
  if (salary && (salary.currency ?? 'MXN') === 'MXN' && salary.period && MONTHLY.has(salary.period)) {
    const values = [salary.min, salary.max].filter((v): v is number => v !== null);
    comparableMonthlyMxn = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  }
  return { title: sanitizeTitle(row.title), country, state, stateSource, salary, comparableMonthlyMxn };
}
