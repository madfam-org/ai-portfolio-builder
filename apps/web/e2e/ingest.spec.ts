/**
 * W5-J job intake over the built server and a real Postgres: paste → preview with provenance → save (nothing sent
 * before «Guardar vacante»); honest refusals for capture-only boards and private addresses (no connection is made in
 * the test: those are refused before any network); the «Capturar vacante» bookmark run on a synthetic job page opens
 * cv-app's capture tab and saves a job read from its JSON-LD; files read in the browser (DOCX, a text-layer PDF, a
 * scanned PDF, an image); English. Owner B sees none of it. No CSP violation anywhere.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type Request } from '@playwright/test';
import { buildZip } from '../test/import-zip-helper.ts';
import { buildPdf } from '../test/ingest-pdf-helper.ts';
import { apiAs, cspViolations, signIn } from './support/fixtures.ts';
import { suiteOwners, url } from './support/env.ts';

const { OWNER_A, OWNER_B } = suiteOwners('ingest');
const FIX = join(import.meta.dirname, '..', 'test', 'fixtures', 'ingest');
const SHOTS = process.env.CV_E2E_SHOTS;
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

/** Requests that would store something (POST /api/v1/jobs itself, not the intake preview). */
function jobCreates(page: Page): Request[] {
  const seen: Request[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/api\/v1\/jobs$/.test(new URL(r.url()).pathname)) seen.push(r);
  });
  return seen;
}

test('paste → a preview with where each field came from → edit → save; B cannot see it', async ({ page, context }) => {
  const violations = cspViolations(page);
  const creates = jobCreates(page);
  await signIn(context, OWNER_A);
  await page.goto(url('app', '/empleos'));
  await page.getByRole('link', { name: 'Agregar desde un enlace, un archivo o tu navegador' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Agregar una vacante' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Desde un enlace' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Capturar desde tu navegador' })).toBeVisible();
  await shot(page, 'es-1-intake');

  await page.getByLabel('Texto de la vacante').fill(readFileSync(join(FIX, 'paste-es.txt'), 'utf8'));
  await page.getByRole('button', { name: 'Revisar' }).click();
  const preview = page.getByTestId('intake-preview');
  await expect(preview.getByRole('heading', { name: 'Revisa antes de guardar' })).toBeFocused();
  await expect(preview.getByLabel('Puesto')).toHaveValue('Coordinadora de Recursos Humanos');
  await expect(preview.getByTestId('from-title')).toHaveText('primera línea del texto (sugerencia: revísala)');
  await expect(preview.getByLabel('Empresa')).toHaveValue('Manufacturas Ejemplo de Querétaro');
  await expect(preview.getByTestId('from-company')).toHaveText('de una línea con etiqueta en el texto');
  await expect(preview.getByLabel('Estado')).toHaveValue('MX-QUE');
  await expect(preview.getByLabel('Modalidad')).toHaveValue('hybrid');
  await expect(preview.getByLabel('Mínimo')).toHaveValue('28000');
  await expect(preview.getByLabel('Moneda')).toHaveValue('');
  await expect(preview.getByText('El sueldo no dice moneda o periodo')).toBeVisible();
  expect(creates, 'nothing stored while previewing').toEqual([]);
  await shot(page, 'es-2-preview');

  await preview.getByLabel('Moneda').fill('MXN');
  await expect(preview.getByText('editado por ti')).toHaveCount(1);
  await preview.getByRole('button', { name: 'Guardar vacante' }).click();
  await page.waitForURL(/\/empleos\/[0-9a-f-]{36}$/);
  expect(creates).toHaveLength(1);
  const jobId = page.url().split('/').pop()!;
  const facts = page.getByTestId('job-facts');
  await expect(facts).toContainText('Querétaro');
  await expect(facts).toContainText('Híbrido');
  await expect(facts).toContainText('28,000 – 32,000 MXN al mes');
  await shot(page, 'es-3-saved');

  const mine = await apiAs(OWNER_A, 'GET', `/api/v1/jobs/${jobId}`);
  expect([mine.json!.job.sourceKind, mine.json!.job.stateCode, mine.json!.job.salaryCurrency]).toEqual(['paste', 'MX-QUE', 'MXN']);
  expect((await apiAs(OWNER_B, 'GET', `/api/v1/jobs/${jobId}`)).status).toBe(404);
  expect(violations).toEqual([]);
});

test('links: a capture-only board and a private address are refused honestly, before any connection', async ({ page, context }) => {
  const violations = cspViolations(page);
  await signIn(context, OWNER_A);
  await page.goto(url('app', '/empleos/nuevo'));
  const link = page.getByTestId('intake-link');
  await link.getByLabel('Enlace de la vacante').fill('https://www.linkedin.com/jobs/view/1234567890');
  await link.getByRole('button', { name: 'Leer vacante' }).click();
  await expect(link.getByRole('alert')).toContainText('LinkedIn no permite que un servidor lea sus vacantes');
  await link.getByRole('link', { name: 'Capturar desde tu navegador' }).click();
  await expect(page).toHaveURL(/#intake-capture$/);
  await shot(page, 'es-4-capture-only');

  await link.getByLabel('Enlace de la vacante').fill('https://169.254.169.254/latest/meta-data/');
  await link.getByRole('button', { name: 'Leer vacante' }).click();
  await expect(link.getByRole('alert')).toContainText('Ese enlace apunta a una dirección privada; no la leemos.');
  await link.getByLabel('Enlace de la vacante').fill('http://empleos.example.test/v/1');
  await link.getByRole('button', { name: 'Leer vacante' }).click();
  await expect(link.getByRole('alert')).toContainText('Solo leemos enlaces que empiezan con https://');
  expect(violations).toEqual([]);
});

test('the «Capturar vacante» bookmark on a job page opens cv-app with the posting read from its JSON-LD', async ({ page, context }) => {
  const violations = cspViolations(page);
  await signIn(context, OWNER_A);
  await page.goto(url('app', '/empleos/nuevo'));
  const bookmark = page.getByTestId('bookmarklet');
  await expect(bookmark).toHaveAttribute('href', /^javascript:/);
  const href = (await bookmark.getAttribute('href'))!;
  await bookmark.click();
  await expect(page).toHaveURL(url('app', '/empleos/nuevo'), { timeout: 2000 });

  // A synthetic job page on another origin (served by the test, never fetched by cv).
  const board = await context.newPage();
  await board.route('https://empleos.example.test/**', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: readFileSync(join(FIX, 'jsonld-board.html'), 'utf8') }));
  await board.goto('https://empleos.example.test/vacante/12345-desarrolladora-backend-sr');
  const opened = context.waitForEvent('page');
  await board.addScriptTag({ content: decodeURIComponent(href.slice('javascript:'.length)) });
  const tab = await opened;
  const tabViolations = cspViolations(tab);
  await tab.waitForLoadState();
  expect(tab.url()).toContain('/empleos/capturar');
  const preview = tab.getByTestId('intake-preview');
  await expect(preview.getByLabel('Puesto')).toHaveValue('Desarrolladora Backend Sr.');
  await expect(preview.getByTestId('from-title')).toHaveText('de los datos estructurados (JSON-LD)');
  await expect(preview.getByLabel('Estado')).toHaveValue('MX-JAL');
  await expect(preview.getByLabel('Máximo')).toHaveValue('60000');
  await expect(tab.getByText('Capturada en empleos.example.test')).toBeVisible();
  expect(new URL(tab.url()).hash, 'the capture left the address bar').toBe('');
  await shot(tab, 'es-5-captured');
  await preview.getByRole('button', { name: 'Guardar vacante' }).click();
  await tab.waitForURL(/\/empleos\/[0-9a-f-]{36}$/);
  const jobId = tab.url().split('/').pop()!;
  const saved = await apiAs(OWNER_A, 'GET', `/api/v1/jobs/${jobId}`);
  expect([saved.json!.job.sourceKind, saved.json!.job.salaryPeriod, saved.json!.job.sourceUrl]).toEqual(['capture', 'month', 'https://empleos.example.test/vacante/12345-desarrolladora-backend-sr']);
  expect((await apiAs(OWNER_B, 'GET', `/api/v1/jobs/${jobId}`)).status).toBe(404);
  expect([...violations, ...tabViolations]).toEqual([]);

  await tab.goto(url('app', '/empleos/capturar'));
  await expect(tab.getByText('No llegó ninguna captura.')).toBeVisible();
});

test('files are read in the browser: DOCX and a text PDF preview; a scanned PDF and an image say «aún no leemos imágenes»', async ({ page, context }) => {
  const violations = cspViolations(page);
  const intakeCalls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/v1/jobs/intake')) intakeCalls.push(r.postData() ?? '');
  });
  await signIn(context, OWNER_A);
  await page.goto(url('app', '/empleos/nuevo'));
  const input = () => page.getByLabel('Archivo de la vacante');
  const docx = buildZip(['[Content_Types].xml', 'word/document.xml'].map((name) => ({ name, data: new Uint8Array(readFileSync(join(FIX, 'docx', name))) })));
  await input().setInputFiles({ name: 'vacante.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from(docx) });
  const preview = page.getByTestId('intake-preview');
  await expect(preview.getByLabel('Empresa')).toHaveValue('Contadores Ejemplo & Asociados');
  await expect(preview.getByLabel('Estado')).toHaveValue('MX-YUC');
  await expect(preview.getByLabel('Texto de la vacante')).toHaveValue(/• Conciliaciones bancarias\./);
  expect(JSON.parse(intakeCalls[0]!)).toMatchObject({ source: 'text', kind: 'docx' });
  await preview.getByRole('button', { name: 'Descartar' }).click();

  const pdf = buildPdf(['Vacante: Recepcionista bilingue', 'Empresa: Hotel Ejemplo Cancun', 'Ubicacion: Cancun, Quintana Roo', 'Sueldo: $13,500 mensuales', 'Atencion a huespedes en espanol e ingles, turnos rotativos.']);
  await input().setInputFiles({ name: 'vacante.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
  await expect(preview.getByLabel('Puesto')).toHaveValue('Recepcionista bilingue');
  await expect(preview.getByLabel('Estado')).toHaveValue('MX-ROO');
  expect(JSON.parse(intakeCalls[1]!)).toMatchObject({ source: 'text', kind: 'pdf' });
  expect(violations, 'pdf.js under cv-app\'s CSP: no violation on PDF pick').toEqual([]);
  await shot(page, 'es-6-pdf');
  await preview.getByRole('button', { name: 'Descartar' }).click();

  const file = page.getByTestId('intake-file');
  await input().setInputFiles({ name: 'escaneo.pdf', mimeType: 'application/pdf', buffer: Buffer.from(buildPdf([])) });
  await expect(file.getByRole('alert')).toContainText('Este PDF no tiene texto seleccionable');
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  await input().setInputFiles({ name: 'captura.png', mimeType: 'image/png', buffer: png });
  await expect(file.getByRole('alert')).toContainText('Aún no leemos imágenes');
  await shot(page, 'es-7-image');
  expect(intakeCalls, 'a scanned PDF and an image are never sent').toHaveLength(2);
  expect(violations).toEqual([]);
});

test('English: the intake page and a paste preview', async ({ page, context }) => {
  const violations = cspViolations(page);
  await signIn(context, OWNER_A);
  await page.goto(url('app', '/en/empleos/nuevo'));
  await expect(page.getByRole('heading', { level: 1, name: 'Add a job posting' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Capture from your browser' })).toBeVisible();
  await shot(page, 'en-1-intake');
  await page.getByLabel('Posting text').fill(readFileSync(join(FIX, 'paste-en.txt'), 'utf8'));
  await page.getByRole('button', { name: 'Review' }).click();
  const preview = page.getByTestId('intake-preview');
  await expect(preview.getByRole('heading', { name: 'Review before saving' })).toBeFocused();
  await expect(preview.getByLabel('Job title')).toHaveValue('Senior Product Designer');
  await expect(preview.getByTestId('from-company')).toHaveText('from a labeled line in the text');
  await expect(preview.getByLabel('Work mode')).toHaveValue('remote');
  await expect(preview.getByLabel('Currency')).toHaveValue('USD');
  await shot(page, 'en-2-preview');
  await preview.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByRole('heading', { name: 'From a link' })).toBeVisible();
  expect(violations).toEqual([]);
});
