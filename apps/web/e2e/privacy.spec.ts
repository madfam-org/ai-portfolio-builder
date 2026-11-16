/**
 * cv's privacy notice over the built server: `/privacidad` and `/en/privacidad` on the landing host (noindex like the
 * landing, no CSP violation), the draft state shown with what is pending, the required sections present, and the
 * footer of the landing and of the app pointing to it. Not served on the app or API hosts.
 */
import { expect, test } from '@playwright/test';
import { cspViolations, raw } from './support/fixtures.ts';
import { HOSTS, url } from './support/env.ts';

test('the notice in Spanish: draft state, the simplified notice first, every required section, the mailbox as a link', async ({ page }) => {
  const violations = cspViolations(page);
  const res = await page.goto(url('landing', '/privacidad'));
  expect(res?.status()).toBe(200);
  expect(res?.headers()['x-robots-tag']).toContain('noindex');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-MX');
  await expect(page.getByRole('heading', { level: 1, name: 'Aviso de privacidad de MADFAM CV' })).toBeVisible();
  await expect(page.getByTestId('privacy-status')).toHaveText('Borrador en revisión');
  await expect(page.getByTestId('privacy-version')).toContainText(/Versión \d{4}-\d{2}-\d{2}\.\d+/);
  await expect(page.getByTestId('privacy-pending')).toContainText('aprobación de este texto');
  for (const name of ['En breve', 'Quién es responsable de tus datos', 'Qué datos tratamos', 'Para qué los usamos', 'Cómo limitar el uso o la divulgación de tus datos', 'Tus derechos y cómo ejercerlos', 'Cambios a este aviso']) {
    await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
  }
  await expect(page.getByRole('link', { name: 'privacy@madfam.io' }).first()).toHaveAttribute('href', 'mailto:privacy@madfam.io');
  await expect(page.getByText('Secretaría Anticorrupción y Buen Gobierno')).toBeVisible();
  await expect(page.getByRole('link', { name: 'English' })).toHaveAttribute('href', '/en/privacidad');
  expect(violations).toEqual([]);
});

test('English, the footer links on the landing and the app, and no notice on the other hosts', async ({ page }) => {
  await page.goto(url('landing', '/en/privacidad'));
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1, name: 'MADFAM CV privacy notice' })).toBeVisible();
  await expect(page.getByTestId('privacy-status')).toHaveText('Draft under review');
  await expect(page.getByTestId('privacy-version')).toContainText('The Spanish text is the one that governs.');
  await page.goto(url('landing', '/'));
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Aviso de privacidad' })).toHaveAttribute('href', `https://${HOSTS.landing}/privacidad`);
  await page.goto(url('app', '/en'));
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Privacy notice' })).toHaveAttribute('href', `https://${HOSTS.landing}/en/privacidad`);
  expect((await raw('app', 'GET', '/privacidad')).status).toBe(404);
  expect((await raw('api', 'GET', '/privacidad')).status).toBe(404);
});
