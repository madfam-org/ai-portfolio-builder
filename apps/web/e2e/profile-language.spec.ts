/**
 * W7 (B4), 2026-11-21: changing the profile's primary language in the editor swaps the texts (lib/profile-text-swap.ts):
 * after «Guardar perfil» with English as the profile language, the header shows its English text, the switch offers
 * Spanish as the other language with the former Spanish text, and the items show their English text at once (no
 * reload). Synthetic persona; another owner cannot read the item.
 */
import { expect, test } from '@playwright/test';
import { apiAs, cspViolations, signIn, type Json } from './support/fixtures.ts';
import { suiteOwners, url } from './support/env.ts';

const { OWNER_B } = suiteOwners('profile-language');
/** A fresh owner key per run, so a re-run on the same database starts from an empty profile. */
const PERSON = { sub: `janua|e2e-profile-language-${Date.now().toString(36)}`, name: 'Renata Ficticia Luna', email: 'renata@example.test' };

test('switching the primary language to English swaps the header and the items in the editor', async ({ page }) => {
  const violations = cspViolations(page);
  const put = await apiAs(PERSON, 'PUT', '/api/v1/profile', {
    headline: 'Asesora de ventas de lujo',
    summary: 'Cinco años en boutique.',
    locale: 'es-MX',
    contact: { location: 'Ciudad de México' },
    translations: { en: { headline: 'Luxury sales advisor' } },
  });
  expect(put.status).toBe(200);
  const item = await apiAs(PERSON, 'POST', '/api/v1/profile/items', {
    kind: 'experience',
    content: { role: 'Asesora de ventas', organization: 'Casa Ejemplo', startDate: '2021-03' },
    translations: { en: { role: 'Sales advisor' } },
  });
  expect(item.status).toBe(201);
  const itemId = item.json!.item.id as string;

  await signIn(page.context(), PERSON);
  await page.goto(url('app', '/perfil'));
  const experience = page.getByTestId('section-experience').getByTestId('profile-item');
  await expect(experience).toContainText('Asesora de ventas');
  await expect(page.locator('#perfil-titular')).toHaveValue('Asesora de ventas de lujo');

  await page.locator('#perfil-idioma').selectOption('en');
  await page.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(page.getByTestId('header-state')).toHaveText('Perfil guardado.');

  // The header's main text is now the English one; English is the primary language and Spanish the other.
  await expect(page.locator('#perfil-titular')).toHaveValue('Luxury sales advisor');
  await expect(page.locator('#perfil-resumen')).toHaveValue('Cinco años en boutique.');
  await expect(page.locator('#perfil-language-en')).toBeChecked();
  await expect(page.locator('label[for="perfil-language-en"]')).toContainText('(principal)');
  await expect(page.locator('label[for="perfil-language-es-MX"]')).not.toContainText('(principal)');
  await page.locator('label[for="perfil-language-es-MX"]').click();
  await expect(page.getByLabel('Titular en español', { exact: false })).toHaveValue('Asesora de ventas de lujo');
  // The item shows its English text without a reload.
  await expect(experience).toContainText('Sales advisor');
  await expect(experience).not.toContainText('Asesora de ventas');

  const stored = (await apiAs(PERSON, 'GET', '/api/v1/profile')).json!;
  expect(stored.profile.locale).toBe('en');
  expect(stored.profile.translations).toEqual({ 'es-MX': { headline: 'Asesora de ventas de lujo' } });
  const exp = (stored.items as Json[]).find((i) => i.id === itemId)!;
  expect(exp.content.role).toBe('Sales advisor');
  expect(exp.translations).toEqual({ 'es-MX': { role: 'Asesora de ventas' } });
  expect((await apiAs(OWNER_B, 'GET', `/api/v1/profile/items/${itemId}`)).status).toBe(404);
  expect(violations).toEqual([]);
});
