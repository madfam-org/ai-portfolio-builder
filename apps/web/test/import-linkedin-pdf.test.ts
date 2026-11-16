/**
 * The LinkedIn profile PDF import (components/import/linkedin-pdf.ts) over SYNTHETIC layouts
 * (test/fixtures/import/linkedin-pdf.ts, no real person): runs → lines per column, sections by label and size, roles
 * anchored on their dates (several roles under one company), education details, the contact column, a Spanish file
 * whose accented letters were lost, an unknown section kept apart, the footer dropped, and the dormant switch. Every
 * candidate must pass the API's own zod schema for its kind.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dateRange, groupLines, isDuration, mapLinkedInPdf, NotLinkedInPdfError, readContact, readExperience, sectionOf, type PdfLine } from '../src/components/import/linkedin-pdf.ts';
import type { ImportResult } from '../src/components/import/model.ts';
import { linkedInPdfImportEnabled } from '../src/lib/import-config.ts';
import { ITEM_CONTENT } from '../src/server/api/validation.ts';
import { LINKEDIN_PDF_EN, LINKEDIN_PDF_ES_LOSSY, PAGE, toRuns } from './fixtures/import/linkedin-pdf.ts';
import { buildLayoutPdf } from './import-pdf-helper.ts';

function assertValid(result: ImportResult) {
  assert.ok(result.items.length > 0, 'read-proof: items were produced');
  for (const item of result.items) {
    const r = ITEM_CONTENT[item.kind].safeParse(item.content);
    assert.ok(r.success, `${item.key} ${JSON.stringify(item.content)} ${r.success ? '' : JSON.stringify(r.error.issues)}`);
  }
}
const ofKind = (r: ImportResult, kind: string) => r.items.filter((i) => i.kind === kind).map((i) => i.content);

test('groupLines: runs split into the two columns, joined on one baseline, top to bottom, page by page', () => {
  const lines = groupLines([
    {
      ...PAGE,
      runs: [
        { str: 'Experience', x: 220, y: 600, size: 15.75, width: 80, eol: true },
        { str: 'Contact', x: 30, y: 740, size: 13, width: 50, eol: true },
        { str: 'Data', x: 220, y: 580, size: 10.5, width: 22, eol: false },
        { str: ' ', x: 242, y: 580, size: 10.5, width: 3, eol: false },
        { str: 'Engineer', x: 245, y: 580, size: 10.5, width: 45, eol: true },
        // Same baseline, far to the right of the left column's text: the gutter splits it.
        { str: 'Python', x: 30, y: 560, size: 10.5, width: 33, eol: false },
        { str: 'Built it', x: 220, y: 560, size: 10.5, width: 36, eol: true },
      ],
    },
    { ...PAGE, runs: [{ str: 'Education', x: 220, y: 750, size: 15.75, width: 70, eol: true }] },
  ]);
  assert.deepEqual(
    lines.map((l) => [l.page, l.col, l.text]),
    [
      [1, 'side', 'Contact'],
      [1, 'main', 'Experience'],
      [1, 'main', 'Data Engineer'],
      [1, 'side', 'Python'],
      [1, 'main', 'Built it'],
      [2, 'main', 'Education'],
    ],
  );
});

test('labels: English, Spanish and Spanish with lost accents; dates; total time at a company', () => {
  assert.equal(sectionOf('Experience'), 'experience');
  assert.equal(sectionOf('Educación'), 'education');
  assert.equal(sectionOf('Educaci n'), 'education');
  assert.equal(sectionOf('Honors-Awards'), 'honors');
  assert.equal(sectionOf('Aptitudes principales'), 'skills');
  assert.equal(sectionOf('Built the nightly ETL in Python and much more'), null);
  assert.deepEqual(dateRange('January 2023 - Present (1 year 11 months)'), { start: 'January 2023', end: '', current: true });
  assert.deepEqual(dateRange('octubre de 2022 - diciembre de 2022 (3 meses)'), { start: 'octubre de 2022', end: 'diciembre de 2022', current: false });
  assert.deepEqual(dateRange('2016 - 2020'), { start: '2016', end: '2020', current: false });
  assert.equal(dateRange('Data Engineer - Cooperativa'), null);
  for (const d of ['3 years 2 months', '1 year', '2 años 1 mes', '2 a os 1 mes', '1 a o 11 meses', '(4 yrs 2 mos)']) assert.ok(isDuration(d), d);
  for (const d of ['Data Engineer', '2023', 'Reports for 3 years of data']) assert.ok(!isDuration(d), d);
});

test('contact column: wrapped URL joined, email, phone, labelled links', () => {
  const line = (text: string): PdfLine => ({ page: 1, col: 'side', x: 30, y: 0, size: 10.5, text });
  const c = readContact(['ana.ejemplo@example.test', '+52 55 0000 0000 (Mobile)', 'www.linkedin.com/in/ana-', 'ejemplo-0000 (LinkedIn)', 'ana.example.test (Portfolio)'].map(line));
  assert.equal(c.email, 'ana.ejemplo@example.test');
  assert.equal(c.phone, '+52 55 0000 0000');
  assert.deepEqual(c.links, [
    { label: 'LinkedIn', url: 'https://www.linkedin.com/in/ana-ejemplo-0000' },
    { label: 'Portfolio', url: 'https://ana.example.test' },
  ]);
});

test('English PDF → header, three roles under two companies, education over a page break, left column items', () => {
  const r = mapLinkedInPdf(groupLines(toRuns(LINKEDIN_PDF_EN)));
  assertValid(r);
  assert.equal(r.source, 'linkedin-pdf');
  assert.deepEqual(r.read, ['Contact', 'Top Skills', 'Languages', 'Certifications', 'Honors-Awards', 'Summary', 'Experience', 'Education']);
  assert.equal(r.ignored, 1, 'Patents is a section of its own, skipped');
  assert.ok(!JSON.stringify(r).includes('SENTINEL'), 'nothing of the skipped section leaks into another');
  assert.ok(!JSON.stringify(r).includes('Page 1 of 2'), 'the footer is dropped');

  assert.equal(r.header.displayName, 'Ana Ejemplo');
  assert.equal(r.header.headline, 'Data engineer at Cooperativa Ejemplo | SQL, Python');
  assert.equal(r.header.summary, 'Data engineer who turns messy spreadsheets into reliable pipelines.\n\nSecond paragraph of the summary.');
  assert.equal(r.header.contact.location, 'Cuernavaca, Morelos, Mexico');
  assert.equal(r.header.contact.email, 'ana.ejemplo@example.test');
  assert.equal(r.header.contact.links?.length, 2);

  assert.deepEqual(ofKind(r, 'experience'), [
    { role: 'Data Engineer', organization: 'Cooperativa Ejemplo', location: 'Cuernavaca, Morelos, Mexico', summary: 'Built the nightly ETL in Python.', startDate: '2023-01', current: true },
    { role: 'Data Analyst', organization: 'Cooperativa Ejemplo', summary: 'Reports for the board.', startDate: '2021-10', endDate: '2022-12' },
    { role: 'Intern', organization: 'Fondo Ejemplo', location: 'Remote', startDate: '2020-06', endDate: '2020-08' },
  ]);
  assert.deepEqual(ofKind(r, 'education'), [
    { institution: 'Universidad Ejemplo', degree: 'Bachelor of Engineering', field: 'Computer Science', startDate: '2016', endDate: '2020' },
    { institution: 'Instituto Ejemplo', startDate: '2013', endDate: '2016' },
  ]);
  assert.deepEqual(ofKind(r, 'skill'), [{ name: 'Python' }, { name: 'SQL' }, { name: 'Data modeling' }]);
  assert.deepEqual(ofKind(r, 'language'), [
    { code: 'es', name: 'Spanish', level: 'native' },
    { code: 'en', name: 'English', level: 'C1' },
  ]);
  assert.deepEqual(ofKind(r, 'certification'), [{ name: 'Data Analyst Associate' }]);
  assert.deepEqual(ofKind(r, 'award'), [{ title: 'Best Thesis Award' }]);
  assert.deepEqual(
    r.items.filter((i) => i.kind === 'experience').map((i) => i.origin),
    [1, 2, 3].map((row) => ({ file: 'Experience', row })),
  );
});

test('Spanish PDF with lost accents → sections still found, roles and dates read, the place kept', () => {
  const r = mapLinkedInPdf(groupLines(toRuns(LINKEDIN_PDF_ES_LOSSY)));
  assertValid(r);
  assert.deepEqual(r.read, ['Contactar', 'Aptitudes principales', 'Idiomas', 'Extracto', 'Experiencia', 'Educaci n']);
  assert.equal(r.header.displayName, 'Luis Ejemplo');
  assert.equal(r.header.headline, 'Contador en Despacho Ejemplo');
  assert.equal(r.header.contact.location, 'rea metropolitana de Guadalajara');
  assert.deepEqual(ofKind(r, 'experience'), [
    { role: 'Contador', organization: 'Despacho Ejemplo', location: 'Guadalajara, Jalisco, M xico', startDate: '2023-01', current: true },
    { role: 'Auxiliar contable', organization: 'Despacho Ejemplo', startDate: '2022-10', endDate: '2022-12' },
  ]);
  assert.deepEqual(ofKind(r, 'education'), [{ institution: 'Universidad Ejemplo de Jalisco', degree: 'Licenciatura', field: 'Contadur a', startDate: '2018', endDate: '2022' }]);
  assert.equal(ofKind(r, 'language')[0]!.level, 'native');
});

test('a role title wrapped over two lines is one title under its company; equal sizes keep the one-line reading', () => {
  let y = 700;
  const at = (size: number, text: string): PdfLine => ({ page: 1, col: 'main', x: 220, y: (y -= 15), size, text });
  const body = (text: string) => at(10.5, text);
  const lines = [
    at(12, 'Club Ejemplo'),
    at(11.5, 'Founder, President (Summer 2011, Fall 2012) and'),
    at(11.5, 'Instructor'),
    body('September 2012 - April 2014 (1 year 8 months)'),
    body('Waterloo, ON'),
    body('Grew the club from 10 to 150 members over two terms.'),
    at(12, 'Grupo Ejemplo'),
    at(10.5, '2 years 1 month'),
    at(11.5, 'Head of Data and'),
    at(11.5, 'Analytics'),
    body('May 2010 - June 2012 (2 years 2 months)'),
    body('Built the reporting stack for the whole group.'),
  ];
  assert.deepEqual(
    readExperience(lines).map((e) => [e.role, e.organization, e.startDate]),
    [
      ['Founder, President (Summer 2011, Fall 2012) and Instructor', 'Club Ejemplo', 'September 2012'],
      ['Head of Data and Analytics', 'Grupo Ejemplo', 'May 2010'],
    ],
  );
  // Company and title set at the SAME size: nothing tells them apart, so the line above the date stays the role.
  y = 700;
  const flat = [at(11.5, 'Club Ejemplo'), at(11.5, 'Instructor'), body('September 2012 - April 2014 (1 year 8 months)'), body('Taught salsa to new members every week.')];
  assert.deepEqual(
    readExperience(flat).map((e) => [e.role, e.organization]),
    [['Instructor', 'Club Ejemplo']],
  );
});

test('a PDF that is not a LinkedIn profile is refused; the helper PDF is a real PDF', () => {
  const lines = groupLines([{ ...PAGE, runs: [{ str: 'Vacante: Recepcionista', x: 72, y: 700, size: 12, width: 120, eol: true }] }]);
  assert.throws(() => mapLinkedInPdf(lines), NotLinkedInPdfError);
  const pdf = Buffer.from(buildLayoutPdf(LINKEDIN_PDF_EN)).toString('latin1');
  assert.match(pdf, /^%PDF-1\.4/);
  assert.match(pdf, /\/Count 2/);
  assert.ok(pdf.includes('(Ana Ejemplo) Tj'));
});

test('CV_IMPORT_LINKEDIN_PDF: dormant unless explicitly on', () => {
  assert.equal(linkedInPdfImportEnabled({}), false);
  for (const v of ['', '0', 'false', 'off', 'yes', 'enabled', ' 2 ']) assert.equal(linkedInPdfImportEnabled({ CV_IMPORT_LINKEDIN_PDF: v }), false, v);
  for (const v of ['1', 'true', 'on', ' TRUE ']) assert.equal(linkedInPdfImportEnabled({ CV_IMPORT_LINKEDIN_PDF: v }), true, v);
});
