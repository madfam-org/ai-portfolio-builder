/**
 * W5-J: fields from plain posting text (a paste, a PDF or Word file's text, a page's readable text). Deterministic and
 * conservative: only LABELED lines are read («Empresa: …», «Ubicación: …», «Sueldo: …», «Job type: …»), plus a line that
 * is nothing but a work mode («Remoto», «Home office», «Híbrido», «Presencial»), the layout boards such as OCC and
 * Computrabajo use. The first short line is offered as the title only when no label names it ('first-line', which the
 * preview marks as a suggestion). Unlabeled prose is never mined for fields.
 */
import { clean, employmentType, isoDate, parseSalary, workMode } from './fields.ts';
import { countryCode, fold, mentionsMexico, mxStateCode } from './mx.ts';
import type { DraftFields, IntakeNote } from './types.ts';
import type { Provenance } from './vocab.ts';

type Label = 'title' | 'company' | 'location' | 'employment' | 'mode' | 'salary' | 'posted' | 'until';

/** Folded label words (accents stripped, lower case) → field. The label must start the line and end with «:». */
const LABELS: readonly [Label, readonly string[]][] = [
  ['title', ['puesto', 'vacante', 'cargo', 'posicion', 'nombre del puesto', 'job title', 'title', 'position', 'role']],
  ['company', ['empresa', 'compania', 'organizacion', 'empleador', 'company', 'employer', 'organization', 'hiring company']],
  ['location', ['ubicacion', 'localidad', 'ciudad', 'lugar de trabajo', 'zona', 'location', 'job location', 'city', 'based in']],
  ['employment', ['tipo de empleo', 'tipo de contrato', 'tipo de contratacion', 'contratacion', 'contrato', 'jornada', 'horario', 'employment type', 'job type', 'contract type', 'schedule']],
  ['mode', ['modalidad', 'modalidad de trabajo', 'esquema', 'esquema de trabajo', 'work mode', 'workplace type', 'workplace', 'remote']],
  ['salary', ['sueldo', 'salario', 'sueldo mensual', 'salario mensual', 'sueldo bruto', 'salario bruto', 'compensacion', 'rango salarial', 'salary', 'pay', 'compensation', 'salary range', 'pay range']],
  ['posted', ['fecha de publicacion', 'publicado', 'publicada', 'date posted', 'posted', 'posted on']],
  ['until', ['vigencia', 'fecha limite', 'fecha de cierre', 'cierra', 'valid through', 'apply by', 'closing date', 'deadline']],
];
const LABEL_RE = new RegExp(`^(${LABELS.flatMap(([, words]) => words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).sort((a, b) => b.length - a.length).join('|')})\\s*:\\s*(.*)$`);
const LABEL_OF = new Map(LABELS.flatMap(([label, words]) => words.map((w) => [w, label] as const)));

/** A whole line that only states a work mode (with an optional bullet or icon character in front). */
const MODE_LINE = /^[\p{P}\p{S}\s]*(remoto|remote|home office|hibrido|hybrid|presencial|on-?site|teletrabajo)[\p{P}\s]*$/u;

/** «12/10/2026» or «2026-10-12» → YYYY-MM-DD (day first, the es-MX order). Relative dates («hace 3 días») are ignored. */
function textDate(value: string): string | null {
  const iso = isoDate(value);
  if (iso) return iso;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value.trim());
  return m ? isoDate(`${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`) : null;
}

export interface TextFields {
  fields: DraftFields;
  notes: IntakeNote[];
}

export function fieldsFromText(input: string): TextFields {
  const fields: DraftFields = {};
  const notes: IntakeNote[] = [];
  const lines = input.normalize('NFC').split(/\r\n|\r|\n/).map((l) => l.replace(/\s+/g, ' ').trim());
  const set = <K extends keyof DraftFields>(key: K, value: NonNullable<DraftFields[K]>['value'] | null, from: Provenance) => {
    if (value !== null && value !== undefined && value !== '' && !fields[key]) fields[key] = { value, from } as DraftFields[K];
  };
  for (let i = 0; i < lines.length && i < 400; i += 1) {
    const line = lines[i]!;
    if (!line) continue;
    const folded = fold(line);
    const m = LABEL_RE.exec(folded);
    if (m) {
      const label = LABEL_OF.get(m[1]!)!;
      // The value: the rest of the line (original case), or the next non-empty line when the label stands alone.
      let value = line.slice(line.length - m[2]!.length).trim();
      if (!value) value = lines.slice(i + 1).find((l) => l !== '') ?? '';
      if (!value || value.length > 300) continue;
      switch (label) {
        case 'title':
          set('title', clean(value), 'labeled-text');
          break;
        case 'company':
          set('company', clean(value), 'labeled-text');
          break;
        case 'location': {
          set('location', clean(value), 'labeled-text');
          set('workMode', workMode(value), 'labeled-text');
          break;
        }
        case 'employment':
          set('employmentType', employmentType(value), 'labeled-text');
          break;
        case 'mode':
          set('workMode', workMode(value), 'labeled-text');
          break;
        case 'salary': {
          const s = parseSalary(value);
          if (s) {
            set('salaryMin', s.min, 'labeled-text');
            set('salaryMax', s.max, 'labeled-text');
            set('salaryCurrency', s.currency, 'labeled-text');
            set('salaryPeriod', s.period, 'labeled-text');
            if (!s.currency || !s.period) notes.push('salary_partial');
          }
          break;
        }
        case 'posted':
          set('datePosted', textDate(value), 'labeled-text');
          break;
        case 'until':
          set('validThrough', textDate(value), 'labeled-text');
          break;
      }
      continue;
    }
    if (MODE_LINE.test(folded)) set('workMode', workMode(folded), 'text');
  }
  if (!fields.title) {
    const first = lines.find((l) => l !== '');
    if (first && first.length >= 3 && first.length <= 120 && !LABEL_RE.test(fold(first)) && !/[.!?]$/.test(first)) set('title', clean(first), 'first-line');
  }
  const location = fields.location?.value;
  if (location) {
    // A country only by its name in the last part («…, España»), never a two-letter tail («Austin, TX» is Texas).
    const tail = location.split(',').pop()?.trim() ?? '';
    const country = mentionsMexico(location) ? 'MX' : tail.length > 3 ? countryCode(tail) : null;
    const state = mxStateCode(location, country);
    if (state) {
      set('stateCode', state, fields.location!.from);
      set('countryCode', 'MX', fields.location!.from);
    } else if (country) set('countryCode', country, fields.location!.from);
  }
  return { fields, notes };
}
