/** Smoke: the app host (cv-app) — signed out, signed in as A and as B, every declared route, the data layer. */
import { expect, test } from '@playwright/test';
import { cspViolations, signIn } from './support/fixtures.ts';
import { OWNER_A, OWNER_B, url } from './support/env.ts';

const ID = '0b6f3c1e-8a4d-4f7e-9c2a-1d5e6f7a8b9c';
const ROUTES = ['/perfil', '/empleos', `/empleos/${ID}`, `/empleos/${ID}/adaptar`, '/documentos', `/documentos/${ID}`, `/documentos/${ID}/vista-previa`, `/documentos/${ID}/imprimir`, '/ajustes'];

test('signed out: every route offers sign-in and returns to the same page afterwards; no nav', async ({ page }) => {
  for (const path of ['/perfil', `/empleos/${ID}/adaptar`]) {
    const res = await page.goto(url('app', path));
    expect(res?.status()).toBe(200);
    expect(res?.headers()['x-robots-tag']).toBe('noindex, nofollow');
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
    await expect(page.locator('form[action="/auth/entrar"] input[name="redirect_to"]')).toHaveValue(path);
    await expect(page.getByRole('navigation', { name: 'Secciones de la app' })).toHaveCount(0);
  }
});

test('signed in as A: the nav, the account controls and an honest placeholder on every route', async ({ page, context }) => {
  const violations = cspViolations(page);
  await signIn(context, OWNER_A);
  await page.goto(url('app', '/'));
  const nav = page.getByRole('navigation', { name: 'Secciones de la app' });
  await expect(nav.getByRole('link')).toHaveText(['Inicio', 'Perfil', 'Empleos', 'Documentos', 'Ajustes']);
  await expect(page.getByText(OWNER_A.name)).toBeVisible();
  for (const name of ['Cambiar de cuenta', 'Entrar como otra persona', 'Cerrar sesión']) await expect(page.getByRole('button', { name })).toBeVisible();
  for (const path of ROUTES) {
    const res = await page.goto(url('app', path));
    expect(res?.status(), path).toBe(200);
    await expect(page.getByText('En construcción').first(), path).toBeVisible();
  }
  await page.goto(url('app', `/empleos/${ID}/adaptar`));
  await expect(nav.getByRole('link', { name: 'Empleos' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: /English/ })).toHaveAttribute('href', `/en/empleos/${ID}/adaptar`);
  expect((await page.goto(url('app', '/empleos/no-es-un-id')))?.status()).toBe(404);
  expect(violations).toEqual([]);
});

test('the data layer is owner-scoped: what A creates in /documentos, B never sees', async ({ browser }) => {
  const a = await browser.newContext();
  await signIn(a, OWNER_A);
  const pa = await a.newPage();
  await pa.goto(url('app', '/documentos'));
  const title = `CV de A ${Date.now()}`;
  await pa.getByLabel('Título').fill(title);
  await pa.getByRole('button', { name: 'Crear' }).click();
  await expect(pa.getByTestId('artifact-list')).toContainText(title);
  await expect(pa.getByRole('status').filter({ hasText: 'Guardado' })).toBeVisible();

  const b = await browser.newContext();
  await signIn(b, OWNER_B);
  const pb = await b.newPage();
  await pb.goto(url('app', '/documentos'));
  await expect(pb.getByText('Aún no tienes ninguno.')).toBeVisible();
  await expect(pb.getByText(title)).toHaveCount(0);
  await a.close();
  await b.close();
});
