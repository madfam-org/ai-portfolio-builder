/**
 * W5-J extraction on synthetic fixtures (test/fixtures/ingest): JSON-LD (plain, @graph, entity-escaped), microdata,
 * Open Graph + labeled text, pastes in Spanish and English, browser captures; and the normalisers (salary, dates,
 * employment type, work mode, Mexican states). Fields are set only when stated; each carries its provenance.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { draftFromCapture, draftFromHtml, draftFromText } from '../src/server/ingest/extract.ts';
import { employmentType, isoDate, parseSalary, workMode } from '../src/server/ingest/fields.ts';
import { htmlToText, pageParts } from '../src/server/ingest/html.ts';
import { mxStateCode } from '../src/server/ingest/mx.ts';
import type { DraftFields } from '../src/server/ingest/types.ts';

const FIX = join(import.meta.dirname, 'fixtures', 'ingest');
const read = (name: string) => readFileSync(join(FIX, name), 'utf8');
const values = (f: DraftFields) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v!.value]));
const froms = (f: DraftFields) => new Set(Object.values(f).map((v) => v!.from));

test('JSON-LD JobPosting on a board page: every stated field, from json-ld; the estimate is ignored', () => {
  const d = draftFromHtml(read('jsonld-board.html'), new URL('https://empleos.example.org/vacante/12345-desarrolladora-backend-sr?utm=x'), 'url')!;
  assert.deepEqual(values(d.fields), {
    title: 'Desarrolladora Backend Sr.',
    company: 'Ejemplo Software S.A. de C.V.',
    location: 'Guadalajara, Jalisco, MX',
    countryCode: 'MX',
    stateCode: 'MX-JAL',
    employmentType: 'full_time',
    salaryMin: 45000,
    salaryMax: 60000,
    salaryCurrency: 'MXN',
    salaryPeriod: 'month',
    datePosted: '2026-10-12',
    validThrough: '2026-11-30',
  });
  assert.deepEqual([...froms(d.fields)], ['json-ld']);
  assert.equal(d.sourceTextFrom, 'json-ld');
  assert.match(d.sourceText, /^Buscamos una persona desarrolladora backend/);
  assert.match(d.sourceText, /• Diseñar APIs\n• Revisar código/);
  assert.equal(d.sourceUrl, 'https://empleos.example.org/vacante/12345-desarrolladora-backend-sr');
  assert.deepEqual(d.notes, []);
  assert.ok(!JSON.stringify(d).includes('99999'), 'estimatedSalary is not a stated salary');
});

test('JSON-LD in an @graph with an entity-escaped description, TELECOMMUTE and an hourly salary', () => {
  const d = draftFromHtml(read('jsonld-graph.html'), new URL('https://careers.example.org/jobs/7'), 'url')!;
  const v = values(d.fields);
  assert.equal(v.title, 'Data Engineer (Remote, LATAM)');
  assert.equal(v.company, 'Acme Ejemplo Inc.');
  assert.equal(v.workMode, 'remote');
  assert.equal(v.countryCode, 'MX', 'from applicantLocationRequirements of a remote job');
  assert.equal(v.stateCode, undefined);
  assert.equal(v.employmentType, 'contract');
  assert.deepEqual([v.salaryMin, v.salaryMax, v.salaryCurrency, v.salaryPeriod], [40, 40, 'USD', 'hour']);
  assert.equal(v.datePosted, '2026-10-01');
  assert.equal(v.validThrough, undefined, '2026-02-30 is not a date');
  assert.match(d.sourceText, /About the role\nBuild pipelines in Python & SQL\./);
});

test('microdata JobPosting (nested itemscopes) maps like JSON-LD, from microdata', () => {
  const d = draftFromHtml(read('microdata.html'), new URL('https://portal.example.org/v/9'), 'url')!;
  assert.deepEqual(values(d.fields), {
    title: 'Analista de Nómina',
    company: 'Servicios Ejemplo del Bajío',
    location: 'León, Guanajuato, MX',
    countryCode: 'MX',
    stateCode: 'MX-GUA',
    employmentType: 'full_time',
    datePosted: '2026-09-28',
  });
  assert.deepEqual([...froms(d.fields)], ['microdata']);
  assert.match(d.sourceText, /Cálculo de nómina quincenal/);
});

test('no structured data: Open Graph title, labeled lines and a mode line; the page text is the posting', () => {
  const d = draftFromHtml(read('opengraph-labeled.html'), new URL('https://bolsa.example.org/e/1'), 'url')!;
  assert.deepEqual(values(d.fields), {
    title: 'Ejecutivo de Ventas Foráneo',
    company: 'Distribuidora Ejemplo del Norte',
    location: 'Monterrey, N.L.',
    stateCode: 'MX-NLE',
    countryCode: 'MX',
    salaryMin: 18000,
    salaryMax: 22000,
    salaryCurrency: 'MXN',
    salaryPeriod: 'month',
    employmentType: 'full_time',
    workMode: 'onsite',
  });
  assert.equal(d.fields.title!.from, 'open-graph');
  assert.equal(d.fields.company!.from, 'labeled-text');
  assert.equal(d.fields.workMode!.from, 'text');
  assert.ok(d.notes.includes('no_structured_data'));
  assert.equal(d.sourceTextFrom, 'text');
  assert.match(d.sourceText, /Requisitos: licenciatura trunca/);
});

test('a page with no posting is unreadable (null), never a made-up draft', () => {
  assert.equal(draftFromHtml(read('no-posting.html'), new URL('https://x.example.org/'), 'url'), null);
  assert.equal(draftFromText('   ', 'paste'), null);
  assert.equal(draftFromText('hola', 'paste'), null);
});

test('paste (es-MX): labels, a first-line title suggestion, a day-first date, a range without a currency code', () => {
  const d = draftFromText(read('paste-es.txt'), 'paste')!;
  assert.deepEqual(values(d.fields), {
    company: 'Manufacturas Ejemplo de Querétaro',
    location: 'Santiago de Querétaro, Qro.',
    workMode: 'hybrid',
    salaryMin: 28000,
    salaryMax: 32000,
    salaryPeriod: 'month',
    employmentType: 'full_time',
    datePosted: '2026-10-15',
    title: 'Coordinadora de Recursos Humanos',
    stateCode: 'MX-QUE',
    countryCode: 'MX',
  });
  assert.equal(d.fields.title!.from, 'first-line');
  assert.equal(d.fields.salaryCurrency, undefined, '«$» alone states no currency');
  assert.ok(d.notes.includes('salary_partial'));
  assert.equal(d.sourceText, read('paste-es.txt').trim());
});

test('paste (en): labels in English; «Remote — Mexico» is remote in MX with no state', () => {
  const d = draftFromText(read('paste-en.txt'), 'paste')!;
  const v = values(d.fields);
  assert.equal(v.title, 'Senior Product Designer');
  assert.equal(v.company, 'Acme Ejemplo');
  assert.equal(v.workMode, 'remote');
  assert.equal(v.countryCode, 'MX');
  assert.equal(v.stateCode, undefined);
  assert.equal(v.employmentType, 'contract');
  assert.deepEqual([v.salaryMin, v.salaryMax, v.salaryCurrency, v.salaryPeriod], [4000, 5500, 'USD', 'month']);
  assert.equal(v.datePosted, '2026-10-05');
});

test('a pasted page (HTML or bare JSON-LD) is read as a page', () => {
  const d = draftFromText(read('jsonld-board.html'), 'paste')!;
  assert.equal(d.fields.title!.from, 'json-ld');
  const ld = draftFromText('{"@type":"JobPosting","title":"Chofer","description":"Rutas locales en Toluca con licencia federal vigente y experiencia comprobable de tres años."}', 'paste')!;
  assert.equal(ld.fields.title!.value, 'Chofer');
});

test('a browser capture (bookmarklet): JSON-LD strings, meta, microdata HTML and text, like a fetched page', () => {
  const parts = pageParts(read('jsonld-board.html'));
  const d = draftFromCapture({ url: 'https://empleos.example.org/vacante/12345', canonical: null, title: parts.title ?? '', jsonLd: parts.jsonLd, meta: parts.meta, microdata: '', text: parts.text }, 'capture')!;
  assert.equal(d.sourceKind, 'capture');
  assert.equal(d.fields.stateCode!.value, 'MX-JAL');
  assert.equal(d.sourceUrl, 'https://empleos.example.org/vacante/12345-desarrolladora-backend-sr');
  const md = draftFromCapture({ url: null, canonical: null, title: '', jsonLd: ['{not json'], meta: {}, microdata: read('microdata.html'), text: 'Analista de Nómina' }, 'capture')!;
  assert.equal(md.fields.company!.value, 'Servicios Ejemplo del Bajío');
  const loose = draftFromCapture({ url: null, canonical: null, title: '', jsonLd: ['<!-- {"@type":"JobPosting","title":"Cajera","description":"Atención a clientes en sucursal, manejo de caja y cortes diarios, horario rotativo.",} -->'], meta: {}, microdata: '', text: '' }, 'capture')!;
  assert.equal(loose.fields.title!.value, 'Cajera', 'common JSON-LD slips are tolerated');
});

test('salary: ranges, single amounts, k/mil, separators, currency and period only when written', () => {
  assert.deepEqual(parseSalary('$15,000 - $20,000 MXN mensuales'), { min: 15000, max: 20000, currency: 'MXN', period: 'month' });
  assert.deepEqual(parseSalary('De 15.000 a 20.000 pesos al mes'), { min: 15000, max: 20000, currency: null, period: 'month' });
  assert.deepEqual(parseSalary('25-30k USD al año'), { min: 25000, max: 30000, currency: 'USD', period: 'year' });
  assert.deepEqual(parseSalary('$18,000.50 mensual'), { min: 18000.5, max: 18000.5, currency: null, period: 'month' });
  assert.deepEqual(parseSalary('€ 2.500,00 / mes'), { min: 2500, max: 2500, currency: 'EUR', period: 'month' });
  assert.deepEqual(parseSalary('18000 quincenal'), { min: 18000, max: 18000, currency: null, period: null });
  assert.deepEqual(parseSalary('$150 por hora'), { min: 150, max: 150, currency: null, period: 'hour' });
  assert.equal(parseSalary('A convenir'), null);
  assert.equal(parseSalary('Competitivo + prestaciones'), null);
  assert.equal(parseSalary('3 a 5 bonos al año'), null);
  assert.equal(parseSalary('Sueldo base más 2 bonos'), null);
});

test('employment type, work mode and dates', () => {
  assert.equal(employmentType('FULL_TIME'), 'full_time');
  assert.equal(employmentType(['OTHER_THING', 'INTERN']), 'internship');
  assert.equal(employmentType('Medio tiempo'), 'part_time');
  assert.equal(employmentType('Prácticas profesionales'), 'internship');
  assert.equal(employmentType('Por proyecto'), 'contract');
  assert.equal(employmentType('Indefinido'), null);
  assert.equal(workMode('Home Office'), 'remote');
  assert.equal(workMode('Híbrido (3 días en oficina)'), 'hybrid');
  assert.equal(workMode('En sitio'), 'onsite');
  assert.equal(workMode('Lunes a viernes'), null);
  assert.equal(isoDate('2026-10-12T10:00:00Z'), '2026-10-12');
  assert.equal(isoDate('2026-13-01'), null);
  assert.equal(isoDate('ayer'), null);
});

test('Mexican state only when unambiguous', () => {
  assert.equal(mxStateCode('Ciudad de México, CDMX'), 'MX-CMX');
  assert.equal(mxStateCode('Monterrey, N.L.'), 'MX-NLE');
  assert.equal(mxStateCode('La Paz, Baja California Sur'), 'MX-BCS');
  assert.equal(mxStateCode('Tijuana, Baja California'), 'MX-BCN');
  assert.equal(mxStateCode('León, Guanajuato'), 'MX-GUA');
  assert.equal(mxStateCode('Naucalpan, Estado de México'), 'MX-MEX');
  assert.equal(mxStateCode('Remoto, México'), null, 'the country is not a state');
  assert.equal(mxStateCode('Durango, Colorado'), null, 'ambiguous name without Mexico');
  assert.equal(mxStateCode('Durango, México'), 'MX-DUR');
  assert.equal(mxStateCode('Durango', 'MX'), 'MX-DUR');
  assert.equal(mxStateCode('Santa Fe, Nuevo México'), null);
  assert.equal(mxStateCode('Guadalajara, Jalisco o Zapopan, Jalisco'), 'MX-JAL');
  assert.equal(mxStateCode('CDMX o Monterrey'), null, 'two states: none');
  assert.equal(mxStateCode('Madrid', 'ES'), null);
  assert.equal(mxStateCode('Col. Roma, Cuauhtémoc'), null, '«Col.» is a colonia, not Colima');
});

test('htmlToText: lists, entities and block structure; scripts and styles never become text', () => {
  assert.equal(htmlToText('<p>Uno &amp; dos</p><ul><li>a</li><li>b</li></ul><script>alert(1)</script><style>p{}</style>'), 'Uno & dos\n• a\n• b');
  assert.equal(htmlToText('texto plano'), 'texto plano');
  const parts = pageParts('<div><p>sin cerrar<li>uno<li>dos</div><!-- comentario --><span hidden>oculto</span>');
  assert.equal(parts.text, 'sin cerrar\n• uno\n• dos');
});

test('hostile markup stays linear: 200 000 unclosed tags parse quickly', () => {
  const started = Date.now();
  pageParts('<div a=b c'.repeat(20_000) + '<p>' + '<!x'.repeat(50_000) + '<a '.repeat(50_000));
  assert.ok(Date.now() - started < 3000, `took ${Date.now() - started} ms`);
});
