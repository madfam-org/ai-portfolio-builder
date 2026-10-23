/**
 * B1 first-run guide on the app home, over the built server and a real Postgres: a signed-in person with an empty
 * profile sees «Primeros pasos» (import, or by hand, then the first job) and the privacy line; English under /en;
 * the guide goes away as soon as the profile holds anything; signed out there is no guide.
 */
import { expect, test } from '@playwright/test';
import { apiAs, cspViolations, signIn } from './support/fixtures.ts';
import { suiteOwners, url } from './support/env.ts';

const { OWNER_A, OWNER_B } = suiteOwners('onboarding');

test('empty profile: the guide shows the three ways in and the privacy line, in es and en', async ({ page, context }) => {
  const violations = cspViolations(page);
  await signIn(context, OWNER_A);
  await page.goto(url('app', '/'));
  const guide = page.getByTestId('first-run-guide');
  await expect(guide.getByRole('heading', { name: 'Primeros pasos' })).toBeVisible();
  await expect(guide.getByRole('link', { name: 'Importar LinkedIn o JSON Resume' })).toHaveAttribute('href', '/perfil#perfil-importar');
  await expect(guide.getByRole('link', { name: 'Empezar a mano' })).toHaveAttribute('href', '/perfil');
  await expect(guide.getByRole('link', { name: 'Agregar una vacante' })).toHaveAttribute('href', '/empleos/nuevo');
  await expect(guide.getByText('Todo lo que guardas aquí es privado. Nada se publica a menos que tú lo decidas.')).toBeVisible();
  await expect(guide.getByRole('listitem')).toHaveCount(2);

  await page.goto(url('app', '/en'));
  const en = page.getByTestId('first-run-guide');
  await expect(en.getByRole('heading', { name: 'First steps' })).toBeVisible();
  await expect(en.getByRole('link', { name: 'Import LinkedIn or JSON Resume' })).toHaveAttribute('href', '/en/perfil#perfil-importar');
  await expect(en.getByRole('link', { name: 'Add a job' })).toHaveAttribute('href', '/en/empleos/nuevo');
  await expect(en.getByText(/Nothing is published unless you choose to publish it\./)).toBeVisible();

  // «Importar» lands on the import panel of /perfil.
  await page.goto(url('app', '/'));
  await page.getByRole('link', { name: 'Importar LinkedIn o JSON Resume' }).click();
  await expect(page).toHaveURL(/\/perfil#perfil-importar$/);
  await expect(page.getByTestId('import-panel')).toBeVisible();
  expect(violations).toEqual([]);
});

test('the guide goes away once the profile holds anything; the home cards stay', async ({ page, context }) => {
  expect((await apiAs(OWNER_B, 'POST', '/api/v1/profile/items', { kind: 'skill', content: { name: 'Visual merchandising' } })).status).toBe(201);
  await signIn(context, OWNER_B);
  // The guide decides after the profile read: wait for that answer before asserting it stayed away.
  const read = page.waitForResponse((r) => r.url().endsWith('/api/v1/profile') && r.request().method() === 'GET');
  await page.goto(url('app', '/'));
  expect((await read).status()).toBe(200);
  await expect(page.getByRole('heading', { level: 2, name: 'Perfil' })).toBeVisible();
  await expect(page.getByTestId('first-run-guide')).toHaveCount(0);
});

test('signed out: no guide, only the sign-in', async ({ page }) => {
  await page.goto(url('app', '/'));
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(page.getByTestId('first-run-guide')).toHaveCount(0);
});
