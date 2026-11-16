/**
 * Batch 4 (critique #6): the profile reads as short as what the person has. A new person sees import first (open),
 * an untouched header that is NOT «unsaved», and every kind as one compact block with its «Agregar …». Once a kind
 * has an item it becomes a full section above «Más secciones»; import folds for a profile that already has content.
 */
import { expect, test } from '@playwright/test';
import { apiAs, cspViolations, signIn } from './support/fixtures.ts';
import { url } from './support/env.ts';

const NEW = { sub: 'janua|e2e-profile-layout', name: 'Lorena Diseño', email: 'lorena@example.test' };

test('a new profile: import open, nothing unsaved, compact kinds; a first item moves its kind up; import folds later', async ({ page }) => {
  const violations = cspViolations(page);
  await signIn(page.context(), NEW);
  await page.goto(url('app', '/perfil'));
  const toggle = page.getByTestId('import-toggle');
  await expect(toggle).toHaveAttribute('open', '');
  await expect(page.getByTestId('import-panel').getByRole('heading', { name: 'Importar tus datos' })).toBeVisible();
  // The account name is prefilled, and that is not unsaved work.
  await expect(page.getByLabel('Nombre como quieres que aparezca', { exact: false })).toHaveValue('Lorena Diseño');
  await expect(page.getByText('Sin cambios pendientes.')).toBeVisible();
  await expect(page.getByText('Tienes cambios sin guardar.')).toHaveCount(0);
  // Every kind is compact under «Más secciones», each with its own «Agregar».
  const more = page.getByRole('region', { name: 'Más secciones' });
  await expect(more.getByTestId('section-experience').getByRole('button', { name: 'Agregar experiencia' })).toBeVisible();
  await expect(more.getByTestId('section-experience').getByTestId('profile-item')).toHaveCount(0);

  const created = await apiAs(NEW, 'POST', '/api/v1/profile/items', { kind: 'experience', content: { role: 'Asesora de ventas', organization: 'Casa Ejemplo', startDate: '2021-03' } });
  expect(created.status).toBe(201);
  await page.reload();
  await expect(page.getByTestId('section-experience').getByTestId('profile-item')).toHaveCount(1);
  await expect(more.getByTestId('section-experience')).toHaveCount(0);
  await expect(more.getByTestId('section-education')).toBeVisible();
  await expect(page.getByTestId('import-toggle')).not.toHaveAttribute('open', '');
  await page.getByText('Importar de LinkedIn o de un archivo JSON Resume').click();
  await expect(page.getByTestId('import-panel').getByRole('heading', { name: 'Importar tus datos' })).toBeVisible();
  expect(violations).toEqual([]);
});
