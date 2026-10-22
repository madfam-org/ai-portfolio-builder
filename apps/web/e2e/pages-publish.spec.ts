/**
 * Publishing from the app (W3-4) and what the pages host then serves: public with a chosen address (noindex until
 * the owner ticks the box), by link (copy, change, unpublish), every kind rendered with the right headers, the
 * presentation's script under the pages CSP, a suspended artifact (SQL fixture) and the 20-per-24-hours limit.
 */
import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';
import { apiAs, cspViolations, raw, signIn } from './support/fixtures.ts';
import { suiteOwners, url } from './support/env.ts';

const { OWNER_A } = suiteOwners('pages-publish');

const RUN = Date.now().toString(36);
const SLUG = `ana-${RUN}`;
const OWNER_C = { sub: 'janua|e2e-owner-c-publish-limit', name: 'Carla Prueba', email: 'carla@example.test' };
const ids: Record<string, string> = {};

test.beforeAll(async () => {
  expect((await apiAs(OWNER_A, 'PUT', '/api/v1/profile', { displayName: 'Ana Prueba', headline: 'Ingeniera de datos' })).status).toBe(200);
  const item = await apiAs(OWNER_A, 'POST', '/api/v1/profile/items', { kind: 'experience', content: { role: 'Backend', organization: 'Acme', startDate: '2022-01' } });
  const itemId = item.json?.item.id as string;
  const set = await apiAs(OWNER_A, 'POST', '/api/v1/artifacts/batch', {
    artifacts: ['cv', 'portfolio', 'presentation', 'cover_letter'].map((kind) => ({
      kind,
      title: `${kind} ${RUN}`,
      content: { items: [{ itemId }], ...(kind === 'presentation' ? { slides: [{ title: 'Uno', itemIds: [itemId] }, { title: 'Dos', body: 'Fin' }] } : {}) },
    })),
  });
  expect(set.status).toBe(201);
  for (const a of set.json?.artifacts as { id: string; kind: string }[]) ids[a.kind] = a.id;
});

async function openDocument(page: Page, kind: string) {
  await signIn(page.context(), OWNER_A);
  await page.goto(url('app', `/documentos/${ids[kind]}`));
}

const shared = (page: Page) => page.getByLabel('Dirección para compartir');

test('public: a chosen address, noindex by default, indexed only after the box is ticked; reserved and taken slugs refused', async ({ page }) => {
  const violations = cspViolations(page);
  await openDocument(page, 'cv');
  await page.getByLabel('Público').check();
  await page.getByLabel('Dirección', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Publicar' }).click();
  await expect(page.getByText('Esa dirección no es válida o está reservada.')).toBeVisible();
  await page.getByLabel('Dirección', { exact: true }).fill(SLUG);
  await expect(page.getByLabel('Permitir que buscadores indexen esta página')).not.toBeChecked();
  await page.getByRole('button', { name: 'Publicar' }).click();
  await expect(shared(page)).toHaveValue(`https://cv-p.localhost/${SLUG}`);

  const first = await raw('pages', 'GET', `/${SLUG}`);
  expect(first.status).toBe(200);
  expect(first.headers['x-robots-tag']).toBe('noindex, nofollow, noai, noimageai');
  expect(first.headers['cache-control']).toBe('no-store');
  expect(first.body).toContain('Ana Prueba');

  await page.getByLabel('Permitir que buscadores indexen esta página').check();
  await page.getByRole('button', { name: 'Guardar cambios' }).last().click();
  await expect(page.getByRole('status').filter({ hasText: 'Publicado' })).toBeVisible();
  await expect.poll(async () => (await raw('pages', 'GET', `/${SLUG}`)).headers['x-robots-tag']).toBe('index, follow');

  await openDocument(page, 'portfolio');
  await page.getByLabel('Público').check();
  await page.getByLabel('Dirección', { exact: true }).fill(SLUG);
  await page.getByRole('button', { name: 'Publicar' }).click();
  await expect(page.getByText('Esa dirección ya está en uso. Prueba otra.')).toBeVisible();
  expect(violations).toEqual([]);
});

test('link: copy, change the link (the old one stops), unpublish (the page is gone)', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openDocument(page, 'portfolio');
  await page.getByLabel('Con enlace').check();
  await page.getByRole('button', { name: 'Publicar' }).click();
  await expect(shared(page)).toHaveValue(/^https:\/\/cv-p\.localhost\/l\/[A-Za-z0-9_-]{43}$/);
  const first = new URL(await shared(page).inputValue()).pathname;
  const res = await raw('pages', 'GET', first);
  expect(res.status).toBe(200);
  expect(res.headers['cache-control']).toBe('private, no-store');
  expect(res.headers['referrer-policy']).toBe('no-referrer');
  expect(res.headers['x-robots-tag']).toBe('noindex, nofollow, noai, noimageai');
  expect(res.headers['set-cookie']).toBeUndefined();

  await page.getByRole('button', { name: 'Copiar enlace' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Enlace copiado' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`https://cv-p.localhost${first}`);

  await page.getByRole('button', { name: 'Cambiar enlace' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cambiar enlace' }).click();
  await expect(shared(page)).not.toHaveValue(`https://cv-p.localhost${first}`);
  const second = new URL(await shared(page).inputValue()).pathname;
  expect((await raw('pages', 'GET', first)).status).toBe(404);
  expect((await raw('pages', 'GET', second)).status).toBe(200);

  await page.getByRole('button', { name: 'Despublicar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Despublicar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Ya no está publicado' })).toBeVisible();
  await expect(shared(page)).toHaveCount(0);
  expect((await raw('pages', 'GET', second)).status).toBe(404);
});

test('the pages host renders every kind; the presentation\'s keys work under the pages CSP', async ({ page }) => {
  const violations = cspViolations(page);
  for (const kind of ['presentation', 'cover_letter']) {
    const pub = await apiAs(OWNER_A, 'POST', `/api/v1/artifacts/${ids[kind]}/publish`, { visibility: 'link' });
    expect(pub.status).toBe(200);
    const res = await page.goto(url('pages', `/l/${pub.json?.artifact.shareToken}`));
    expect(res?.status()).toBe(200);
    await expect(page.locator(`article[data-kind="${kind}"]`)).toBeVisible();
    await expect(page.getByRole('link', { name: /Repórtalo/ })).toHaveAttribute('href', /^mailto:legal@madfam\.io\?subject=/);
    if (kind === 'presentation') {
      await expect(page.getByTestId('slide-position')).toHaveText('Diapositiva 1 de 3');
      await page.keyboard.press('ArrowRight');
      await expect(page.getByTestId('slide-position')).toHaveText('Diapositiva 2 de 3');
      await expect(page.getByRole('heading', { name: 'Uno' })).toBeVisible();
    }
  }
  expect(violations).toEqual([]);
});

test('drafts and suspended artifacts are the 404; a suspended one shows why in the app and cannot be published', async ({ page }) => {
  const id = ids.cover_letter!;
  const slug = `carta-${RUN}`;
  expect((await apiAs(OWNER_A, 'POST', `/api/v1/artifacts/${id}/publish`, { visibility: 'public', slug })).status).toBe(200);
  expect((await raw('pages', 'GET', `/${slug}`)).status).toBe(200);
  // Back to draft withdraws it (the API clears the handles).
  expect((await apiAs(OWNER_A, 'PATCH', `/api/v1/artifacts/${id}`, { status: 'draft' })).status).toBe(200);
  expect((await raw('pages', 'GET', `/${slug}`)).status).toBe(404);

  expect((await apiAs(OWNER_A, 'POST', `/api/v1/artifacts/${id}/publish`, { visibility: 'public', slug })).status).toBe(200);
  const sql = postgres(process.env.CV_TEST_OWNER_URL!, { max: 1, onnotice: () => undefined });
  try {
    await sql`update artifacts set suspended_at = now(), suspended_reason = 'Prueba de moderación' where id = ${id}`;
  } finally {
    await sql.end();
  }
  const gone = await raw('pages', 'GET', `/${slug}`);
  expect(gone.status).toBe(404);
  expect(gone.headers['x-robots-tag']).toBe('noindex, nofollow, noai, noimageai');
  expect((await apiAs(OWNER_A, 'POST', `/api/v1/artifacts/${id}/publish`, { visibility: 'link' })).status).toBe(409);

  await openDocument(page, 'cover_letter');
  await expect(page.getByText('Documento suspendido')).toBeVisible();
  await expect(page.getByText('Prueba de moderación')).toBeVisible();
  await expect(page.getByLabel('Con enlace')).toBeDisabled();
  await page.goto(url('app', '/documentos'));
  await expect(page.locator(`[data-artifact-id="${id}"]`)).toContainText('Suspendido');
});

test('the publish limit (20 different documents in 24 hours) is stated and its refusal explained', async ({ page }) => {
  const made: string[] = [];
  for (let batch = 0; batch < 6; batch += 1) {
    const set = await apiAs(OWNER_C, 'POST', '/api/v1/artifacts/batch', { artifacts: Array.from({ length: batch === 5 ? 1 : 4 }, (_, i) => ({ kind: 'cv', title: `Límite ${batch}-${i}` })) });
    expect(set.status).toBe(201);
    made.push(...(set.json?.artifacts as { id: string }[]).map((a) => a.id));
  }
  for (const id of made.slice(0, 20)) expect((await apiAs(OWNER_C, 'POST', `/api/v1/artifacts/${id}/publish`, { visibility: 'link' })).status).toBe(200);
  await signIn(page.context(), OWNER_C);
  await page.goto(url('app', `/documentos/${made[20]}`));
  await expect(page.getByText('Puedes publicar hasta 20 documentos distintos cada 24 horas.')).toBeVisible();
  await page.getByLabel('Con enlace').check();
  await page.getByRole('button', { name: 'Publicar' }).click();
  await expect(page.getByText(/Llegaste al límite de 20 documentos publicados en 24 horas/)).toBeVisible();
});
