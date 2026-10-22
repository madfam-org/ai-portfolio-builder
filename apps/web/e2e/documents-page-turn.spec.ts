/**
 * W5-P phase 3 end to end: the deck's page turn, baked with Pliego's published engine. Keyboard first, the position
 * announced at once, the turning leaf an inert, hidden copy that is gone after the turn (only real text at rest),
 * reduced motion = an instant change with no layer, the strict pages-host CSP intact, and printing identical with
 * and without the viewer (same text, page count and sizes).
 */
import { expect, test, type Page } from '@playwright/test';
import { readPdf } from './documents-pdf.ts';
import { apiAs, cspViolations, signIn } from './support/fixtures.ts';
import { suiteOwners, url } from './support/env.ts';

const { OWNER_A } = suiteOwners('pageturn');
const RUN = Date.now().toString(36);
const SLUG = `deck-${RUN}`;
let id = '';

test.beforeAll(async () => {
  expect((await apiAs(OWNER_A, 'PUT', '/api/v1/profile', { displayName: 'Paco Página', headline: 'Analista' })).status).toBe(200);
  const set = await apiAs(OWNER_A, 'POST', '/api/v1/artifacts/batch', {
    artifacts: [
      {
        kind: 'presentation',
        title: `Deck ${RUN}`,
        content: { items: [], slides: [{ title: 'Quién soy', body: 'Paco' }, { title: 'Qué hago', body: 'Reportes' }, { title: 'Contacto', body: 'Hola' }] },
      },
    ],
  });
  expect(set.status).toBe(201);
  id = (set.json!.artifacts as { id: string }[])[0]!.id;
  expect((await apiAs(OWNER_A, 'POST', `/api/v1/artifacts/${id}/publish`, { visibility: 'public', slug: SLUG })).status).toBe(200);
});

const layer = (page: Page) => page.locator('[data-page-turn]');
const position = (page: Page) => page.getByTestId('slide-position');

async function ready(page: Page, path: string) {
  await page.goto(path);
  await expect(position(page)).toHaveText('Diapositiva 1 de 4');
  // The turn module loads after the deck enhances (a separate same-origin chunk).
  await page.waitForLoadState('networkidle');
}

test('arrows turn the page: announced at once, an inert hidden leaf for the transition, real text at rest', async ({ page }) => {
  const violations = cspViolations(page);
  await signIn(page.context(), OWNER_A);
  await ready(page, url('app', `/documentos/${id}/vista-previa`));
  await page.keyboard.press('ArrowRight');
  await expect(position(page)).toHaveText('Diapositiva 2 de 4');
  await expect(layer(page)).toHaveAttribute('data-page-turn', 'forward');
  await expect(layer(page)).toHaveAttribute('aria-hidden', 'true');
  expect(await layer(page).evaluate((el) => (el as HTMLElement).inert)).toBe(true);
  expect(await layer(page).locator('[id]').count()).toBe(0);
  expect(await layer(page).evaluate((el) => el.children.length)).toBe(24);
  await expect(layer(page)).toHaveCount(0);
  await expect(page.locator('[data-slide-index="1"] h2')).toHaveText('Quién soy');
  await expect(page.locator('[data-slide-index="1"]')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(position(page)).toHaveText('Diapositiva 1 de 4');
  await expect(layer(page)).toHaveAttribute('data-page-turn', 'backward');
  await expect(layer(page)).toHaveCount(0);
  await page.keyboard.press('End');
  await expect(position(page)).toHaveText('Diapositiva 4 de 4');
  await page.getByRole('button', { name: 'Anterior' }).click();
  await expect(position(page)).toHaveText('Diapositiva 3 de 4');
  await expect(layer(page)).toHaveCount(0);
  expect(violations).toEqual([]);
});

test('reduced motion: an instant change and no turning layer at all', async ({ page }) => {
  await signIn(page.context(), OWNER_A);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page, url('app', `/documentos/${id}/vista-previa`));
  await page.keyboard.press('PageDown');
  await expect(position(page)).toHaveText('Diapositiva 2 de 4');
  await expect(page.locator('[data-slide-index="1"]')).toBeVisible();
  expect(await layer(page).count()).toBe(0);
  await page.waitForTimeout(300);
  expect(await layer(page).count()).toBe(0);
});

test('printing: the same PDF with and without the viewer, and the layer never prints', async ({ browser }) => {
  const pdfOf = async (reducedMotion: 'reduce' | 'no-preference', turn: boolean) => {
    const context = await browser.newContext({ reducedMotion });
    await signIn(context, OWNER_A);
    const page = await context.newPage();
    // The print view (the print surface: one 13.333 × 7.5 in slide per page) also runs the deck on screen.
    await ready(page, url('app', `/documentos/${id}/imprimir`));
    if (turn) {
      await page.keyboard.press('ArrowRight');
      await expect(layer(page)).toHaveCount(1);
      await page.emulateMedia({ media: 'print' });
      await expect(layer(page)).toBeHidden();
      await page.emulateMedia({ media: 'screen' });
      await expect(layer(page)).toHaveCount(0);
    }
    await page.emulateMedia({ media: 'print' });
    const pdf = readPdf(await page.pdf({ preferCSSPageSize: true }));
    await context.close();
    return pdf;
  };
  const without = await pdfOf('reduce', false);
  const withViewer = await pdfOf('no-preference', true);
  expect(withViewer.pages).toBe(4);
  for (const size of withViewer.sizes) expect(size.map(Math.round)).toEqual([960, 540]);
  expect(withViewer.pages).toBe(without.pages);
  expect(withViewer.sizes).toEqual(without.sizes);
  expect(withViewer.text).toBe(without.text);
  expect(withViewer.images).toBe(0);
  expect(withViewer.text.replace(/\s/g, '')).toContain('Quiénsoy');
});

test('pages host: the published deck turns under its strict CSP', async ({ page }) => {
  const violations = cspViolations(page);
  await ready(page, url('pages', `/${SLUG}`));
  await page.keyboard.press('ArrowRight');
  await expect(position(page)).toHaveText('Diapositiva 2 de 4');
  await expect(layer(page)).toHaveAttribute('data-page-turn', 'forward');
  await expect(layer(page)).toHaveCount(0);
  await expect(page.locator('[data-slide-index="1"] h2')).toHaveText('Quién soy');
  expect(violations).toEqual([]);
});
