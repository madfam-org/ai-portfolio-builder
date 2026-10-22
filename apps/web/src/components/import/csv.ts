/**
 * RFC 4180 CSV for the person's own export files: a leading BOM, quoted fields with commas, doubled quotes and line
 * breaks inside, CRLF / LF / CR line ends. Headers are matched by a normalized key (lower case, no accents, letters
 * and digits only), so «Started On», «started on» and «Fecha de inicio» each have one stable key.
 */

/** Rows of fields. Blank lines are dropped. */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const endRow = () => {
    row.push(field);
    field = '';
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      endRow();
      if (text[i + 1] === '\n') i += 1;
    } else if (ch === '\n') {
      endRow();
    } else {
      field += ch;
    }
    i += 1;
  }
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

/** «Fecha de finalización» → «fechadefinalizacion». */
export function headerKey(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export interface CsvTable {
  /** Normalized header keys, in column order. */
  keys: string[];
  /** One record per data row: normalized header key → trimmed value. */
  rows: Record<string, string>[];
}

/**
 * The table under the first row (among the first five) that names at least one of `known` header keys; files with a
 * preamble line before the header still read. Null when no such row exists.
 */
export function readTable(input: string, known: readonly string[]): CsvTable | null {
  const rows = parseCsv(input);
  const wanted = new Set(known);
  const headerAt = rows.slice(0, 5).findIndex((r) => r.some((h) => wanted.has(headerKey(h))));
  if (headerAt < 0) return null;
  const keys = rows[headerAt]!.map(headerKey);
  const records = rows.slice(headerAt + 1).map((r) => {
    const rec: Record<string, string> = {};
    keys.forEach((k, idx) => {
      if (k && rec[k] === undefined) rec[k] = (r[idx] ?? '').trim();
    });
    return rec;
  });
  return { keys, rows: records.filter((rec) => Object.values(rec).some((v) => v !== '')) };
}

/** The first non-empty value among the given header keys (aliases), or ''. */
export function pick(row: Record<string, string>, aliases: readonly string[]): string {
  for (const a of aliases) {
    const v = row[a];
    if (v) return v;
  }
  return '';
}
