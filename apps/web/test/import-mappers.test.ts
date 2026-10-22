/**
 * The import mappers over synthetic fixture files (test/fixtures/import, no real person): LinkedIn export CSVs →
 * profile items and header (English and Spanish headers, odd dates, quoted multi-line fields, missing files and
 * columns), the ZIP path that opens ONLY the mapped files, JSON Resume → items, and the JSON Resume export round trip.
 * Every candidate must pass the API's own zod schema for its kind (server/api/validation.ts ITEM_CONTENT).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { NotJsonResumeError, fluencyLevel, parseJsonResume, skillLevel } from '../src/components/import/json-resume.ts';
import { LINKEDIN_FILE_NAMES, NotLinkedInError, languageLevel, mapLinkedIn, readLinkedInZip, selectEntries } from '../src/components/import/linkedin.ts';
import type { ImportResult } from '../src/components/import/model.ts';
import { listEntries } from '../src/components/import/zip.ts';
import { toJsonResume } from '../src/server/api/portability.ts';
import { ITEM_CONTENT, contactSchema } from '../src/server/api/validation.ts';
import { RecordingBlob, buildZip, dirFiles, entrySpan } from './import-zip-helper.ts';

const FIX = join(import.meta.dirname, 'fixtures', 'import');
const read = (...p: string[]) => readFileSync(join(FIX, ...p), 'utf8');
const LI = ['Profile', 'Positions', 'Education', 'Skills', 'Certifications', 'Languages', 'Projects', 'Honors', 'Publications', 'Volunteering'] as const;
const liFiles = () => Object.fromEntries(LI.map((n) => [n.toLowerCase(), read('linkedin', `${n}.csv`)]));

function assertValid(result: ImportResult) {
  assert.ok(result.items.length > 0, 'read-proof: items were produced');
  for (const item of result.items) {
    const r = ITEM_CONTENT[item.kind].safeParse(item.content);
    assert.ok(r.success, `${item.key} ${JSON.stringify(item.content)} ${r.success ? '' : JSON.stringify(r.error.issues)}`);
    assert.ok(item.tags.length <= 50);
  }
  assert.ok(contactSchema.safeParse(result.header.contact).success, JSON.stringify(result.header.contact));
}

const byKind = (r: ImportResult, kind: string) => r.items.filter((i) => i.kind === kind).map((i) => i.content);

test('LinkedIn CSVs → items of every mapped kind and the header; rows without the minimum are skipped', () => {
  const r = mapLinkedIn(liFiles(), 2);
  assertValid(r);
  assert.equal(r.source, 'linkedin');
  assert.equal(r.ignored, 2);
  assert.deepEqual(r.read, LINKEDIN_FILE_NAMES);
  assert.deepEqual(r.header, {
    displayName: 'Ana Ejemplo',
    headline: 'Ingeniera de datos, de tiempo completo',
    summary: 'Diez años con datos.\nMe gusta enseñar.',
    contact: {
      location: 'Cuernavaca, Morelos',
      links: [
        { label: 'ana.example.test', url: 'https://ana.example.test' },
        { label: 'portafolio.example.test', url: 'https://portafolio.example.test/ana' },
      ],
    },
  });
  const exp = byKind(r, 'experience');
  assert.equal(exp.length, 3);
  assert.deepEqual(exp[0], {
    role: 'Ingeniera de datos',
    organization: 'Acme Datos',
    location: 'Ciudad de México, México',
    startDate: '2021-01',
    current: true,
    summary: 'Diseñé el almacén de datos, con "SQL" y Python.\nLideré a 3 personas.',
  });
  assert.deepEqual(exp[1], { role: 'Analista', organization: 'Cooperativa Ejemplo', location: 'Cuernavaca', startDate: '2018-03', endDate: '2020-12', summary: 'Reportes semanales' });
  const odd = r.items.find((i) => i.content.organization === 'Fecha Rara SA')!;
  assert.equal(odd.content.startDate, '2016-01');
  assert.equal(odd.content.endDate, undefined);
  assert.deepEqual(odd.notes, ['date_dropped']);
  assert.deepEqual(r.skipped, [{ file: 'Positions.csv', row: 3 }], 'the row without a company');
  assert.deepEqual(byKind(r, 'education')[0], {
    institution: 'Universidad de Ejemplo',
    degree: 'Licenciatura en Matemáticas',
    startDate: '2012',
    endDate: '2016',
    summary: 'Tesis sobre series de tiempo\n\nClub de ajedrez',
  });
  assert.deepEqual(byKind(r, 'skill'), [{ name: 'Python' }, { name: 'SQL' }, { name: 'python' }]);
  const certs = byKind(r, 'certification');
  assert.deepEqual(certs[0], { name: 'Certificado de Datos', issuer: 'Consejo Ejemplo', date: '2022-06', expiresOn: '2025-06', url: 'https://cert.example.test/123', credentialId: 'ABC-123' });
  assert.equal(certs[1]!.url, undefined, 'javascript: URLs never survive');
  assert.deepEqual(r.items.find((i) => i.content.name === 'Curso sin enlace')!.notes, ['url_dropped']);
  assert.deepEqual(byKind(r, 'language'), [{ name: 'Español', level: 'native' }, { name: 'Inglés', level: 'C1' }, { name: 'Francés', level: 'A2' }, { name: 'Náhuatl' }]);
  assert.deepEqual(byKind(r, 'project'), [{ name: 'Tablero abierto', url: 'https://www.example.test/tablero', startDate: '2023-02', summary: 'Un tablero de datos públicos' }]);
  assert.deepEqual(byKind(r, 'award'), [{ title: 'Premio a la Innovación', date: '2019-11', summary: 'Primer lugar regional' }]);
  assert.deepEqual(byKind(r, 'publication'), [{ title: 'Series de tiempo para todos', publisher: 'Revista Ejemplo', date: '2020-04', url: 'https://revista.example.test/series', summary: 'Artículo de divulgación' }]);
  assert.deepEqual(byKind(r, 'volunteering'), [{ role: 'Voluntaria', organization: 'Banco de Alimentos Ejemplo', startDate: '2015-01', endDate: '2016-12', summary: 'Clasificación de donativos\n\n(Poverty Alleviation)' }]);
});

test('Spanish headers, CRLF, BOM and Spanish dates; missing files are simply absent', () => {
  const r = mapLinkedIn({ positions: read('linkedin-es', 'Positions.csv'), languages: read('linkedin-es', 'Languages.csv') });
  assertValid(r);
  assert.deepEqual(r.read, ['Positions.csv', 'Languages.csv']);
  assert.deepEqual(byKind(r, 'experience'), [
    { role: 'Desarrolladora', organization: 'Empresa, S.A. de C.V.', location: 'Puebla', startDate: '2019-01', endDate: '2020-12', summary: 'Línea uno\r\nLínea dos' },
    { role: 'Consultora', organization: 'Otra Empresa', startDate: '2021-09', current: true },
  ]);
  assert.deepEqual(byKind(r, 'language'), [{ name: 'Alemán', level: 'B1' }, { name: 'Portugués', level: 'C1' }]);
  assert.deepEqual(r.header, { contact: {} });
  // Missing columns: a Positions file with only a title column yields nothing, and says so (skipped), never a guess.
  const thin = mapLinkedIn({ positions: 'Title\nSolo título\n' });
  assert.equal(thin.items.length, 0);
  assert.equal(thin.skipped.length, 1);
  assert.equal(mapLinkedIn({ skills: 'otra,cosa\n1,2\n' }).items.length, 0, 'unknown headers: nothing read');
});

test('languageLevel maps LinkedIn labels (en, es) and CEFR, else nothing', () => {
  assert.equal(languageLevel('Native or bilingual proficiency'), 'native');
  assert.equal(languageLevel('Competencia bilingüe o nativa'), 'native');
  assert.equal(languageLevel('Full professional proficiency'), 'C1');
  assert.equal(languageLevel('Professional working proficiency'), 'B2');
  assert.equal(languageLevel('Limited working proficiency'), 'B1');
  assert.equal(languageLevel('Elementary proficiency'), 'A2');
  assert.equal(languageLevel('B2'), 'B2');
  assert.equal(languageLevel('algo'), undefined);
  assert.equal(languageLevel(''), undefined);
});

test('the ZIP path opens ONLY the mapped files: messages and connections are never read', async () => {
  const bytes = buildZip(dirFiles(join(FIX, 'linkedin'), 'Basic_LinkedInDataExport_10-22-2026/'));
  const zip = new RecordingBlob(bytes);
  const r = await readLinkedInZip(zip);
  assertValid(r);
  assert.equal(r.items.length, mapLinkedIn(liFiles()).items.length);
  assert.equal(r.ignored, 2, 'messages.csv and Connections.csv: listed, not read');
  for (const name of ['messages.csv', 'Connections.csv']) {
    const [start, end] = entrySpan(bytes, `Basic_LinkedInDataExport_10-22-2026/${name}`);
    assert.deepEqual(zip.reads.filter(([s, e]) => s < end && e > start), [], `${name} bytes were read`);
  }
  assert.ok(!JSON.stringify(r).includes('SENTINEL'), 'nothing of the ignored files is kept');
  await assert.rejects(readLinkedInZip(new RecordingBlob(buildZip([{ name: 'messages.csv', data: new TextEncoder().encode('x') }]))), NotLinkedInError);
});

test('selectEntries: base names, any folder, the shallowest wins, macOS forks and folders skipped', async () => {
  const zip = new RecordingBlob(
    buildZip([
      { name: 'a/b/Skills.csv', data: new Uint8Array([1]) },
      { name: 'a/SKILLS.CSV', data: new Uint8Array([2]) },
      { name: '__MACOSX/a/._Skills.csv', data: new Uint8Array([3]) },
      { name: 'Learning.csv', data: new Uint8Array([4]) },
    ]),
  );
  const { picked, ignored } = selectEntries(await listEntries(zip));
  assert.equal(picked.skills?.name, 'a/SKILLS.CSV');
  assert.equal(ignored, 2);
});

test('JSON Resume → items and header; interests, references and meta ignored; bad input refused', () => {
  const r = parseJsonResume(read('resume.json'));
  assertValid(r);
  assert.equal(r.source, 'json-resume');
  assert.equal(r.ignored, 3);
  assert.deepEqual(r.header, {
    displayName: 'Beto Ejemplo',
    headline: 'Desarrollador web',
    summary: 'Construyo sitios accesibles.',
    contact: {
      email: 'beto@example.test',
      phone: '+52 777 000 0000',
      location: 'Cuernavaca, Morelos, MX',
      links: [
        { label: 'beto.example.test', url: 'https://beto.example.test' },
        { label: 'GitHub', url: 'https://code.example.test/beto-ejemplo' },
      ],
    },
  });
  assert.deepEqual(byKind(r, 'experience'), [
    { role: 'Desarrollador', organization: 'Taller Ejemplo', startDate: '2020-02', current: true, summary: 'Sitios para pequeños negocios.', highlights: ['Bajé el tiempo de carga a la mitad', 'Accesibilidad AA'] },
    { role: 'Practicante', organization: 'Agencia Prueba', startDate: '2019-06-01', endDate: '2019-12-15' },
  ]);
  assert.deepEqual(r.skipped, [{ file: 'work', row: 3 }]);
  assert.deepEqual(byKind(r, 'volunteering'), [{ role: 'Tutor', organization: 'Biblioteca Comunitaria Ejemplo', startDate: '2018', endDate: '2019', summary: 'Clases de computación\n• 40 alumnos' }]);
  assert.deepEqual(byKind(r, 'education'), [{ institution: 'Universidad Prueba', degree: 'Licenciatura', field: 'Ingeniería en Computación', startDate: '2015-08', endDate: '2019-06', summary: '9.1', highlights: ['Redes', 'Bases de datos'] }]);
  assert.deepEqual(byKind(r, 'skill'), [{ name: 'TypeScript', level: 'expert' }, { name: 'CSS', level: 'intermediate' }]);
  assert.deepEqual(r.items.find((i) => i.content.name === 'TypeScript')!.tags, ['React', 'Node.js'], 'keywords → tags, unique');
  assert.deepEqual(byKind(r, 'language'), [{ name: 'Español', level: 'native' }, { name: 'Inglés', level: 'B2' }, { name: 'Italiano' }]);
  assert.deepEqual(byKind(r, 'project')[0], { name: 'Formulario universal', role: 'Autor, Mantenedor', url: 'https://code.example.test/beto-ejemplo/formulario', startDate: '2022', summary: 'Componentes de formulario', highlights: ['Usado en 3 sitios'] });
  for (const bad of ['no es json', '[]', '"texto"', '{"foo": 1}', 'null']) assert.throws(() => parseJsonResume(bad), NotJsonResumeError, bad);
  assert.throws(() => parseJsonResume(`{"basics":{"name":"${'x'.repeat(3 * 1024 * 1024)}"}}`), NotJsonResumeError);
  assert.equal(skillLevel('Beginner'), 'beginner');
  assert.equal(skillLevel('Advanced'), 'advanced');
  assert.equal(skillLevel('?'), undefined);
  assert.equal(fluencyLevel('C1 (avanzado)'), 'C1');
});

test('JSON Resume export round trip: profile → JSON Resume → import keeps every mapped item', () => {
  const r = parseJsonResume(read('resume.json'));
  const now = new Date('2026-10-22T12:00:00Z');
  const rows = r.items.map((i, n) => ({ id: `id-${n}`, ownerSub: 'x', profileId: 'p', kind: i.kind, position: n, content: i.content, tags: i.tags, createdAt: now, updatedAt: now }));
  const profile = { id: 'p', ownerSub: 'x', displayName: r.header.displayName!, headline: r.header.headline!, summary: r.header.summary!, locale: 'es-MX', contact: r.header.contact, createdAt: now, updatedAt: now };
  const doc = toJsonResume({ profile, items: rows, jobs: [], artifacts: [] }, now);
  const again = parseJsonResume(JSON.stringify(doc));
  assert.equal(doc.$schema, 'https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json');
  assert.equal(doc.meta.lastModified, now.toISOString());
  assert.deepEqual(again.header.displayName, r.header.displayName);
  // Education's summary has no JSON Resume field (only `score` in the source): everything else comes back identical.
  const strip = (x: ImportResult) => x.items.map((i) => ({ kind: i.kind, content: i.kind === 'education' ? { ...i.content, summary: undefined } : i.content, tags: i.tags }));
  assert.deepEqual(JSON.parse(JSON.stringify(strip(again))), JSON.parse(JSON.stringify(strip(r))));
});
