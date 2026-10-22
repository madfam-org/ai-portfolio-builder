/**
 * W5-P phase 2 end to end: the pages host (cv-p) shows published CVs, portfolios and cover letters on a sheet of
 * bond 80 (Pliego's stock card), on screen only and WITHOUT script (a nonce'd style the strict CSP admits); slides keep
 * their frame. Indexing headers, the CSP, no cookies and same-origin assets are unchanged, and printing gives the same
 * PDF as the page without the sheet.
 */
import { expect, test, type Page } from '@playwright/test';
import { readPdf } from './documents-pdf.ts';
import { apiAs, cspViolations, raw } from './support/fixtures.ts';
import { suiteOwners, url } from './support/env.ts';

const { OWNER_A } = suiteOwners('pagespaper');
const NAME = 'Pía Papel';
const RUN = Date.now().toString(36);
const SLUG = `pia-cv-${RUN}`;
const DECK = `pia-deck-${RUN}`;
let token = '';
const BOND = 'rgb(247, 247, 242)';

test.beforeAll(async () => {
  expect((await apiAs(OWNER_A, 'PUT', '/api/v1/profile', { displayName: NAME, headline: 'Analista', summary: 'Ocho años en finanzas.' })).status).toBe(200);
  const item = await apiAs(OWNER_A, 'POST', '/api/v1/profile/items', { kind: 'experience', content: { role: 'Analista de finanzas', organization: 'Ejemplo SA', startDate: '2018-01' } });
  expect(item.status).toBe(201);
  const items = [{ itemId: item.json!.item.id as string }];
  const set = await apiAs(OWNER_A, 'POST', '/api/v1/artifacts/batch', {
    artifacts: [
      { kind: 'cv', title: `CV ${RUN}`, content: { items } },
      { kind: 'cover_letter', title: `Carta ${RUN}`, content: { items, greeting: 'Hola:', summary: 'Me interesa el puesto.', closing: 'Saludos,' } },
      { kind: 'presentation', title: `Deck ${RUN}`, content: { items: [], slides: [{ title: 'Quién soy', body: 'Pía' }] } },
    ],
  });
  expect(set.status).toBe(201);
  const [cv, letter, deck] = set.json!.artifacts as { id: string }[];
  expect((await apiAs(OWNER_A, 'POST', `/api/v1/artifacts/${cv!.id}/publish`, { visibility: 'public', slug: SLUG })).status).toBe(200);
  expect((await apiAs(OWNER_A, 'POST', `/api/v1/artifacts/${deck!.id}/publish`, { visibility: 'public', slug: DECK })).status).toBe(200);
  const link = await apiAs(OWNER_A, 'POST', `/api/v1/artifacts/${letter!.id}/publish`, { visibility: 'link' });
  expect(link.status).toBe(200);
  token = link.json!.artifact.shareToken as string;
});

const sheet = (page: Page) => page.locator('[data-paper-stock]');

test('public CV: bond 80 in light and dark, reduced motion, strict CSP intact, no style attribute, same-origin assets', async ({ page }) => {
  const violations = cspViolations(page);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    const res = await page.goto(url('pages', `/${SLUG}`));
    expect(res?.status()).toBe(200);
    const h = res!.headers();
    expect(h['x-robots-tag']).toBe('noindex, nofollow, noai, noimageai');
    expect(h['content-security-policy']).toMatch(/^default-src 'none'; .*style-src 'self' 'nonce-[^']+'/);
    expect(h['set-cookie']).toBeUndefined();
    await expect(sheet(page)).toHaveAttribute('data-paper-stock', 'copy-80');
    await expect(sheet(page)).toHaveCSS('background-color', BOND);
    await expect(sheet(page)).toHaveCSS('transition-duration', '0s');
    await expect(page.locator('article[data-kind="cv"] h1')).toHaveText(NAME);
    await expect(page.locator('article[data-kind="cv"] h1')).toHaveCSS('color', 'rgb(23, 32, 27)');
  }
  const body = (await raw('pages', 'GET', `/${SLUG}`)).body;
  expect(body).not.toMatch(/\sstyle="/);
  expect(body).toMatch(/<style nonce="[^"]+">\[data-paper-stock="copy-80"\]\{--paper-face:#f7f7f2;--paper-edge:1px\}<\/style>/);
  for (const ref of [...body.matchAll(/\s(?:src|href)="([^"]+)"/g)].map((m) => m[1]!)) {
    expect(ref, 'no third-party asset').not.toMatch(/^(https?:)?\/\/(?!cv\.localhost|cv-p\.localhost)/);
  }
  expect(violations).toEqual([]);
});

test('without script the published CV is still on paper (the style is server-rendered)', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(url('pages', `/${SLUG}`));
  await expect(sheet(page)).toHaveCSS('background-color', BOND);
  await expect(page.locator('article[data-kind="cv"] h1')).toHaveText(NAME);
  await context.close();
});

test('print: a plain white page, and the same PDF as the page without the sheet', async ({ page }) => {
  await page.goto(url('pages', `/${SLUG}`));
  await page.emulateMedia({ media: 'print' });
  await expect(sheet(page)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(sheet(page)).toHaveCSS('box-shadow', 'none');
  await expect(sheet(page)).toHaveCSS('padding-top', '0px');
  const withSheet = readPdf(await page.pdf());
  await page.evaluate(() => {
    const el = document.querySelector('[data-paper-stock]')!;
    el.replaceWith(...Array.from(el.childNodes));
  });
  await expect(sheet(page)).toHaveCount(0);
  const without = readPdf(await page.pdf());
  expect(withSheet.images).toBe(0);
  expect(withSheet.text.replace(/\s/g, '')).toContain(NAME.replace(/\s/g, ''));
  expect(withSheet.text).toBe(without.text);
  expect(withSheet.pages).toBe(without.pages);
  expect(withSheet.sizes).toEqual(without.sizes);
});

test('link-shared cover letter on paper; headers unchanged; slides keep their frame', async ({ page }) => {
  const violations = cspViolations(page);
  const res = await page.goto(url('pages', `/l/${token}`));
  expect(res?.status()).toBe(200);
  expect(res!.headers()['referrer-policy']).toBe('no-referrer');
  expect(res!.headers()['cache-control']).toBe('private, no-store');
  await expect(sheet(page)).toHaveCSS('background-color', BOND);
  await expect(page.locator('article[data-kind="cover_letter"] h1')).toHaveText(NAME);
  await page.goto(url('pages', `/${DECK}`));
  await expect(page.locator('article[data-kind="presentation"]')).toBeVisible();
  await expect(sheet(page)).toHaveCount(0);
  expect(violations).toEqual([]);
});
