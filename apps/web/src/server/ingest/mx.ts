/**
 * W5-J: country and Mexican state from a location, ONLY when unambiguous (W5-H benchmarks salaries by state, so a wrong
 * state is worse than none).
 *
 * - Country: an explicit two-letter code, or a country name from a short list (México → MX …). «Nuevo México» /
 *   «New Mexico» are a US state, never MX.
 * - State: the 32 federal entities by full name and by the unambiguous official abbreviations (with their dots), plus a
 *   few cities that exist in one state only. Abbreviations that are also common words («Col.» = colonia, «Sin.»,
 *   «Son.», «Tab.», «Ver.») are left out. Longer names are matched first and consumed («Baja California Sur» never
 *   also counts as «Baja California»).
 * - A state is set only when exactly ONE code is found; names that also exist outside Mexico (Durango, Guerrero,
 *   Hidalgo, Colima, Mérida …) count only when the country is known to be Mexico.
 */
import type { MxStateCode } from './vocab.ts';

/** Lower-case, accents stripped (ñ kept as n), whitespace collapsed. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

type Alias = [alias: string, code: MxStateCode, ambiguous?: true];

const ALIASES: readonly Alias[] = [
  ['aguascalientes', 'MX-AGU'], ['ags.', 'MX-AGU'],
  ['baja california sur', 'MX-BCS'], ['b.c.s.', 'MX-BCS'],
  ['baja california', 'MX-BCN'], ['b.c.', 'MX-BCN'], ['tijuana', 'MX-BCN'], ['mexicali', 'MX-BCN'], ['ensenada', 'MX-BCN', true],
  ['campeche', 'MX-CAM'], ['camp.', 'MX-CAM'],
  ['chiapas', 'MX-CHP'], ['chis.', 'MX-CHP'],
  ['chihuahua', 'MX-CHH', true], ['chih.', 'MX-CHH'], ['ciudad juarez', 'MX-CHH'],
  ['ciudad de mexico', 'MX-CMX'], ['cdmx', 'MX-CMX'], ['cd. de mexico', 'MX-CMX'], ['cd mx', 'MX-CMX'], ['distrito federal', 'MX-CMX'],
  ['d.f.', 'MX-CMX'], ['mexico city', 'MX-CMX'],
  ['coahuila de zaragoza', 'MX-COA'], ['coahuila', 'MX-COA'], ['coah.', 'MX-COA'], ['saltillo', 'MX-COA'], ['torreon', 'MX-COA'],
  ['colima', 'MX-COL', true],
  ['durango', 'MX-DUR', true], ['dgo.', 'MX-DUR'],
  ['guanajuato', 'MX-GUA'], ['gto.', 'MX-GUA'], ['irapuato', 'MX-GUA'], ['celaya', 'MX-GUA'],
  ['guerrero', 'MX-GRO', true], ['gro.', 'MX-GRO'], ['acapulco', 'MX-GRO'],
  ['hidalgo', 'MX-HID', true], ['hgo.', 'MX-HID'], ['pachuca', 'MX-HID'],
  ['jalisco', 'MX-JAL'], ['jal.', 'MX-JAL'], ['guadalajara', 'MX-JAL', true], ['zapopan', 'MX-JAL'], ['tlaquepaque', 'MX-JAL'],
  ['estado de mexico', 'MX-MEX'], ['edo. de mexico', 'MX-MEX'], ['edo. mex.', 'MX-MEX'], ['edomex', 'MX-MEX'], ['state of mexico', 'MX-MEX'],
  ['toluca', 'MX-MEX'], ['naucalpan', 'MX-MEX'], ['tlalnepantla', 'MX-MEX'],
  ['michoacan de ocampo', 'MX-MIC'], ['michoacan', 'MX-MIC'], ['mich.', 'MX-MIC'], ['morelia', 'MX-MIC'],
  ['morelos', 'MX-MOR', true], ['mor.', 'MX-MOR'], ['cuernavaca', 'MX-MOR'],
  ['nayarit', 'MX-NAY'], ['nay.', 'MX-NAY'], ['tepic', 'MX-NAY'],
  ['nuevo leon', 'MX-NLE'], ['n.l.', 'MX-NLE'], ['monterrey', 'MX-NLE'], ['san pedro garza garcia', 'MX-NLE'],
  ['oaxaca', 'MX-OAX'], ['oax.', 'MX-OAX'],
  ['puebla', 'MX-PUE', true], ['pue.', 'MX-PUE'],
  ['queretaro de arteaga', 'MX-QUE'], ['queretaro', 'MX-QUE'], ['qro.', 'MX-QUE'],
  ['quintana roo', 'MX-ROO'], ['q. roo', 'MX-ROO'], ['cancun', 'MX-ROO'], ['playa del carmen', 'MX-ROO'],
  ['san luis potosi', 'MX-SLP'], ['s.l.p.', 'MX-SLP'],
  ['sinaloa', 'MX-SIN'], ['culiacan', 'MX-SIN'], ['mazatlan', 'MX-SIN'],
  ['sonora', 'MX-SON', true], ['hermosillo', 'MX-SON'],
  ['tabasco', 'MX-TAB'], ['villahermosa', 'MX-TAB'],
  ['tamaulipas', 'MX-TAM'], ['tamps.', 'MX-TAM'], ['reynosa', 'MX-TAM'], ['tampico', 'MX-TAM'],
  ['tlaxcala', 'MX-TLA'], ['tlax.', 'MX-TLA'],
  ['veracruz de ignacio de la llave', 'MX-VER'], ['veracruz', 'MX-VER'], ['xalapa', 'MX-VER'],
  ['yucatan', 'MX-YUC'], ['yuc.', 'MX-YUC'], ['merida', 'MX-YUC', true],
  ['zacatecas', 'MX-ZAC'], ['zac.', 'MX-ZAC'],
];
const BY_LENGTH = [...ALIASES].sort((a, b) => b[0].length - a[0].length);

const COUNTRY_NAMES: Record<string, string> = {
  mexico: 'MX', 'estados unidos mexicanos': 'MX', 'united states': 'US', 'estados unidos': 'US', usa: 'US', 'united states of america': 'US',
  espana: 'ES', spain: 'ES', colombia: 'CO', argentina: 'AR', chile: 'CL', peru: 'PE', canada: 'CA', brasil: 'BR', brazil: 'BR',
  guatemala: 'GT', 'costa rica': 'CR', uruguay: 'UY', ecuador: 'EC',
};

/** A country code from a schema.org `addressCountry` (code or name). Null when not recognised. */
export function countryCode(value: string): string | null {
  const v = value.trim();
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  if (/^mex$/i.test(v)) return 'MX';
  return COUNTRY_NAMES[fold(v)] ?? null;
}

/** «México»/«Mexico» as a word, not inside «Nuevo México» / «New Mexico» / «Ciudad de México» alone. */
export function mentionsMexico(text: string): boolean {
  const f = fold(text).replace(/\b(nuevo|new) mexico\b/g, ' ');
  return /(^|[^a-z])(mexico|mex\.?|mx)($|[^a-z])/.test(f);
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The state code when exactly one federal entity is named (see the module comment); else null. */
export function mxStateCode(location: string, knownCountry: string | null = null): MxStateCode | null {
  if (knownCountry && knownCountry !== 'MX') return null;
  let rest = ` ${fold(location).replace(/\b(nuevo|new) mexico\b/g, ' ')} `;
  const found = new Map<MxStateCode, boolean>();
  for (const [alias, code, ambiguous] of BY_LENGTH) {
    const re = new RegExp(`(^|[^a-z.])${escape(alias)}(?=$|[^a-z])`, 'g');
    if (!re.test(rest)) continue;
    rest = rest.replace(new RegExp(`(^|[^a-z.])${escape(alias)}(?=$|[^a-z])`, 'g'), '$1 ');
    found.set(code, (found.get(code) ?? false) || !ambiguous);
  }
  if (found.size !== 1) return null;
  const [[code, distinctive]] = [...found.entries()] as [[MxStateCode, boolean]];
  const mexico = knownCountry === 'MX' || mentionsMexico(location);
  return distinctive || mexico ? code : null;
}
