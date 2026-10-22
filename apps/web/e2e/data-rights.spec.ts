/**
 * W4-I data rights on `/ajustes`, over the built server and a real Postgres: «Descargar mis datos» (everything, share
 * state included) and «Exportar como JSON Resume» as downloads; «Eliminar mis datos» behind a typed «ELIMINAR»; after
 * it the person holds nothing, their shared page is gone from the pages host at once, another person is untouched, and
 * the Janua account is only linked, never deleted.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { apiAs, cspViolations, raw, signIn } from './support/fixtures.ts';
import { suiteOwners, url } from './support/env.ts';

const { OWNER_A, OWNER_B } = suiteOwners('data-rights');

async function download(page: Page, button: string): Promise<{ name: string; json: Record<string, unknown> }> {
  const wait = page.waitForEvent('download');
  await page.getByRole('button', { name: button }).click();
  const d = await wait;
  const path = await d.path();
  return { name: d.suggestedFilename(), json: JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown> };
}

test('download everything and JSON Resume; then delete with a typed confirmation; B untouched; pages gone', async ({ page, context }) => {
  const violations = cspViolations(page);
  // A: a profile, an item, a job, a document shared by link. B: a profile item.
  expect((await apiAs(OWNER_A, 'PUT', '/api/v1/profile', { headline: 'Ingeniera de datos', contact: { email: 'ana@example.test' } })).status).toBe(200);
  const item = await apiAs(OWNER_A, 'POST', '/api/v1/profile/items', { kind: 'experience', content: { role: 'Backend', organization: 'Acme', startDate: '2022-01' } });
  const job = await apiAs(OWNER_A, 'POST', '/api/v1/jobs', { title: 'Backend Engineer', sourceText: 'PostgreSQL y TypeScript' });
  const art = await apiAs(OWNER_A, 'POST', '/api/v1/artifacts', { jobId: job.json?.job.id, kind: 'cv', title: 'CV de A', content: { items: [{ itemId: item.json?.item.id }] } });
  const shared = await apiAs(OWNER_A, 'POST', `/api/v1/artifacts/${art.json?.artifact.id}/publish`, { visibility: 'link' });
  const token = shared.json?.artifact.shareToken as string;
  expect((await raw('pages', 'GET', `/l/${token}`)).status).toBe(200);
  expect((await apiAs(OWNER_B, 'POST', '/api/v1/profile/items', { kind: 'skill', content: { name: 'De B' } })).status).toBe(201);
  const bBefore = (await apiAs(OWNER_B, 'GET', '/api/v1/profile')).json;

  await signIn(context, OWNER_A);
  const res = await page.goto(url('app', '/ajustes'));
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeVisible();
  await expect(page.getByText('En construcción')).toHaveCount(0);

  const full = await download(page, 'Descargar mis datos (JSON)');
  expect(full.name).toMatch(/^cv-mis-datos-\d{4}-\d{2}-\d{2}\.json$/);
  expect(full.json).toMatchObject({ schema: 'madfam-cv-export', version: 1, profile: { headline: 'Ingeniera de datos' } });
  expect(full.json.items).toHaveLength(1);
  expect(full.json.jobs).toHaveLength(1);
  expect(full.json.artifacts).toMatchObject([{ title: 'CV de A', visibility: 'link', shareToken: token }]);
  expect(JSON.stringify(full.json)).not.toContain('De B');
  await expect(page.getByText('Listo: revisa tus descargas.')).toBeVisible();

  const jr = await download(page, 'Exportar como JSON Resume');
  expect(jr.name).toMatch(/^cv-json-resume-\d{4}-\d{2}-\d{2}\.json$/);
  expect(jr.json).toMatchObject({ basics: { name: OWNER_A.name, label: 'Ingeniera de datos', email: 'ana@example.test' }, work: [{ name: 'Acme', position: 'Backend', startDate: '2022-01' }] });

  // Delete: the Janua account is only linked; the typed word is required (wrong case refused, nothing deleted).
  await expect(page.getByText(/Esto no borra tu cuenta de Janua/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ir a Janua' })).toHaveAttribute('href', /^https?:\/\//);
  await page.getByRole('button', { name: 'Eliminar mis datos…' }).click();
  const dialog = page.getByRole('dialog', { name: '¿Eliminar todos tus datos?' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Para confirmar, escribe ELIMINAR').fill('eliminar');
  await dialog.getByRole('button', { name: 'Eliminar todo' }).click();
  await expect(dialog.getByText('Escribe ELIMINAR, en mayúsculas, para confirmar.')).toBeVisible();
  await expect(dialog.getByLabel('Para confirmar, escribe ELIMINAR')).toBeFocused();
  expect((await apiAs(OWNER_A, 'GET', '/api/v1/profile')).json?.items).toHaveLength(1);
  // Escape cancels.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect((await apiAs(OWNER_A, 'GET', '/api/v1/jobs')).json?.jobs).toHaveLength(1);

  await page.getByRole('button', { name: 'Eliminar mis datos…' }).click();
  await dialog.getByLabel('Para confirmar, escribe ELIMINAR').fill('ELIMINAR');
  await dialog.getByRole('button', { name: 'Eliminar todo' }).click();
  await expect(page.getByText('Eliminamos tus datos: 1 elemento del perfil, 1 empleo y 1 documento. Tu cuenta de Janua sigue activa.')).toBeVisible();
  await expect(dialog).toBeHidden();

  expect((await apiAs(OWNER_A, 'GET', '/api/v1/profile')).json).toEqual({ profile: null, items: [] });
  expect((await apiAs(OWNER_A, 'GET', '/api/v1/jobs')).json).toEqual({ jobs: [] });
  expect((await apiAs(OWNER_A, 'GET', '/api/v1/artifacts')).json).toEqual({ artifacts: [] });
  expect((await raw('pages', 'GET', `/l/${token}`)).status).toBe(404);
  expect((await apiAs(OWNER_B, 'GET', '/api/v1/profile')).json).toEqual(bBefore);

  // Export after deletion: empty, and says so.
  const after = await download(page, 'Descargar mis datos (JSON)');
  expect([after.json.profile, after.json.items, after.json.jobs, after.json.artifacts]).toEqual([null, [], [], []]);
  // The person is still signed in (the account lives in Janua); the profile page starts empty.
  await page.goto(url('app', '/perfil'));
  await expect(page.getByRole('heading', { name: 'Tu perfil todavía está vacío' })).toBeVisible();
  expect(violations).toEqual([]);
});

test('English: the same controls, typed DELETE', async ({ page, context }) => {
  await signIn(context, OWNER_B);
  await page.goto(url('app', '/en/ajustes'));
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download my data (JSON)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export as JSON Resume' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete my data…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete all your data?' });
  await dialog.getByLabel('To confirm, type DELETE').fill('DELETE');
  await dialog.getByRole('button', { name: 'Delete everything' }).click();
  await expect(page.getByText(/^We deleted your data: 1 profile item, 0 jobs and 0 documents\./)).toBeVisible();
  expect((await apiAs(OWNER_B, 'GET', '/api/v1/profile')).json).toEqual({ profile: null, items: [] });
});
