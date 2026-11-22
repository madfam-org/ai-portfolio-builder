/**
 * The documents surface (W3-4) as owner A: the list and its filters, the detail page, the preview and the print view
 * of every kind (print media, a real PDF text layer on Carta and A4, one slide per page), keyboard slides, and owner
 * B getting the 404 for A's documents. Publishing and the pages host: e2e/pages-publish.spec.ts.
 */
import { expect, test, type Page } from '@playwright/test';
import { readPdf } from './documents-pdf.ts';
import { apiAs, cspViolations, signIn } from './support/fixtures.ts';
import { suiteOwners, url } from './support/env.ts';

const { OWNER_A, OWNER_B } = suiteOwners('documents');

const RUN = Date.now().toString(36);
const ids: Record<'cv' | 'portfolio' | 'presentation' | 'cover_letter', string> = { cv: '', portfolio: '', presentation: '', cover_letter: '' };
let jobId = '';

test.beforeAll(async () => {
  const contact = { email: 'ana@example.test', phone: '+52 777 123 4567', location: 'Cuernavaca, Morelos', links: [{ label: 'GitHub', url: 'https://github.example.test/ana' }] };
  expect((await apiAs(OWNER_A, 'PUT', '/api/v1/profile', { displayName: 'Ana Prueba', headline: 'Ingeniera de datos', summary: 'Diez años con datos.', contact })).status).toBe(200);
  const item = async (kind: string, content: unknown) => {
    const res = await apiAs(OWNER_A, 'POST', '/api/v1/profile/items', { kind, content });
    expect(res.status).toBe(201);
    return res.json?.item.id as string;
  };
  const exp = await item('experience', { role: 'Backend', organization: 'Acme', startDate: '2022-01', current: true, highlights: ['Original'] });
  const edu = await item('education', { institution: 'UNAM', degree: 'Ingeniería' });
  const skill = await item('skill', { name: 'Python', level: 'advanced' });
  const job = await apiAs(OWNER_A, 'POST', '/api/v1/jobs', { title: `Datos ${RUN}`, company: 'Acme', sourceText: 'Buscamos Python.' });
  expect(job.status).toBe(201);
  jobId = job.json?.job.id as string;
  const items = [{ itemId: exp, override: { title: 'Líder de backend', highlights: ['Logro adaptado'] } }, { itemId: edu }, { itemId: skill }];
  const set = await apiAs(OWNER_A, 'POST', '/api/v1/artifacts/batch', {
    jobId,
    artifacts: [
      { kind: 'cv', title: `CV ${RUN}`, content: { items, blocks: [{ heading: 'Por qué Acme', body: 'Me gusta Acme.' }], showContact: true } },
      { kind: 'portfolio', title: `Portafolio ${RUN}`, content: { items, intro: 'Hola, soy Ana.' } },
      { kind: 'presentation', title: `Presentación ${RUN}`, content: { items, slides: [{ title: 'Quién soy', body: 'Ana', itemIds: [] }, { title: 'Experiencia clave', itemIds: [exp] }, { title: 'Herramientas', itemIds: [skill] }] } },
      { kind: 'cover_letter', title: `Carta ${RUN}`, content: { items: [{ itemId: exp }], greeting: 'Estimado equipo de Acme:', summary: 'Me interesa el puesto.', closing: 'Saludos,' } },
    ],
  });
  expect(set.status).toBe(201);
  for (const a of set.json?.artifacts as { id: string; kind: keyof typeof ids }[]) ids[a.kind] = a.id;
});

async function signedIn(page: Page) {
  await signIn(page.context(), OWNER_A);
}

test('the list: every kind for the job, filters by job, kind and status, links to preview and print', async ({ page }) => {
  const violations = cspViolations(page);
  await signedIn(page);
  await page.goto(url('app', '/documentos'));
  const list = page.getByTestId('artifact-list');
  await page.getByLabel('Filtrar por empleo').selectOption(jobId);
  await expect(list.locator('[data-artifact-id]')).toHaveCount(4);
  await page.getByLabel('Filtrar por tipo').selectOption('presentation');
  await expect(list.locator('[data-artifact-id]')).toHaveCount(1);
  await expect(list).toContainText(`Presentación ${RUN}`);
  await page.getByLabel('Filtrar por estado').selectOption('published');
  await expect(page.getByText('Ningún documento coincide con estos filtros.')).toBeVisible();
  await page.getByRole('button', { name: 'Quitar filtros' }).click();
  const row = list.locator(`[data-artifact-id="${ids.cv}"]`);
  await expect(row).toContainText('Borrador');
  await expect(row).toContainText('Privado');
  await expect(row).toContainText(`Datos ${RUN}`);
  await expect(row.getByRole('link', { name: 'Vista previa' })).toHaveAttribute('href', `/documentos/${ids.cv}/vista-previa`);
  await expect(row.getByRole('link', { name: 'Imprimir o guardar PDF' })).toHaveAttribute('href', `/documentos/${ids.cv}/imprimir`);
  expect(violations).toEqual([]);
});

test('the detail page: title and status saved; the content summary; preview and print links', async ({ page }) => {
  await signedIn(page);
  await page.goto(url('app', `/documentos/${ids.cover_letter}`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Carta ${RUN}`);
  await expect(page.getByText('1 elemento de tu perfil y 0 bloques de texto.')).toBeVisible();
  await page.getByLabel('Título', { exact: true }).fill(`Carta final ${RUN}`);
  await page.getByLabel('Estado').selectOption('ready');
  await page.getByRole('button', { name: 'Guardar cambios' }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Guardado' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Carta final ${RUN}`);
  await expect(page.getByLabel('Estado')).toHaveValue('ready');
});

test('editing the content in place: remove, add, adjust the text, an emptied closing gets its default; blocks kept; the profile untouched', async ({ page }) => {
  const violations = cspViolations(page);
  type Item = { id: string; kind: string; content: Record<string, unknown> };
  const mine = (await apiAs(OWNER_A, 'GET', '/api/v1/profile/items')).json!.items as Item[];
  const pick = (kind: string, field: string, value: string) => mine.find((i) => i.kind === kind && i.content[field] === value)!.id;
  const [exp, edu, skill] = [pick('experience', 'role', 'Backend'), pick('education', 'institution', 'UNAM'), pick('skill', 'name', 'Python')];
  const created = await apiAs(OWNER_A, 'POST', '/api/v1/artifacts', {
    jobId,
    kind: 'cover_letter',
    title: `Carta editable ${RUN}`,
    content: { items: [{ itemId: exp }, { itemId: edu }], greeting: 'Hola:', closing: 'Adiós,', blocks: [{ body: 'Bloque propio' }] },
  });
  expect(created.status).toBe(201);
  const id = created.json!.artifact.id as string;
  const profileBefore = mine;

  await signedIn(page);
  await page.goto(url('app', `/documentos/${id}`));
  const editor = page.getByTestId('doc-content-editor');
  await expect(editor.getByRole('heading', { name: 'En este documento (2)' })).toBeVisible();
  await expect(editor.getByTestId('doc-content-state')).toHaveText('Sin cambios pendientes.');
  await expect(editor.getByRole('button', { name: 'Guardar contenido' })).toBeDisabled();
  await editor.getByRole('button', { name: 'Quitar: Ingeniería · UNAM' }).click();
  await editor.getByRole('button', { name: 'Agregar: Python' }).click();
  const entry = editor.getByTestId('tailor-entry').filter({ hasText: 'Backend · Acme' });
  await entry.getByText('Ajustar el texto para este empleo').click();
  await entry.getByLabel('Descripción para este empleo').fill('Solo en esta carta.');
  await editor.getByLabel('Despedida').fill('');
  await expect(editor.getByLabel('Despedida')).toHaveAttribute('placeholder', 'Atentamente,');
  await expect(editor.getByTestId('doc-content-state')).toHaveText('Tienes cambios sin guardar.');
  // Leaving now would ask first (the browser's own dialog); once saved, it would not.
  const asksBeforeLeaving = () =>
    page.evaluate(() => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });
  expect(await asksBeforeLeaving()).toBe(true);
  await editor.getByRole('button', { name: 'Guardar contenido' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Contenido guardado.' })).toBeVisible();
  await expect(editor.getByTestId('doc-content-state')).toHaveText('Sin cambios pendientes.');
  expect(await asksBeforeLeaving()).toBe(false);

  const after = (await apiAs(OWNER_A, 'GET', `/api/v1/artifacts/${id}`)).json!.artifact.content as Record<string, unknown>;
  expect(after.items).toEqual([{ itemId: exp, override: { summary: 'Solo en esta carta.' } }, { itemId: skill }]);
  expect([after.greeting, after.closing]).toEqual(['Hola:', 'Atentamente,']);
  expect(after.blocks).toEqual([{ body: 'Bloque propio' }]);
  expect((await apiAs(OWNER_A, 'GET', '/api/v1/profile/items')).json!.items).toEqual(profileBefore);
  await page.reload();
  await expect(page.getByTestId('doc-content-editor').getByRole('heading', { name: 'En este documento (2)' })).toBeVisible();
  expect(violations).toEqual([]);
});

test('a profile item deleted after the document was made: the editor says it will be removed, saves, and the document stays editable', async ({ page }) => {
  const violations = cspViolations(page);
  const throwaway = async (name: string) => {
    const res = await apiAs(OWNER_A, 'POST', '/api/v1/profile/items', { kind: 'skill', content: { name } });
    expect(res.status).toBe(201);
    return res.json?.item.id as string;
  };
  const [gone, later] = [await throwaway(`Borrada ${RUN}`), await throwaway(`Borrada en otra pestaña ${RUN}`)];
  const mine = (await apiAs(OWNER_A, 'GET', '/api/v1/profile/items')).json!.items as { id: string; kind: string; content: Record<string, unknown> }[];
  const skill = mine.find((i) => i.kind === 'skill' && i.content.name === 'Python')!.id;
  const created = await apiAs(OWNER_A, 'POST', '/api/v1/artifacts', {
    jobId,
    kind: 'presentation',
    title: `Presentación con borrada ${RUN}`,
    content: { items: [{ itemId: skill }, { itemId: gone }, { itemId: later }], slides: [{ title: 'Herramientas', itemIds: [gone, skill] }] },
  });
  expect(created.status).toBe(201);
  const id = created.json!.artifact.id as string;
  expect((await apiAs(OWNER_A, 'DELETE', `/api/v1/profile/items/${gone}`)).status).toBe(204);

  await signedIn(page);
  await page.goto(url('app', `/documentos/${id}`));
  const editor = page.getByTestId('doc-content-editor');
  await expect(editor.getByRole('heading', { name: 'En este documento (2)' })).toBeVisible();
  await expect(editor.getByTestId('doc-content-missing')).toHaveText('1 elemento de este documento ya no está en tu perfil; se quitará al guardar.');
  await expect(editor.getByTestId('doc-content-state')).toHaveText('Tienes cambios sin guardar.');
  await editor.getByLabel('Resumen de este documento (opcional)').fill('Resumen nuevo.');
  await editor.getByRole('button', { name: 'Guardar contenido' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Contenido guardado.' })).toBeVisible();
  await expect(editor.getByTestId('doc-content-missing')).toHaveCount(0);
  const saved = (await apiAs(OWNER_A, 'GET', `/api/v1/artifacts/${id}`)).json!.artifact.content as { items: { itemId: string }[]; slides: { itemIds: string[] }[]; summary: string };
  expect(saved.items).toEqual([{ itemId: skill }, { itemId: later }]);
  expect(saved.slides).toEqual([{ title: 'Herramientas', itemIds: [skill] }]);
  expect(saved.summary).toBe('Resumen nuevo.');

  // Deleted in another tab while this page is open: the refusal says what happened and what to do.
  await page.reload();
  await expect(editor.getByTestId('doc-content-state')).toHaveText('Sin cambios pendientes.');
  expect((await apiAs(OWNER_A, 'DELETE', `/api/v1/profile/items/${later}`)).status).toBe(204);
  await editor.getByLabel('Resumen de este documento (opcional)').fill('Otro resumen.');
  await editor.getByRole('button', { name: 'Guardar contenido' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Algunos elementos de este documento ya no existen en tu perfil' })).toBeVisible();
  await page.reload();
  await expect(editor.getByTestId('doc-content-missing')).toHaveText('1 elemento de este documento ya no está en tu perfil; se quitará al guardar.');
  expect(violations).toEqual([]);
});

const EXPECTED: Record<keyof typeof ids, string[]> = {
  cv: ['Ana Prueba', 'Perfil profesional', 'Experiencia', 'Líder de backend', 'Educación', 'Ingeniería', 'Habilidades', 'Por qué Acme'],
  portfolio: ['Ana Prueba', 'Experiencia', 'Líder de backend', 'Educación', 'Ingeniería', 'Habilidades'],
  presentation: ['Ana Prueba', 'Quién soy', 'Experiencia clave', 'Líder de backend', 'Herramientas'],
  cover_letter: ['Ana Prueba', 'Experiencia relevante', 'Backend'],
};

for (const kind of Object.keys(EXPECTED) as (keyof typeof ids)[]) {
  test(`preview and print: ${kind}`, async ({ page }) => {
    const violations = cspViolations(page);
    await signedIn(page);
    const res = await page.goto(url('app', `/documentos/${ids[kind]}/vista-previa`));
    expect(res?.status()).toBe(200);
    expect(res?.headers()['x-robots-tag']).toBe('noindex, nofollow');
    const doc = page.locator(`article[data-kind="${kind}"]`);
    await expect(doc.locator('h1, h2, h3')).toHaveText(EXPECTED[kind]);
    if (kind === 'cv') {
      await expect(doc).toContainText('Logro adaptado');
      await expect(doc).not.toContainText('Original');
      await expect(doc.getByRole('link', { name: 'ana@example.test' })).toHaveAttribute('href', 'mailto:ana@example.test');
    }
    for (const rel of await doc.locator('a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('rel')))) expect(rel).toBe('ugc nofollow noopener noreferrer');

    await page.goto(url('app', `/documentos/${ids[kind]}/imprimir`));
    await expect(page.getByText(/Guardar como PDF/).first()).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('header.topbar')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Imprimir o guardar como PDF' })).toBeHidden();
    await expect(page.locator(`article[data-kind="${kind}"] h1`)).toBeVisible();
    const pdf = readPdf(await page.pdf({ preferCSSPageSize: true }));
    expect(pdf.images).toBe(0);
    expect(pdf.text.replace(/\s/g, '')).toContain(EXPECTED[kind][0]!.replace(/\s/g, ''));
    if (kind === 'presentation') {
      expect(pdf.pages).toBe(4);
      for (const [w, h] of pdf.sizes) expect([Math.round(w), Math.round(h)]).toEqual([960, 540]);
    } else {
      expect(pdf.sizes[0]!.map(Math.round)).toEqual([612, 792]);
      await page.emulateMedia({ media: 'screen' });
      await page.getByLabel('A4').check();
      await page.emulateMedia({ media: 'print' });
      const a4 = readPdf(await page.pdf({ preferCSSPageSize: true }));
      expect(a4.sizes[0]!.map(Math.round)).toEqual([595, 842]);
    }
    expect(violations).toEqual([]);
  });
}

test('presentation: the keyboard moves one slide at a time', async ({ page }) => {
  await signedIn(page);
  await page.goto(url('app', `/documentos/${ids.presentation}/vista-previa`));
  const position = page.getByTestId('slide-position');
  await expect(position).toHaveText('Diapositiva 1 de 4');
  await expect(page.locator('[data-slide-index="1"]')).toBeHidden();
  await page.keyboard.press('ArrowRight');
  await expect(position).toHaveText('Diapositiva 2 de 4');
  await expect(page.locator('[data-slide-index="1"]')).toBeVisible();
  await expect(page.locator('[data-slide-index="0"]')).toBeHidden();
  await page.keyboard.press('End');
  await expect(position).toHaveText('Diapositiva 4 de 4');
  await page.keyboard.press('Home');
  await expect(position).toHaveText('Diapositiva 1 de 4');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(position).toHaveText('Diapositiva 2 de 4');
});

test('owner B: A\'s documents are the 404, in every view and through the API', async ({ page }) => {
  await signIn(page.context(), OWNER_B);
  for (const path of [`/documentos/${ids.cv}`, `/documentos/${ids.cv}/vista-previa`, `/documentos/${ids.cv}/imprimir`]) {
    const res = await page.goto(url('app', path));
    expect(res?.status(), path).toBe(404);
    await expect(page.getByText('Ana Prueba')).toHaveCount(0);
  }
  expect((await apiAs(OWNER_B, 'GET', `/api/v1/artifacts/${ids.cv}`)).status).toBe(404);
  await page.goto(url('app', '/documentos'));
  await expect(page.getByText(`CV ${RUN}`)).toHaveCount(0);
});

test('english: the same pages under /en', async ({ page }) => {
  await signedIn(page);
  await page.goto(url('app', `/en/documentos/${ids.cv}/imprimir`));
  await expect(page.getByRole('heading', { name: 'Print or save as PDF' })).toBeVisible();
  await expect(page.getByLabel('Letter (Mexico and US)')).toBeChecked();
});
