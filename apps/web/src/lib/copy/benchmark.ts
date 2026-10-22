/**
 * Strings of the market-range panel on `/empleos/:id` (W5-H). es (es-MX) is the source; en mirrors it.
 *
 * Truth rules (R85): every figure comes from Symbiosis HCM's answer, which cites INEGI's ENOE; the panel names the
 * source, the quarter and n next to every range. It is official survey data about what people in the occupation
 * declare they earn, never «our survey», never an offer and never a prediction. When HCM withholds a figure the panel
 * says «sin datos suficientes» and shows nothing in its place. No «%» sign: the reporting share HCM returns (0-1) is
 * written as «de cada 100», like the rest of the jobs pages (jobs.spec.ts checks the page carries no percentage).
 */
import type { Locale } from '../routing.ts';

export interface BenchmarkCopy {
  heading: string;
  intro: string;
  privacy: string;
  loading: string;
  dormant: string;
  unavailable: string;
  retry: string;
  occupation: string;
  method: Record<'alias_exact' | 'alias_fuzzy' | 'catalog_fuzzy' | 'sinco_code', string>;
  confidence: string;
  ignored: string;
  noSeniority: string;
  scopeState: string;
  scopeNational: string;
  fallback: string;
  noStateRecords: string;
  stateFromField: string;
  stateFromLocation: string;
  noState: string;
  median: string;
  middle: string;
  wide: string;
  tailsWithheld: string;
  perMonth: string;
  chartLabel: string;
  posting: string;
  postingRange: string;
  positions: Record<'below_p10' | 'p10_p25' | 'p25_p50' | 'p50_p75' | 'p75_p90' | 'above_p90' | 'below_p25' | 'above_p75', string>;
  postingCaveat: string;
  noSalary: string;
  notComparable: string;
  insufficient: string;
  unresolved: string;
  ambiguous: string;
  unknown: string;
  candidates: string;
  sourceLine: string;
  population: string;
  reporting: string;
  sourceLink: string;
  methodology: string;
  thresholds: string;
}

export const BENCHMARK_COPY: Record<Locale, BenchmarkCopy> = {
  es: {
    heading: 'Rango de ingreso en el mercado',
    intro:
      'Estadística oficial de INEGI sobre lo que declaran ganar al mes las personas asalariadas en la ocupación de esta vacante. No es una oferta ni una predicción.',
    privacy: 'Para consultarla enviamos sólo el puesto y el estado, nunca tu nombre, tu perfil ni tu CV.',
    loading: 'Consultando los datos del mercado…',
    dormant: 'La comparación con el mercado laboral todavía no está disponible.',
    unavailable: 'No pudimos consultar los datos del mercado en este momento.',
    retry: 'Intentar de nuevo',
    occupation: 'Ocupación (SINCO {code}): {title}',
    method: {
      alias_exact: 'coincide con un puesto de la lista revisada «{phrase}»',
      alias_fuzzy: 'clasificada por parecido con «{phrase}»',
      catalog_fuzzy: 'clasificada por parecido con el catálogo de INEGI',
      sinco_code: 'código SINCO indicado',
    },
    confidence: 'Confianza de la clasificación: {value} (de 0 a 1).',
    ignored: 'Palabras que no cuentan para la clasificación: {terms}.',
    noSeniority: 'La ENOE no registra antigüedad ni nivel del puesto: el rango cubre a todas las personas de la ocupación.',
    scopeState: 'Dato de {state}.',
    scopeNational: 'Dato nacional.',
    fallback: 'Para {state} hay {n} registros, menos de los {min} necesarios; se muestra el dato nacional.',
    noStateRecords: 'Para {state} no hay registros de esta ocupación; se muestra el dato nacional.',
    stateFromField: 'Estado de la vacante: {state}.',
    stateFromLocation: 'Estado leído de la ubicación «{location}»: {state}.',
    noState: 'La vacante no indica un estado: se muestra el dato nacional.',
    median: 'Mediana (P50)',
    middle: 'La mitad central (P25 a P75)',
    wide: 'Del P10 al P90',
    tailsWithheld: 'P10 y P90 no se publican con menos de {min} registros.',
    perMonth: '{amount} al mes',
    chartLabel: 'Rango de ingreso mensual: P25 {p25}, mediana {p50}, P75 {p75}.',
    posting: 'Salario del anuncio: {amount} al mes, {position}.',
    postingRange: '(punto medio del rango {min} a {max})',
    positions: {
      below_p10: 'por debajo del percentil 10',
      p10_p25: 'entre los percentiles 10 y 25',
      p25_p50: 'entre el percentil 25 y la mediana',
      p50_p75: 'entre la mediana y el percentil 75',
      p75_p90: 'entre los percentiles 75 y 90',
      above_p90: 'por encima del percentil 90',
      below_p25: 'por debajo del percentil 25',
      above_p75: 'por encima del percentil 75',
    },
    postingCaveat:
      'Comparación aproximada: un anuncio suele publicar sueldo bruto y la ENOE registra el monto que la persona declara, sin distinguir bruto de neto.',
    noSalary: 'Esta vacante no indica un salario mensual en pesos que se pueda comparar.',
    notComparable: 'El salario del anuncio no es mensual en pesos, así que no lo comparamos.',
    insufficient: 'Sin datos suficientes: la ENOE tiene {n} registros con ingreso para esta ocupación y se necesitan {min}.',
    unresolved: 'No pudimos clasificar «{title}» en una ocupación de INEGI con suficiente confianza.',
    ambiguous: '«{title}» corresponde a varias ocupaciones; no elegimos una por ti.',
    unknown: 'La ocupación no está en el catálogo de INEGI de este trimestre.',
    candidates: 'Ocupaciones cercanas:',
    sourceLine: 'Datos de la ENOE (INEGI), {period}, n = {n}.',
    population:
      'Personas asalariadas de 15 a 97 años con un monto declarado; población representada: {population} personas.',
    reporting: 'De cada 100 personas de esa población, {share} declararon un monto; el resto no se incluye.',
    sourceLink: 'Encuesta Nacional de Ocupación y Empleo (INEGI)',
    methodology: 'Cómo se calcula',
    thresholds: 'Con menos de {min} registros no se publica ningún percentil; P10 y P90 requieren {tails}.',
  },
  en: {
    heading: 'Market income range',
    intro:
      'Official INEGI statistics on what salaried people in this job’s occupation declare they earn per month. Not an offer and not a prediction.',
    privacy: 'To look it up we send only the job title and the state, never your name, your profile or your CV.',
    loading: 'Looking up market data…',
    dormant: 'The labour-market comparison is not available yet.',
    unavailable: 'We could not reach the market data right now.',
    retry: 'Try again',
    occupation: 'Occupation (SINCO {code}): {title}',
    method: {
      alias_exact: 'matches the reviewed title «{phrase}»',
      alias_fuzzy: 'classified by similarity to «{phrase}»',
      catalog_fuzzy: 'classified by similarity to INEGI’s catalogue',
      sinco_code: 'SINCO code given',
    },
    confidence: 'Classification confidence: {value} (0 to 1).',
    ignored: 'Words that do not count for the classification: {terms}.',
    noSeniority: 'The ENOE does not record seniority or level: the range covers everyone in the occupation.',
    scopeState: 'Figures for {state}.',
    scopeNational: 'National figures.',
    fallback: '{state} has {n} records, fewer than the {min} needed; national figures are shown.',
    noStateRecords: '{state} has no records for this occupation; national figures are shown.',
    stateFromField: 'Job state: {state}.',
    stateFromLocation: 'State read from the location «{location}»: {state}.',
    noState: 'The job names no state: national figures are shown.',
    median: 'Median (P50)',
    middle: 'Middle half (P25 to P75)',
    wide: 'P10 to P90',
    tailsWithheld: 'P10 and P90 are not published with fewer than {min} records.',
    perMonth: '{amount} a month',
    chartLabel: 'Monthly income range: P25 {p25}, median {p50}, P75 {p75}.',
    posting: 'Posted salary: {amount} a month, {position}.',
    postingRange: '(midpoint of {min} to {max})',
    positions: {
      below_p10: 'below the 10th percentile',
      p10_p25: 'between the 10th and 25th percentiles',
      p25_p50: 'between the 25th percentile and the median',
      p50_p75: 'between the median and the 75th percentile',
      p75_p90: 'between the 75th and 90th percentiles',
      above_p90: 'above the 90th percentile',
      below_p25: 'below the 25th percentile',
      above_p75: 'above the 75th percentile',
    },
    postingCaveat:
      'Approximate comparison: postings usually state gross pay, while the ENOE records the amount people declare, without separating gross from net.',
    noSalary: 'This job states no monthly salary in pesos to compare.',
    notComparable: 'The posted salary is not monthly in pesos, so it is not compared.',
    insufficient: 'Not enough data: the ENOE has {n} records with income for this occupation and {min} are needed.',
    unresolved: 'We could not place «{title}» in an INEGI occupation with enough confidence.',
    ambiguous: '«{title}» fits several occupations; we do not pick one for you.',
    unknown: 'The occupation is not in this quarter’s INEGI catalogue.',
    candidates: 'Nearby occupations:',
    sourceLine: 'ENOE data (INEGI), {period}, n = {n}.',
    population: 'Salaried people aged 15 to 97 who declared an amount; population represented: {population} people.',
    reporting: 'Of every 100 people in that population, {share} declared an amount; the rest are not included.',
    sourceLink: 'National Occupation and Employment Survey (INEGI)',
    methodology: 'How it is computed',
    thresholds: 'Below {min} records no percentile is published; P10 and P90 need {tails}.',
  },
};

/** «2026-Q2» as the locale writes a quarter: 2026-T2 (es-MX), 2026 Q2 (en). */
export function quarterLabel(label: string, locale: Locale): string {
  const [year, q] = label.split('-Q');
  return locale === 'en' ? `${year} Q${q}` : `${year}-T${q}`;
}

export function money(amount: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

export function count(n: number, locale: Locale): string {
  return n.toLocaleString(locale === 'en' ? 'en-US' : 'es-MX');
}
