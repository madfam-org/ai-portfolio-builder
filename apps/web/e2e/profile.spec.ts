/**
 * `/perfil`: the core profile editor (W3-2), over the built server, a real Postgres and two owners (A, B) plus a fresh
 * person. A creates one item of every kind through its own form, edits, reorders from the keyboard and deletes with a
 * confirmation; every change survives a reload; failed saves roll back; B never sees A's items and cannot touch them.
 * The tests run in file order on one worker (playwright.config.ts) and build on each other's rows, as a person would.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { apiAs, cspViolations, signIn } from './support/fixtures.ts';
import { suiteOwners, url } from './support/env.ts';

const { OWNER_A, OWNER_B } = suiteOwners('profile');

const FRESH = { sub: 'janua|e2e-profile-fresh', name: 'Fernanda Nueva', email: 'fer@example.test' };
const XSS = '<img src=x onerror="window.__pwned=1">';

const section = (page: Page, kind: string) => page.getByTestId(`section-${kind}`);
const row = (page: Page, kind: string, title: string) => section(page, kind).getByTestId('profile-item').filter({ hasText: title });
const settled = async (r: Locator) => {
  await expect(r).toHaveCount(1);
  await expect(r).not.toHaveAttribute('aria-busy', 'true');
};

/** Opens «Agregar …» of a kind, fills labelled fields (text or select), adds keywords, saves, waits for the row. */
async function addItem(page: Page, kind: string, addLabel: string, fields: Record<string, string>, opts: { tags?: string; title: string; links?: [string, string][] }) {
  await section(page, kind).getByRole('button', { name: addLabel, exact: true }).click();
  const form = page.getByTestId(`form-${kind}-nuevo`);
  await expect(form.getByRole('heading')).toBeFocused();
  for (const [label, value] of Object.entries(fields)) {
    const control = form.getByLabel(label, { exact: false }).first();
    if ((await control.evaluate((el) => el.tagName)) === 'SELECT') await control.selectOption(value);
    else await control.fill(value);
  }
  for (const [i, [label, href]] of (opts.links ?? []).entries()) {
    await form.getByRole('button', { name: 'Agregar enlace' }).click();
    await form.getByLabel(`Nombre (Enlace ${i + 1})`).fill(label);
    await form.getByLabel(`Dirección (URL) (Enlace ${i + 1})`).fill(href);
  }
  if (opts.tags) await form.getByLabel('Palabras clave').fill(opts.tags);
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await settled(row(page, kind, opts.title));
}

test('a fresh person: honest empty state, why a rich profile matters, name from Janua, the import panel, English', async ({ page, context }) => {
  const violations = cspViolations(page);
  await signIn(context, FRESH);
  const res = await page.goto(url('app', '/perfil'));
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Perfil' })).toBeVisible();
  await expect(page.getByText('En construcción')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Tu perfil todavía está vacío' })).toBeVisible();
  await expect(page.getByText('con ellas comparamos tu perfil con el texto de cada vacante')).toBeVisible();
  await expect(page.getByLabel('Nombre como quieres que aparezca')).toHaveValue(FRESH.name);
  await expect(page.getByText('Lo tomamos de tu cuenta de Janua; puedes cambiarlo.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Importar tus datos' })).toBeVisible();
  await expect(page.getByText('No nos conectamos a tu cuenta de LinkedIn ni extraemos datos de otros sitios.')).toBeVisible();
  for (const kind of ['Experiencia', 'Educación', 'Proyectos', 'Habilidades', 'Idiomas', 'Certificaciones', 'Logros', 'Reconocimientos', 'Publicaciones', 'Voluntariado', 'Enlaces']) {
    await expect(page.getByRole('heading', { level: 3, name: kind })).toBeVisible();
  }
  // Header: an invalid email is refused in place (nothing sent); a valid save persists and the name is stored.
  await page.getByLabel('Correo electrónico').fill('fer@');
  await page.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(page.getByLabel('Correo electrónico')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Correo electrónico')).toBeFocused();
  expect((await apiAs(FRESH, 'GET', '/api/v1/profile')).json?.profile).toBeNull();
  await page.getByLabel('Correo electrónico').fill('fer@example.test');
  await page.getByLabel('Titular').fill('Diseñadora de servicios');
  await page.getByRole('button', { name: 'Agregar enlace' }).first().click();
  await page.getByLabel('Nombre (Enlace 1)').fill('Sitio');
  await page.getByLabel('Dirección (URL) (Enlace 1)').fill('ftp://example.test');
  await page.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(page.getByLabel('Dirección (URL) (Enlace 1)')).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Dirección (URL) (Enlace 1)').fill('https://example.test/fer');
  await page.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(page.getByTestId('header-state')).toHaveText('Perfil guardado.');
  const stored = (await apiAs(FRESH, 'GET', '/api/v1/profile')).json?.profile;
  expect(stored).toMatchObject({ displayName: FRESH.name, headline: 'Diseñadora de servicios', contact: { email: 'fer@example.test', links: [{ label: 'Sitio', url: 'https://example.test/fer' }] } });
  await page.goto(url('app', '/en/perfil'));
  await expect(page.getByRole('heading', { name: 'Your career' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Import your data' })).toBeVisible();
  await expect(page.getByLabel('Headline')).toHaveValue('Diseñadora de servicios');
  expect(violations).toEqual([]);
});

test('A creates one item of each of the 11 kinds through its own form; after a reload all are there, in order', async ({ page, context }) => {
  test.setTimeout(120_000);
  const violations = cspViolations(page);
  await signIn(context, OWNER_A);
  await page.goto(url('app', '/perfil'));
  await addItem(page, 'experience', 'Agregar experiencia', { Puesto: 'Analista de datos', 'Empresa u organización': 'Banco del Centro', 'Tipo de empleo': 'contract', Inicio: '2021-03', 'Logros y responsabilidades': 'Automaticé reportes\nReduje costos 20 %' }, { title: 'Analista de datos', tags: 'SQL, Python' });
  await addItem(page, 'education', 'Agregar estudios', { Institución: 'UNAM', 'Título o grado': 'Licenciatura en Actuaría', Fin: '2019' }, { title: 'Licenciatura en Actuaría' });
  await addItem(page, 'project', 'Agregar proyecto', { 'Nombre del proyecto': 'Tablero de ventas', 'Enlace principal': 'https://example.test/tablero' }, { title: 'Tablero de ventas', links: [['Código', 'https://example.test/codigo'], ['Demo', 'http://example.test/demo']] });
  await addItem(page, 'skill', 'Agregar habilidad', { Habilidad: 'Modelado de datos', Nivel: 'advanced', 'Años de experiencia': '4' }, { title: 'Modelado de datos', tags: 'dbt' });
  await addItem(page, 'language', 'Agregar idioma', { Idioma: 'Inglés', 'Nivel (MCER)': 'C1' }, { title: 'Inglés' });
  await addItem(page, 'certification', 'Agregar certificación', { Certificación: 'Cloud Practitioner', 'Emitida por': 'Proveedor', 'Fecha de emisión': '2023-05', Vence: '2026-05' }, { title: 'Cloud Practitioner' });
  await addItem(page, 'achievement', 'Agregar logro', { Logro: 'Primer lugar en hackatón' }, { title: 'Primer lugar en hackatón' });
  await addItem(page, 'award', 'Agregar reconocimiento', { Reconocimiento: 'Beca de excelencia' }, { title: 'Beca de excelencia' });
  await addItem(page, 'publication', 'Agregar publicación', { Título: 'Series de tiempo en retail' }, { title: 'Series de tiempo en retail' });
  await addItem(page, 'volunteering', 'Agregar voluntariado', { 'Actividad o rol': 'Mentora', Organización: 'Club de programación' }, { title: 'Mentora' });
  await addItem(page, 'link', 'Agregar enlace', { 'Nombre del enlace': 'Caso de estudio', 'Dirección (URL)': 'https://example.test/caso' }, { title: 'Caso de estudio' });

  await page.reload();
  for (const [kind, title] of [
    ['experience', 'Analista de datos'],
    ['education', 'Licenciatura en Actuaría'],
    ['project', 'Tablero de ventas'],
    ['skill', 'Modelado de datos'],
    ['language', 'Inglés'],
    ['certification', 'Cloud Practitioner'],
    ['achievement', 'Primer lugar en hackatón'],
    ['award', 'Beca de excelencia'],
    ['publication', 'Series de tiempo en retail'],
    ['volunteering', 'Mentora'],
    ['link', 'Caso de estudio'],
  ] as const) {
    await expect(row(page, kind, title), kind).toHaveCount(1);
  }
  await expect(row(page, 'experience', 'Analista de datos')).toContainText('SQL');
  const items = (await apiAs(OWNER_A, 'GET', '/api/v1/profile/items')).json?.items as { kind: string; content: Record<string, unknown>; tags: string[] }[];
  // A may already hold items other specs seeded (pages.spec): pick the ones this test created, by their title.
  const byKind = (k: string, title: string) => items.find((i) => i.kind === k && Object.values(i.content).includes(title));
  expect(new Set(items.map((i) => i.kind)).size).toBe(11);
  expect(byKind('experience', 'Analista de datos')).toMatchObject({ content: { role: 'Analista de datos', employmentType: 'contract', startDate: '2021-03', highlights: ['Automaticé reportes', 'Reduje costos 20 %'] }, tags: ['SQL', 'Python'] });
  expect(byKind('project', 'Tablero de ventas')?.content).toMatchObject({ url: 'https://example.test/tablero', links: [{ label: 'Código', url: 'https://example.test/codigo' }, { label: 'Demo', url: 'http://example.test/demo' }] });
  expect(byKind('skill', 'Modelado de datos')?.content).toMatchObject({ level: 'advanced', years: 4 });
  expect(byKind('certification', 'Cloud Practitioner')?.content).toMatchObject({ expiresOn: '2026-05', date: '2023-05' });
  expect(violations).toEqual([]);
});

test('A edits, is refused an invalid URL in place, reorders from the keyboard, deletes with confirmation; failures roll back', async ({ page, context }) => {
  test.setTimeout(90_000);
  for (const role of ['Primero', 'Segundo', 'Tercero']) {
    expect((await apiAs(OWNER_A, 'POST', '/api/v1/profile/items', { kind: 'volunteering', position: 900, content: { role, organization: 'Org' } })).status).toBe(201);
  }
  await signIn(context, OWNER_A);
  await page.goto(url('app', '/perfil'));
  const vol = section(page, 'volunteering').getByTestId('profile-item');
  await expect(vol.filter({ hasText: 'Primero' })).toHaveCount(1);
  const order = async () => (await vol.locator('p:first-child').allTextContents()).map((t) => t.split(' · ')[0]).filter((t) => ['Primero', 'Segundo', 'Tercero'].includes(t ?? ''));
  await expect.poll(order).toEqual(['Primero', 'Segundo', 'Tercero']);

  // Keyboard reorder: focus «Subir «Tercero»» and press Enter until it is first (the 11-kinds test left «Mentora»
  // above it); the focus stays on the moved item, and moves to «Bajar» once «Subir» no longer applies.
  const up = page.getByRole('button', { name: 'Subir «Tercero»' });
  const count = await vol.count();
  await up.focus();
  for (let place = count - 1; place >= 1; place -= 1) {
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('profile-announce')).toHaveText(`«Tercero» quedó en la posición ${place} de ${count}.`);
  }
  expect(await order()).toEqual(['Tercero', 'Primero', 'Segundo']);
  await expect(up).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('button', { name: 'Bajar «Tercero»' })).toBeFocused();
  await page.reload();
  await expect.poll(order, { message: 'the order survives a reload (polled: the list renders after the profile loads)' }).toEqual(['Tercero', 'Primero', 'Segundo']);
  await expect(vol.first()).toContainText('Tercero');

  // A refused reorder rolls back.
  await page.route('**/api/v1/profile/items/reorder', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"database_unavailable"}' }));
  await page.getByRole('button', { name: 'Bajar «Tercero»' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'regresamos al estado anterior' })).toBeVisible();
  expect(await order()).toEqual(['Tercero', 'Primero', 'Segundo']);
  await page.unroute('**/api/v1/profile/items/reorder');

  // Edit: the form opens in place with the stored values; saving shows the change at once and persists.
  await page.getByRole('button', { name: 'Editar «Segundo»' }).click();
  const form = page.locator('form[data-testid^="form-volunteering-"]');
  await expect(form.getByLabel('Actividad o rol')).toHaveValue('Segundo');
  await form.getByLabel('Actividad o rol').fill('Segundo editado');
  await form.getByRole('button', { name: 'Guardar cambios' }).click();
  await settled(row(page, 'volunteering', 'Segundo editado'));
  await expect(page.getByRole('button', { name: 'Editar «Segundo editado»' })).toBeFocused();

  // A refused edit (server 400) rolls back the row and reopens the form with what was typed and the error.
  await page.route('**/api/v1/profile/items/*', (r) =>
    r.request().method() === 'PATCH' ? r.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"invalid_body","issues":[{"path":"role","message":"Too big"}]}' }) : r.fallback(),
  );
  await page.getByRole('button', { name: 'Editar «Primero»' }).click();
  await form.getByLabel('Actividad o rol').fill('Nunca guardado');
  await form.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(form.getByLabel('Actividad o rol')).toHaveValue('Nunca guardado');
  await expect(form.getByLabel('Actividad o rol')).toHaveAttribute('aria-invalid', 'true');
  await expect(row(page, 'volunteering', 'Nunca guardado')).toHaveCount(0);
  await page.unroute('**/api/v1/profile/items/*');
  await form.getByRole('button', { name: 'Cancelar' }).click();
  await expect(row(page, 'volunteering', 'Primero')).toHaveCount(1);

  // An invalid URL is refused next to its field and nothing is saved (re-read through the API).
  await page.getByRole('button', { name: 'Editar «Caso de estudio»' }).click();
  const linkForm = page.locator('form[data-testid^="form-link-"]');
  await linkForm.getByLabel('Dirección (URL)').fill('javascript:alert(1)');
  await linkForm.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(linkForm.getByText('Escribe una dirección completa que empiece con https:// o http://.')).toBeVisible();
  await expect(linkForm.getByLabel('Dirección (URL)')).toBeFocused();
  await linkForm.press('Escape');
  const links = (await apiAs(OWNER_A, 'GET', '/api/v1/profile/items')).json?.items.filter((i: { kind: string }) => i.kind === 'link');
  expect(links.map((i: { content: { url: string } }) => i.content.url)).toEqual(['https://example.test/caso']);

  // Delete: «Cancelar» keeps it; «Sí, eliminar» removes it, also after a reload.
  await page.getByRole('button', { name: 'Eliminar «Primero»' }).click();
  const dialog = page.getByRole('dialog', { name: '¿Eliminar este elemento?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
  await expect(row(page, 'volunteering', 'Primero')).toHaveCount(1);
  await page.getByRole('button', { name: 'Eliminar «Primero»' }).click();
  await dialog.getByRole('button', { name: 'Sí, eliminar' }).click();
  await expect(row(page, 'volunteering', 'Primero')).toHaveCount(0);
  await expect(page.getByTestId('profile-announce')).toHaveText('Elemento eliminado.');
  await page.reload();
  await expect(row(page, 'volunteering', 'Primero')).toHaveCount(0);
  await expect(row(page, 'volunteering', 'Tercero')).toHaveCount(1);
});

test('user text renders as text: an XSS fixture in a title and the summary stays inert', async ({ page, context }) => {
  expect((await apiAs(OWNER_A, 'POST', '/api/v1/profile/items', { kind: 'achievement', content: { title: XSS, summary: XSS } })).status).toBe(201);
  await signIn(context, OWNER_A);
  await page.goto(url('app', '/perfil'));
  await expect(row(page, 'achievement', XSS)).toHaveCount(1);
  expect(await section(page, 'achievement').locator('img').count()).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
});

test('B never sees A\'s items, and A\'s ids are 404 for B (A\'s rows unchanged)', async ({ browser }) => {
  const mine = (await apiAs(OWNER_A, 'GET', '/api/v1/profile/items')).json?.items as { id: string; content: Record<string, unknown> }[];
  expect(mine.length).toBeGreaterThanOrEqual(11);
  const target = mine[0]!;
  const b = await browser.newContext();
  await signIn(b, OWNER_B);
  const pb = await b.newPage();
  await pb.goto(url('app', '/perfil'));
  await expect(pb.getByRole('heading', { name: 'Tu perfil todavía está vacío' })).toBeVisible();
  await expect(pb.getByTestId('profile-item')).toHaveCount(0);
  for (const text of ['Analista de datos', 'Tablero de ventas', 'Caso de estudio', 'Tercero']) await expect(pb.getByText(text)).toHaveCount(0);
  expect((await apiAs(OWNER_B, 'GET', `/api/v1/profile/items/${target.id}`)).status).toBe(404);
  expect((await apiAs(OWNER_B, 'PATCH', `/api/v1/profile/items/${target.id}`, { tags: ['robado'] })).status).toBe(404);
  expect((await apiAs(OWNER_B, 'DELETE', `/api/v1/profile/items/${target.id}`)).status).toBe(404);
  expect((await apiAs(OWNER_B, 'POST', '/api/v1/profile/items/reorder', { itemIds: [target.id] })).status).toBe(422);
  const after = (await apiAs(OWNER_A, 'GET', `/api/v1/profile/items/${target.id}`)).json?.item;
  expect(after).toMatchObject({ id: target.id, content: target.content });
  expect(after.tags).not.toContain('robado');
  await b.close();
});
