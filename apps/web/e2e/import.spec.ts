/**
 * W4-I import on `/perfil`, over the built server and a real Postgres: the person's own LinkedIn export ZIP (built here
 * from the synthetic fixtures in test/fixtures/import, plus a messages.csv and a Connections.csv that must never be
 * read) and a JSON Resume file → a grouped preview read IN THE BROWSER (no request until «Importar») → one batch call
 * with only what stayed checked. Duplicates come unchecked («ya existe»). «Descartar» sends nothing. B sees nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type Request } from '@playwright/test';
import { buildZip, dirFiles } from '../test/import-zip-helper.ts';
import { apiAs, cspViolations, signIn } from './support/fixtures.ts';
import { suiteOwners, url } from './support/env.ts';

const { OWNER_A, OWNER_B } = suiteOwners('import');
const FIX = join(import.meta.dirname, '..', 'test', 'fixtures', 'import');
const zipBuffer = () => Buffer.from(buildZip(dirFiles(join(FIX, 'linkedin'), 'Basic_LinkedInDataExport/')));

/** Every request that SENDS something to the data API (the editor's own GET /profile load is not one). */
function apiRequests(page: Page): Request[] {
  const seen: Request[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/v1/') && r.method() !== 'GET') seen.push(r);
  });
  return seen;
}

test('LinkedIn ZIP: read in the browser, previewed, duplicates unchecked, only the checked items saved in one call', async ({ page, context }) => {
  const violations = cspViolations(page);
  expect((await apiAs(OWNER_A, 'POST', '/api/v1/profile/items', { kind: 'skill', content: { name: 'Python' } })).status).toBe(201);
  await signIn(context, OWNER_A);
  await page.goto(url('app', '/perfil'));
  const panel = page.getByTestId('import-panel');
  await expect(panel.getByRole('heading', { name: 'Importar tus datos' })).toBeVisible();
  await expect(panel.getByText('El archivo se lee aquí, en tu navegador. No se sube a ningún servidor.')).toBeVisible();
  await expect(panel.getByText(/abrimos solo estos archivos: Profile, Positions, Education, Skills/)).toBeVisible();
  await expect(panel.getByText(/Nada sale de tu navegador hasta que confirmas/)).toBeVisible();

  const requests = apiRequests(page);
  await panel.getByLabel('ZIP de tus datos de LinkedIn').setInputFiles({ name: 'linkedin.zip', mimeType: 'application/zip', buffer: zipBuffer() });
  const preview = page.getByTestId('import-preview');
  await expect(preview.getByRole('heading', { name: 'Revisa antes de guardar' })).toBeFocused();
  expect(requests, 'nothing is sent while previewing').toEqual([]);
  await expect(preview.getByText(/Otros 2 archivos o secciones no se leyeron\./)).toBeVisible();
  await expect(preview.getByText(/Una fila no tenía los datos mínimos/)).toBeVisible();
  await expect(page.getByText('SENTINEL-NEVER-READ')).toHaveCount(0);

  // Groups per kind; the existing «Python» comes unchecked with «ya existe»; so does the second «python» of the file.
  await expect(preview.getByTestId('import-group-experience').getByTestId('import-item')).toHaveCount(3);
  const skills = preview.getByTestId('import-group-skill');
  await expect(skills.getByRole('checkbox', { name: 'Python', exact: true })).not.toBeChecked();
  await expect(skills.getByRole('checkbox', { name: 'python', exact: true })).not.toBeChecked();
  await expect(skills.getByRole('checkbox', { name: 'SQL', exact: true })).toBeChecked();
  await expect(skills.getByText('ya existe en tu perfil')).toHaveCount(2);
  await expect(preview.getByText(/una fecha no se pudo leer/)).toBeVisible();
  await expect(preview.getByText(/un enlace no válido se omitió/)).toBeVisible();
  // The header: the headline is empty today → checked; the name would replace the Janua one → unchecked until chosen.
  const header = preview.getByTestId('import-header');
  await expect(header.getByRole('checkbox', { name: /Titular: Ingeniera de datos, de tiempo completo/ })).toBeChecked();
  await expect(header.getByRole('checkbox', { name: /Nombre: Ana Ejemplo/ })).not.toBeChecked();
  await expect(header.getByText('reemplaza lo actual')).toHaveCount(1);
  await header.getByRole('checkbox', { name: /Nombre: Ana Ejemplo/ }).check();
  await expect(preview.getByTestId('import-count')).toHaveText('16 de 18 marcados');

  // Uncheck one experience from the keyboard, then confirm.
  await preview.getByRole('checkbox', { name: /Analista · Cooperativa Ejemplo/ }).focus();
  await page.keyboard.press('Space');
  await expect(preview.getByTestId('import-count')).toHaveText('15 de 18 marcados');
  const batch = page.waitForRequest((r) => r.url().endsWith('/api/v1/profile/items/batch') && r.method() === 'POST');
  await preview.getByRole('button', { name: 'Importar 15 elementos' }).click();
  const sent = await batch;
  const body = sent.postData() ?? '';
  expect(body).not.toContain('SENTINEL');
  expect(body).not.toContain('Cooperativa Ejemplo');
  expect(JSON.parse(body).items).toHaveLength(15);
  expect(JSON.parse(body).profile.displayName).toBe('Ana Ejemplo');
  await expect(page.getByRole('status').filter({ hasText: 'Importamos 15 elementos a tu perfil.' }).first()).toBeVisible();
  await expect(page.getByTestId('import-preview')).toHaveCount(0);
  expect(requests.filter((r) => r.url().includes('/profile/items/batch'))).toHaveLength(1);

  // Shown at once in the editor and the header form; still there after a reload.
  await expect(page.getByTestId('section-experience').getByTestId('profile-item').filter({ hasText: 'Acme Datos' })).toHaveCount(1);
  await expect(page.getByLabel('Nombre como quieres que aparezca')).toHaveValue('Ana Ejemplo');
  await page.reload();
  await expect(page.getByTestId('section-language').getByTestId('profile-item')).toHaveCount(4);
  const stored = (await apiAs(OWNER_A, 'GET', '/api/v1/profile')).json!;
  expect(stored.items).toHaveLength(16);
  expect(stored.profile.headline).toBe('Ingeniera de datos, de tiempo completo');
  expect(stored.items.filter((i: { content: { name?: string } }) => i.content.name?.toLowerCase() === 'python')).toHaveLength(1);
  expect(stored.profile.displayName).toBe('Ana Ejemplo');

  // B sees none of it.
  expect((await apiAs(OWNER_B, 'GET', '/api/v1/profile')).json?.items).toEqual([]);
  expect(violations).toEqual([]);
});

test('JSON Resume: «Descartar» sends nothing; English page imports what stays checked; a wrong file is refused', async ({ page, context }) => {
  await signIn(context, OWNER_B);
  await page.goto(url('app', '/perfil'));
  const requests = apiRequests(page);
  const resume = readFileSync(join(FIX, 'resume.json'));
  const panel = page.getByTestId('import-panel');

  await panel.getByLabel('Archivo JSON Resume').setInputFiles({ name: 'cv.json', mimeType: 'application/json', buffer: resume });
  await expect(page.getByTestId('import-preview').getByRole('checkbox', { name: /Desarrollador · Taller Ejemplo/ })).toBeChecked();
  await page.getByRole('button', { name: 'Descartar' }).click();
  await expect(panel.getByText('Descartado. No se envió nada.')).toBeVisible();
  expect(requests).toEqual([]);

  await panel.getByLabel('ZIP de tus datos de LinkedIn').setInputFiles({ name: 'cv.zip', mimeType: 'application/zip', buffer: Buffer.from('esto no es un zip, solo texto suficiente') });
  await expect(panel.getByText('Ese archivo no es un ZIP válido.')).toBeVisible();
  await panel.getByLabel('Archivo JSON Resume').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hola": 1}') });
  await expect(panel.getByText(/Este archivo no es un JSON Resume/)).toBeVisible();
  expect(requests).toEqual([]);

  await page.goto(url('app', '/en/perfil'));
  const en = page.getByTestId('import-panel');
  await expect(en.getByText('The file is read here, in your browser. It is not uploaded to any server.')).toBeVisible();
  await en.getByLabel('JSON Resume file').setInputFiles({ name: 'cv.json', mimeType: 'application/json', buffer: resume });
  const preview = page.getByTestId('import-preview');
  await expect(preview.getByRole('heading', { name: 'Review before saving' })).toBeFocused();
  await preview.getByRole('button', { name: 'Uncheck all' }).click();
  await preview.getByRole('checkbox', { name: /Practicante · Agencia Prueba/ }).check();
  await preview.getByRole('checkbox', { name: /TypeScript/ }).check();
  await expect(preview.getByText(/Keywords: React, Node\.js/)).toBeVisible();
  await preview.getByRole('button', { name: 'Import 2 items' }).click();
  await expect(en.getByText('We imported 2 items into your profile.')).toBeVisible();
  const stored = (await apiAs(OWNER_B, 'GET', '/api/v1/profile')).json!;
  expect(stored.items.map((i: { kind: string }) => i.kind).sort()).toEqual(['experience', 'skill']);
  expect(stored.items.find((i: { kind: string }) => i.kind === 'skill').tags).toEqual(['React', 'Node.js']);
  expect(stored.profile.displayName).toBe('Beto Ejemplo');
});
