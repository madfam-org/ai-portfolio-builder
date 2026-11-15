/**
 * Reading images of a posting (tlacuilo) over the built server and a real Postgres.
 *
 * The e2e server runs WITHOUT tlacuilo settings, as production does until the service is switched on, so the first
 * test proves the dormant path on the real route (and that a binary body crosses cv-app's same-origin proxy intact).
 * The browser journey then runs with the OCR route answered by the test (`page.route`): what is real there is
 * everything in the browser (the offer, the explicit go-ahead, pages drawn to a canvas under cv-app's CSP, JPEG pages
 * within the size limit, one request per page) and the ordinary intake on the real server (`read: "ocr"` → the
 * preview with its note). The server-side client is covered against a fake tlacuilo in test/tlacuilo-*.test.ts.
 * Synthetic content only (an invented employer on `.example`).
 */
import { crc32, deflateSync } from 'node:zlib';
import { expect, test, type Page, type Route } from '@playwright/test';
import { buildPdf } from '../test/ingest-pdf-helper.ts';
import { cspViolations, signIn } from './support/fixtures.ts';
import { suiteOwners, url } from './support/env.ts';

const { OWNER_A } = suiteOwners('ocr');
const MAX_BYTES = 480 * 1024;
const LINES = ['Vacante: Asesora de ventas bilingue', 'Empresa: Boutique Ejemplo', 'Ubicacion: Ciudad de Mexico', 'Sueldo: $14,000 mensuales', 'Atencion a clientes en espanol e ingles, seguimiento de cartera y metas de venta mensuales.'];

/** A valid white RGB PNG of the given size (synthetic; what matters is that the browser can decode and redraw it). */
function png(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body) >>> 0, body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0xff)]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', pixels), chunk('IEND', Buffer.alloc(0))]);
}

interface PageUpload {
  type: string;
  bytes: number;
  jpeg: boolean;
}

/** Answer the OCR route as a switched-on service would: on, then each page's lines. Records what the browser sent. */
async function serviceOn(page: Page, answer: (n: number) => { status: number; body: unknown } = () => ({ status: 200, body: { page: { lines: LINES, confidence: 0.93, verdict: 'good', source: 'ocr', truncated: false } } })): Promise<PageUpload[]> {
  const uploads: PageUpload[] = [];
  await page.route('**/api/v1/jobs/intake/ocr', async (route: Route) => {
    const req = route.request();
    if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, maxPages: 4, maxBytes: MAX_BYTES, mediaTypes: ['image/jpeg', 'image/png'] }) });
    const body = req.postDataBuffer() ?? Buffer.alloc(0);
    uploads.push({ type: req.headers()['content-type'] ?? '', bytes: body.byteLength, jpeg: body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff });
    const a = answer(uploads.length);
    return route.fulfill({ status: a.status, contentType: 'application/json', body: JSON.stringify(a.body) });
  });
  return uploads;
}

test('dormant (as production until it is switched on): the real route says off, reads nothing, and the page says so', async ({ page, context }) => {
  await signIn(context, OWNER_A);
  await page.goto(url('app', '/empleos/nuevo'));
  const probe = await page.evaluate(async () => {
    const get = await fetch('/api/v1/jobs/intake/ocr', { cache: 'no-store' });
    const post = await fetch('/api/v1/jobs/intake/ocr', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]) });
    return { get: get.status, status: (await get.json()) as { enabled: boolean }, post: post.status, error: ((await post.json()) as { error: string }).error };
  });
  expect(probe.get).toBe(200);
  expect(probe.status.enabled).toBe(false);
  expect(probe.post).toBe(503);
  expect(probe.error).toBe('not_configured');
  const file = page.getByTestId('intake-file');
  await page.getByLabel('Archivo de la vacante').setInputFiles({ name: 'captura.png', mimeType: 'image/png', buffer: png(300, 200) });
  await expect(file.getByRole('alert')).toContainText('Aún no leemos imágenes');
  await expect(page.getByTestId('intake-ocr-offer')).toHaveCount(0);
});

test('an image: the offer says what is sent, nothing leaves before the go-ahead, then one JPEG page → the preview with its note', async ({ page, context }) => {
  const violations = cspViolations(page);
  const intakeCalls: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/v1/jobs/intake') intakeCalls.push(r.postData() ?? '');
  });
  await signIn(context, OWNER_A);
  const uploads = await serviceOn(page);
  await page.goto(url('app', '/empleos/nuevo'));
  const input = () => page.getByLabel('Archivo de la vacante');
  const offer = page.getByTestId('intake-ocr-offer');

  // 3000 × 2000: larger than the canvas cap, so the page is really redrawn smaller.
  await input().setInputFiles({ name: 'vacante-foto.png', mimeType: 'image/png', buffer: png(3000, 2000) });
  await expect(offer).toContainText('Este archivo es una imagen');
  await expect(offer).toContainText('no se guarda la imagen ni el texto');
  expect(uploads, 'nothing is sent before the person agrees').toHaveLength(0);
  await offer.getByRole('button', { name: 'Cancelar' }).click();
  await expect(offer).toHaveCount(0);
  expect(uploads).toHaveLength(0);

  await input().setInputFiles({ name: 'vacante-foto.png', mimeType: 'image/png', buffer: png(3000, 2000) });
  await offer.getByRole('button', { name: 'Leer el texto de la imagen' }).click();
  const preview = page.getByTestId('intake-preview');
  await expect(preview.getByLabel('Empresa')).toHaveValue('Boutique Ejemplo');
  await expect(preview.getByLabel('Puesto')).toHaveValue('Asesora de ventas bilingue');
  await expect(preview.getByLabel('Estado')).toHaveValue('MX-CMX');
  await expect(page.getByTestId('intake-notes')).toContainText('se leyó de una imagen con reconocimiento de texto');
  expect(uploads).toHaveLength(1);
  expect(uploads[0]!.type).toBe('image/jpeg');
  expect(uploads[0]!.jpeg, 'the page is a real JPEG').toBe(true);
  expect(uploads[0]!.bytes).toBeGreaterThan(500);
  expect(uploads[0]!.bytes).toBeLessThanOrEqual(MAX_BYTES);
  expect(intakeCalls).toHaveLength(1);
  expect(JSON.parse(intakeCalls[0]!)).toMatchObject({ source: 'text', kind: 'file', read: 'ocr' });
  expect(violations, 'canvas work under cv-app\'s CSP').toEqual([]);
});

test('a scanned PDF: its page is drawn in the browser and read; a page with no legible text says so honestly', async ({ page, context }) => {
  const violations = cspViolations(page);
  const intakeCalls: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/v1/jobs/intake') intakeCalls.push(r.postData() ?? '');
  });
  await signIn(context, OWNER_A);
  let unreadable = false;
  const uploads = await serviceOn(page, () => (unreadable ? { status: 422, body: { error: 'ocr_unreadable' } } : { status: 200, body: { page: { lines: LINES, confidence: 0.71, verdict: 'fair', source: 'ocr', truncated: false } } }));
  await page.goto(url('app', '/empleos/nuevo'));
  const input = () => page.getByLabel('Archivo de la vacante');
  const offer = page.getByTestId('intake-ocr-offer');
  const scanned = Buffer.from(buildPdf([]));

  await input().setInputFiles({ name: 'escaneo.pdf', mimeType: 'application/pdf', buffer: scanned });
  await expect(offer).toContainText('Este PDF no tiene texto seleccionable');
  await offer.getByRole('button', { name: 'Leer el texto de la imagen' }).click();
  const preview = page.getByTestId('intake-preview');
  await expect(preview.getByLabel('Empresa')).toHaveValue('Boutique Ejemplo');
  expect(uploads).toHaveLength(1);
  expect(uploads[0]!.jpeg).toBe(true);
  expect(uploads[0]!.bytes).toBeLessThanOrEqual(MAX_BYTES);
  expect(JSON.parse(intakeCalls[0]!)).toMatchObject({ source: 'text', kind: 'pdf', read: 'ocr' });
  await preview.getByRole('button', { name: 'Descartar' }).click();

  unreadable = true;
  await input().setInputFiles({ name: 'escaneo.pdf', mimeType: 'application/pdf', buffer: scanned });
  await offer.getByRole('button', { name: 'Leer el texto de la imagen' }).click();
  await expect(page.getByTestId('intake-file').getByRole('alert')).toContainText('No encontramos texto legible');
  expect(intakeCalls, 'an unread page never becomes a draft').toHaveLength(1);
  expect(violations, 'pdf.js drawing a page under cv-app\'s CSP').toEqual([]);
});

test('English, and the service being busy', async ({ page, context }) => {
  await signIn(context, OWNER_A);
  await serviceOn(page, () => ({ status: 503, body: { error: 'ocr_busy', retryAfter: 10 } }));
  await page.goto(url('app', '/en/empleos/nuevo'));
  await page.getByLabel('Posting file').setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: png(600, 400) });
  const offer = page.getByTestId('intake-ocr-offer');
  await expect(offer).toContainText('This file is an image');
  await expect(offer).toContainText('neither the image nor the text is stored');
  await offer.getByRole('button', { name: 'Read the text in the image' }).click();
  await expect(page.getByTestId('intake-file').getByRole('alert')).toContainText('The reading service is busy');
});
