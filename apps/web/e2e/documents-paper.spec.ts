/**
 * W5-P end to end: Pliego's paper on screen, never on paper. The preview and the print view show the document on the
 * chosen stock (face colour and edge from Pliego's cards), the print view words the stock's facts and, for a cover
 * letter, the letter fold Pliego computes; printing gives the SAME white pages, sizes and text layer as before, with
 * none of the advice in it. Keyboard, dark mode, reduced motion, no script and the CSP are covered.
 */
import { expect, test, type Page } from '@playwright/test';
import { readPdf } from './documents-pdf.ts';
import { apiAs, cspViolations, signIn, type Json } from './support/fixtures.ts';
import { suiteOwners, url } from './support/env.ts';

const { OWNER_A } = suiteOwners('paper');
const NAME = 'Pau Papel';
const RUN = Date.now().toString(36);
const ids: Record<string, string> = {};
const BOND = 'rgb(247, 247, 242)';
const CARD = 'rgb(244, 239, 230)';
const WHITE = 'rgb(255, 255, 255)';

test.beforeAll(async () => {
  expect((await apiAs(OWNER_A, 'PUT', '/api/v1/profile', { displayName: NAME, headline: 'Analista', summary: 'Ocho años en finanzas.' })).status).toBe(200);
  const item = await apiAs(OWNER_A, 'POST', '/api/v1/profile/items', { kind: 'experience', content: { role: 'Analista de finanzas', organization: 'Ejemplo SA', startDate: '2018-01' }, tags: [] });
  expect(item.status).toBe(201);
  const items = [{ itemId: item.json!.item.id as string }];
  const set = await apiAs(OWNER_A, 'POST', '/api/v1/artifacts/batch', {
    artifacts: [
      { kind: 'cv', title: `CV papel ${RUN}`, content: { items } },
      { kind: 'cover_letter', title: `Carta papel ${RUN}`, content: { items, greeting: 'Hola:', summary: 'Me interesa el puesto.', closing: 'Saludos,' } },
      { kind: 'presentation', title: `Presentación papel ${RUN}`, content: { items: [], slides: [{ title: 'Quién soy', body: 'Pau' }] } },
    ],
  });
  expect(set.status).toBe(201);
  for (const a of set.json!.artifacts as Json[]) ids[a.kind as string] = a.id as string;
});

const sheet = (page: Page) => page.locator('[data-paper-stock]');

async function pdfOf(page: Page) {
  await page.emulateMedia({ media: 'print' });
  const pdf = readPdf(await page.pdf({ preferCSSPageSize: true }));
  await page.emulateMedia({ media: 'screen' });
  return pdf;
}

test('print view: the stock colours the sheet on screen only; the PDF is the same white pages with the same text', async ({ page }) => {
  const violations = cspViolations(page);
  await signIn(page.context(), OWNER_A);
  await page.goto(url('app', `/documentos/${ids.cv}/imprimir`));
  await expect(sheet(page)).toHaveAttribute('data-paper-stock', 'copy-80');
  await expect(sheet(page)).toHaveCSS('background-color', BOND);
  await expect(page.getByTestId('paper-facts')).toContainText('Papel bond 80 g/m²: unos 0.10 mm de grosor');
  const bondPdf = await pdfOf(page);

  // Keyboard: the stock radios are one group; the arrow key moves the choice.
  await page.getByLabel('Papel bond 80 g/m²').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByLabel('Cartulina 160 g/m²')).toBeChecked();
  await expect(sheet(page)).toHaveAttribute('data-paper-stock', 'cardstock-160');
  await expect(sheet(page)).toHaveCSS('background-color', CARD);
  await expect(page.getByTestId('paper-facts')).toContainText('unas 6.5 veces más rígida a la flexión');
  await expect(page.getByTestId('paper-facts')).toContainText('Márcala antes de doblarla');

  await page.emulateMedia({ media: 'print' });
  await expect(sheet(page)).toHaveCSS('background-color', WHITE);
  await expect(sheet(page)).toHaveCSS('box-shadow', 'none');
  await expect(page.getByTestId('paper-facts')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  const cardPdf = await pdfOf(page);
  for (const pdf of [bondPdf, cardPdf]) {
    expect(pdf.images).toBe(0);
    for (const s of pdf.sizes) expect(s.map(Math.round)).toEqual([612, 792]);
    const text = pdf.text.replace(/\s/g, '');
    expect(text).toContain(NAME.replace(/\s/g, ''));
    expect(text).toContain('finanzas');
    for (const advice of ['Pliego', 'Cartulina', 'grosor']) expect(text).not.toContain(advice);
  }
  expect(cardPdf.text).toBe(bondPdf.text);
  expect(cardPdf.pages).toBe(bondPdf.pages);

  await page.getByLabel('A4').check();
  const a4 = await pdfOf(page);
  for (const s of a4.sizes) expect(s.map(Math.round)).toEqual([595, 842]);
  expect(violations).toEqual([]);
});

test('cover letter: the letter fold Pliego computes, per size and stock, never printed', async ({ page }) => {
  const violations = cspViolations(page);
  await signIn(page.context(), OWNER_A);
  await page.goto(url('app', `/documentos/${ids.cover_letter}/imprimir`));
  const guide = page.getByRole('region', { name: 'Para doblarla en tres (tipo carta)' });
  await expect(guide).toBeVisible();
  await expect(guide).toHaveAttribute('data-fold-guide', 'letter/copy-80');
  await expect(guide.getByRole('listitem')).toHaveText([
    'Dobla hacia arriba la parte de abajo, a 92.1 mm del borde inferior.',
    'Dobla hacia abajo la parte de arriba, a 93.7 mm del borde superior, sobre la anterior.',
  ]);
  await expect(guide).toContainText('doblada mide 93.7 × 215.9 mm');
  await expect(guide).not.toContainText('marca las dos líneas');

  await page.getByLabel('A4').check();
  await page.getByLabel('Cartulina 160 g/m²').check();
  await expect(guide).toHaveAttribute('data-fold-guide', 'a4/cardstock-160');
  await expect(guide.getByRole('listitem').first()).toHaveText('Dobla hacia arriba la parte de abajo, a 97.9 mm del borde inferior.');
  await expect(guide).toContainText('En cartulina, marca las dos líneas antes de doblar.');

  await page.emulateMedia({ media: 'print' });
  await expect(guide).toBeHidden();
  const pdf = readPdf(await page.pdf({ preferCSSPageSize: true }));
  for (const s of pdf.sizes) expect(s.map(Math.round)).toEqual([595, 842]);
  expect(pdf.images).toBe(0);
  expect(pdf.text.replace(/\s/g, '')).toContain(NAME.replace(/\s/g, ''));
  expect(pdf.text).not.toContain('Dobla');
  expect(violations).toEqual([]);
});

test('preview: bond in light and dark; reduced motion turns the transition off; slides keep their plain frame', async ({ page }) => {
  const violations = cspViolations(page);
  await signIn(page.context(), OWNER_A);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.goto(url('app', `/documentos/${ids.cv}/vista-previa`));
    await expect(sheet(page)).toHaveCSS('background-color', BOND);
    await expect(sheet(page)).toHaveCSS('transition-duration', '0s');
    await expect(page.locator('article[data-kind="cv"] h1')).toHaveText(NAME);
    await expect(page.getByText('Vista en papel bond 80 g/m².')).toBeVisible();
  }
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  await page.reload();
  await expect(sheet(page)).toHaveCSS('transition-duration', '0.16s, 0.16s');
  await page.goto(url('app', `/documentos/${ids.presentation}/vista-previa`));
  await expect(page.locator('article[data-kind="presentation"]')).toBeVisible();
  await expect(sheet(page)).toHaveCount(0);
  expect(violations).toEqual([]);
});

test('without script the preview is the plain white sheet with the whole document', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await signIn(context, OWNER_A);
  const page = await context.newPage();
  await page.goto(url('app', `/documentos/${ids.cv}/vista-previa`));
  await expect(page.locator('article[data-kind="cv"] h1')).toHaveText(NAME);
  await expect(sheet(page)).toHaveCSS('background-color', WHITE);
  await context.close();
});
