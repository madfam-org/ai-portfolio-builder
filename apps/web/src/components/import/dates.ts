/**
 * Export dates → the API's partial date (`YYYY`, `YYYY-MM` or `YYYY-MM-DD`). Accepts what LinkedIn and JSON Resume
 * write in English or Spanish: «2020», «Jan 2020», «January 2020», «ene. 2020», «enero de 2020», «sept 2020»,
 * «2020-01», «2020-01-15», «01/2020», «Jan 15, 2020», «15 ene 2020», «15/01/2020». An ambiguous day/month pair
 * (both ≤ 12) keeps the year and month only when the order is certain, else the year. Unreadable → undefined.
 */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, ene: 1, enero: 1,
  feb: 2, february: 2, febrero: 2,
  mar: 3, march: 3, marzo: 3,
  apr: 4, april: 4, abr: 4, abril: 4,
  may: 5, mayo: 5,
  jun: 6, june: 6, junio: 6,
  jul: 7, july: 7, julio: 7,
  aug: 8, august: 8, ago: 8, agosto: 8,
  sep: 9, sept: 9, september: 9, set: 9, septiembre: 9, setiembre: 9,
  oct: 10, october: 10, octubre: 10,
  nov: 11, november: 11, noviembre: 11,
  dec: 12, december: 12, dic: 12, diciembre: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');
const validYear = (y: number) => y >= 1900 && y <= 2100;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function build(y: number, m?: number, d?: number): string | undefined {
  if (!validYear(y)) return undefined;
  if (m === undefined) return String(y);
  if (m < 1 || m > 12) return undefined;
  if (d === undefined) return `${y}-${pad(m)}`;
  if (d < 1 || d > daysIn(y, m)) return `${y}-${pad(m)}`;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function monthOf(word: string): number | undefined {
  const w = word
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\./g, '');
  return MONTHS[w];
}

export function toPartialDate(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return undefined;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})$/))) return build(Number(m[1]));
  // ISO-ish: 2020-01, 2020-1-5, 2020/01, 2020-01-15T00:00:00Z
  if ((m = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?(?:[T ].*)?$/))) return build(Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : undefined);
  // 01/2020, 1-2020
  if ((m = s.match(/^(\d{1,2})[-/.](\d{4})$/))) return build(Number(m[2]), Number(m[1]));
  // 15/01/2020 or 01/15/2020: certain only when one side is > 12.
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) {
    const [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (a > 12 && b <= 12) return build(y, b, a);
    if (b > 12 && a <= 12) return build(y, a, b);
    return build(y);
  }
  // Jan 2020, ene. 2020, enero de 2020, Jan 15, 2020
  if ((m = s.match(/^([A-Za-zÀ-ÿ.]+) (?:de )?(?:(\d{1,2}),? )?(?:de )?(\d{4})$/))) {
    const month = monthOf(m[1]!);
    if (month === undefined) return undefined;
    return build(Number(m[3]), month, m[2] ? Number(m[2]) : undefined);
  }
  // 15 Jan 2020, 15 de enero de 2020
  if ((m = s.match(/^(\d{1,2}) (?:de )?([A-Za-zÀ-ÿ.]+),? (?:de )?(\d{4})$/))) {
    const month = monthOf(m[2]!);
    if (month === undefined) return undefined;
    return build(Number(m[3]), month, Number(m[1]));
  }
  return undefined;
}
