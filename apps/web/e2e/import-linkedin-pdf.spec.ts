/**
 * The LinkedIn profile PDF import on `/perfil` (switch `CV_IMPORT_LINKEDIN_PDF`, on in the e2e server): a SYNTHETIC
 * two-column profile PDF (test/fixtures/import/linkedin-pdf.ts, built into a real PDF by test/import-pdf-helper.ts) is
 * read by pdf.js IN THE BROWSER under cv-app's CSP, shown in the same preview as the ZIP (nothing sent until
 * «Importar»), and saved in one batch with only what stayed checked. A PDF that is not a LinkedIn profile is refused
 * without a request. Owner B sees nothing.
 */
import { expect, test, type Page, type Request } from '@playwright/test';
import { LINKEDIN_PDF_EN } from '../test/fixtures/import/linkedin-pdf.ts';
import { buildLayoutPdf } from '../test/import-pdf-helper.ts';
import { buildPdf } from '../test/ingest-pdf-helper.ts';
import { apiAs, cspViolations, signIn } from './support/fixtures.ts';
import { suiteOwners, url } from './support/env.ts';

const { OWNER_A, OWNER_B } = suiteOwners('import-pdf');

async function openImport(page: Page) {
  const toggle = page.getByTestId('import-toggle');
  if ((await toggle.getAttribute('open')) === null) await toggle.locator('summary').click();
  await expect(toggle).toHaveAttribute('open', '');
}

function apiRequests(page: Page): Request[] {
  const seen: Request[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/v1/') && r.method() !== 'GET') seen.push(r);
  });
  return seen;
}

test('LinkedIn profile PDF: read in the browser, previewed, only the checked items saved in one call', async ({ page, context }) => {
  const violations = cspViolations(page);
  await signIn(context, OWNER_A);
  await page.goto(url('app', '/perfil'));
  await openImport(page);
  const panel = page.getByTestId('import-panel');
  const source = panel.getByTestId('import-source-linkedin-pdf');
  await expect(source.getByRole('heading', { name: 'Desde el PDF de tu perfil de LinkedIn' })).toBeVisible();
  await expect(source.getByText(/Más \(o Recursos\) → Guardar como PDF/)).toBeVisible();
  await expect(source.getByText(/solo tus aptitudes principales/)).toBeVisible();

  const requests = apiRequests(page);
  // Not a LinkedIn profile: refused in the browser, nothing sent.
  await panel.getByLabel('PDF de tu perfil de LinkedIn').setInputFiles({ name: 'otro.pdf', mimeType: 'application/pdf', buffer: Buffer.from(buildPdf(['Vacante: Recepcionista bilingue', 'Empresa: Hotel Ejemplo Cancun'])) });
  await expect(panel.getByText(/Este PDF no parece el PDF de un perfil de LinkedIn/)).toBeVisible();

  await panel.getByLabel('PDF de tu perfil de LinkedIn').setInputFiles({ name: 'Profile.pdf', mimeType: 'application/pdf', buffer: Buffer.from(buildLayoutPdf(LINKEDIN_PDF_EN)) });
  const preview = page.getByTestId('import-preview');
  await expect(preview.getByRole('heading', { name: 'Revisa antes de guardar' })).toBeFocused();
  expect(requests, 'nothing is sent while reading and previewing').toEqual([]);
  expect(violations, 'pdf.js under cv-app\'s CSP: no violation').toEqual([]);
  await expect(preview.getByText(/Leído del PDF de tu perfil de LinkedIn\./)).toBeVisible();
  await expect(preview.getByText(/solo admite caracteres en inglés/)).toBeVisible();
  await expect(preview.getByText(/Otro archivo o sección no se leyó\./)).toBeVisible();
  await expect(page.getByText('SENTINEL')).toHaveCount(0);

  const experience = preview.getByTestId('import-group-experience');
  await expect(experience.getByTestId('import-item')).toHaveCount(3);
  await expect(experience.getByRole('checkbox', { name: /Data Engineer · Cooperativa Ejemplo/ })).toBeChecked();
  await expect(experience.getByText('Experience, entrada 2')).toBeVisible();
  await expect(preview.getByTestId('import-group-education').getByTestId('import-item')).toHaveCount(2);
  await expect(preview.getByTestId('import-group-skill').getByTestId('import-item')).toHaveCount(3);
  await expect(preview.getByTestId('import-group-language').getByTestId('import-item')).toHaveCount(2);
  const header = preview.getByTestId('import-header');
  await expect(header.getByRole('checkbox', { name: /Titular: Data engineer at Cooperativa Ejemplo/ })).toBeChecked();
  await expect(preview.getByTestId('import-count')).toHaveText('12 de 12 marcados');

  await experience.getByRole('checkbox', { name: /Intern · Fondo Ejemplo/ }).uncheck();
  const batch = page.waitForRequest((r) => r.url().endsWith('/api/v1/profile/items/batch') && r.method() === 'POST');
  await preview.getByRole('button', { name: 'Importar 11 elementos' }).click();
  const body = JSON.parse((await batch).postData() ?? '{}');
  expect(body.items).toHaveLength(11);
  expect(JSON.stringify(body)).not.toContain('Fondo Ejemplo');
  await expect(page.getByRole('status').filter({ hasText: 'Importamos 11 elementos a tu perfil.' }).first()).toBeVisible();
  expect(requests.filter((r) => r.url().includes('/profile/items/batch'))).toHaveLength(1);

  const stored = (await apiAs(OWNER_A, 'GET', '/api/v1/profile')).json!;
  expect(stored.items).toHaveLength(11);
  const engineer = stored.items.find((i: { content: { role?: string } }) => i.content.role === 'Data Engineer');
  expect(engineer.content).toMatchObject({ organization: 'Cooperativa Ejemplo', startDate: '2023-01', current: true, location: 'Cuernavaca, Morelos, Mexico' });
  expect(stored.profile.headline).toBe('Data engineer at Cooperativa Ejemplo | SQL, Python');
  expect((await apiAs(OWNER_B, 'GET', '/api/v1/profile')).json?.items).toEqual([]);
  expect(violations).toEqual([]);
});

test('English page: the PDF source speaks English', async ({ page, context }) => {
  await signIn(context, OWNER_B);
  await page.goto(url('app', '/en/perfil'));
  await openImport(page);
  const source = page.getByTestId('import-source-linkedin-pdf');
  await expect(source.getByRole('heading', { name: 'From your LinkedIn profile PDF' })).toBeVisible();
  await expect(source.getByText(/More \(or Resources\) → Save to PDF/)).toBeVisible();
  await expect(source.getByLabel('Your LinkedIn profile PDF')).toBeVisible();
});
