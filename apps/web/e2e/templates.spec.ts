/**
 * W4-T templates end to end, as the suite's own owner A: every CV template prints on Carta (612×792) and A4 (595×842)
 * with a REAL text layer that holds the name and every entry (a multi-page document: page breaks, nothing clipped),
 * and its own typography actually applied; the other kinds' alternatives print on their paper; the pickers on
 * `/documentos/:id` and in the tailoring workspace store the choice and the preview reflects it; owner B gets 404.
 */
import { expect, test, type Page } from '@playwright/test';
import { readPdf } from './documents-pdf.ts';
import { apiAs, cspViolations, signIn, type Json } from './support/fixtures.ts';
import { suiteOwners, url } from './support/env.ts';

const { OWNER_A, OWNER_B } = suiteOwners('templates');
const NAME = 'Tere Plantilla';
const RUN = Date.now().toString(36);
const ENTRIES = Array.from({ length: 14 }, (_, i) => `Puesto ${String(i + 1).padStart(2, '0')}`);
const CV_TEMPLATES = ['base', 'compacto', 'clasico'] as const;

const ids: Record<string, string> = {};
let itemIds: string[] = [];
let jobId = '';

test.beforeAll(async () => {
  expect((await apiAs(OWNER_A, 'PUT', '/api/v1/profile', { displayName: NAME, headline: 'Analista de datos', summary: 'Perfil de prueba.' })).status).toBe(200);
  itemIds = [];
  for (const [i, role] of ENTRIES.entries()) {
    const res = await apiAs(OWNER_A, 'POST', '/api/v1/profile/items', {
      kind: 'experience',
      content: {
        role,
        organization: `Empresa ${i + 1}`,
        startDate: `20${String(10 + (i % 10)).padStart(2, '0')}-01`,
        summary: 'Responsable de reportes, tableros y limpieza de datos para las áreas de operación y finanzas de la empresa.',
        highlights: ['Automaticé el reporte semanal', 'Reduje el tiempo de cierre mensual', 'Documenté los procesos del equipo', 'Capacité a cuatro personas'],
      },
      tags: ['PostgreSQL'],
    });
    expect(res.status).toBe(201);
    itemIds.push(res.json!.item.id as string);
  }
  const items = itemIds.map((itemId) => ({ itemId }));
  const end = { heading: 'Cierre', body: `Marca final ${RUN}` };
  const artifacts = [
    ...CV_TEMPLATES.map((template) => ({ kind: 'cv', title: `CV ${template} ${RUN}`, template, content: { items, blocks: [end] } })),
    { kind: 'portfolio', title: `Portafolio lista ${RUN}`, template: 'lista', content: { items: items.slice(0, 4), intro: 'Hola.' } },
    { kind: 'presentation', title: `Presentación contraste ${RUN}`, template: 'contraste', content: { items: [], slides: [{ title: 'Quién soy', body: 'Tere', itemIds: [itemIds[0]] }] } },
    { kind: 'cover_letter', title: `Carta formal ${RUN}`, template: 'formal', content: { items: [items[0]], greeting: 'Estimado equipo:', summary: 'Me interesa el puesto.', closing: 'Saludos,' } },
  ];
  // A set holds at most 4 documents: two sets.
  for (const chunk of [artifacts.slice(0, 3), artifacts.slice(3)]) {
    const set = await apiAs(OWNER_A, 'POST', '/api/v1/artifacts/batch', { artifacts: chunk });
    expect(set.status).toBe(201);
    for (const a of set.json!.artifacts as Json[]) ids[`${a.kind}/${a.template}`] = a.id as string;
  }
  expect(Object.keys(ids)).toHaveLength(6);
  const job = await apiAs(OWNER_A, 'POST', '/api/v1/jobs', { title: `Analista ${RUN}`, company: 'Ejemplo SA', sourceText: 'Buscamos analista con PostgreSQL.' });
  expect(job.status).toBe(201);
  jobId = job.json!.job.id as string;
});

/** The print view on Carta, then A4: the size of EVERY page and the PDF text layer of each. */
async function printBoth(page: Page, id: string) {
  await page.goto(url('app', `/documentos/${id}/imprimir`));
  await page.emulateMedia({ media: 'print' });
  const letter = readPdf(await page.pdf({ preferCSSPageSize: true }));
  await page.emulateMedia({ media: 'screen' });
  await page.getByLabel('A4').check();
  await page.emulateMedia({ media: 'print' });
  const a4 = readPdf(await page.pdf({ preferCSSPageSize: true }));
  return { letter, a4 };
}

const flat = (s: string) => s.replace(/\s/g, '');

for (const template of CV_TEMPLATES) {
  test(`cv/${template}: Carta and A4, every page sized, the name and every entry in the text layer, no images`, async ({ page }) => {
    const violations = cspViolations(page);
    await signIn(page.context(), OWNER_A);
    const { letter, a4 } = await printBoth(page, ids[`cv/${template}`]!);
    for (const [pdf, size] of [
      [letter, [612, 792]],
      [a4, [595, 842]],
    ] as const) {
      expect(pdf.pages, 'a multi-page CV (page breaks happen)').toBeGreaterThanOrEqual(2);
      for (const s of pdf.sizes) expect(s.map(Math.round)).toEqual(size);
      expect(pdf.images).toBe(0);
      const text = flat(pdf.text);
      expect(text).toContain(flat(NAME));
      for (const e of ENTRIES) expect(text, `${e} is printed (nothing clipped)`).toContain(flat(e));
      expect(text).toContain(flat(`Marca final ${RUN}`));
      // «fi» as two letters, not a ligature glyph the text layer loses (an ATS searching «finanzas» finds it).
      expect(text).toContain('finanzas');
    }
    // The template's own typography is what printed (its CSS Module loaded and matched).
    const doc = page.locator('[data-template] > article[data-kind="cv"]');
    await expect(page.locator(`[data-template="${template}"]`)).toHaveCount(1);
    const style = await doc.evaluate((el) => ({ size: getComputedStyle(el).fontSize, family: getComputedStyle(el).fontFamily }));
    if (template === 'compacto') expect(style.size).toBe('12.6667px'); // 9.5pt
    else expect(style.size).toBe(template === 'clasico' ? '14.6667px' : '14px'); // 11pt, base 10.5pt
    if (template === 'clasico') expect(style.family).toMatch(/serif|Georgia|Palatino|Times|Iowan/);
    else expect(style.family).not.toMatch(/Palatino|Iowan/);
    expect(violations).toEqual([]);
  });
}

test('portfolio/lista and cover_letter/formal print on Carta and A4 with the name in the text layer', async ({ page }) => {
  await signIn(page.context(), OWNER_A);
  for (const key of ['portfolio/lista', 'cover_letter/formal']) {
    const { letter, a4 } = await printBoth(page, ids[key]!);
    for (const s of letter.sizes) expect(s.map(Math.round), key).toEqual([612, 792]);
    for (const s of a4.sizes) expect(s.map(Math.round), key).toEqual([595, 842]);
    expect(flat(letter.text), key).toContain(flat(NAME));
    expect(flat(a4.text), key).toContain(flat(NAME));
    expect(letter.images + a4.images).toBe(0);
  }
});

test('presentation/contraste: dark slides on screen, white when printed, one 13.333×7.5 in slide per page', async ({ page }) => {
  await signIn(page.context(), OWNER_A);
  await page.goto(url('app', `/documentos/${ids['presentation/contraste']}/vista-previa`));
  const slide = page.locator('[data-template="contraste"] [data-part="slide"]').first();
  await expect(slide).toHaveCSS('background-color', 'rgb(17, 17, 17)');
  await page.goto(url('app', `/documentos/${ids['presentation/contraste']}/imprimir`));
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('[data-template="contraste"] [data-part="slide"]').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  const pdf = readPdf(await page.pdf({ preferCSSPageSize: true }));
  expect(pdf.pages).toBe(2);
  for (const s of pdf.sizes) expect(s.map(Math.round)).toEqual([960, 540]);
  expect(flat(pdf.text)).toContain(flat(`Presentación contraste ${RUN}`));
  expect(flat(pdf.text)).toContain(flat('Quién soy'));
});

test('/documentos/:id: the picker lists the trade-offs, the keyboard moves within it, saving changes the preview', async ({ page }) => {
  const violations = cspViolations(page);
  await signIn(page.context(), OWNER_A);
  const id = ids['cv/base']!;
  await page.goto(url('app', `/documentos/${id}`));
  const group = page.getByRole('group', { name: 'Plantilla' });
  await expect(group.getByRole('radio')).toHaveCount(3);
  const base = group.getByRole('radio', { name: /^Básica/ });
  await expect(base).toBeChecked();
  await expect(group.getByText('Pensado para sistemas ATS: una columna, texto real y encabezados estándar.')).toBeVisible();
  await base.focus();
  await page.keyboard.press('ArrowDown');
  await expect(group.getByRole('radio', { name: /^Compacta/ })).toBeChecked();
  await page.keyboard.press('ArrowDown');
  await expect(group.getByRole('radio', { name: /^Clásica/ })).toBeChecked();
  await page.getByRole('button', { name: 'Guardar cambios' }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Guardado' })).toBeVisible();
  expect((await apiAs(OWNER_A, 'GET', `/api/v1/artifacts/${id}`)).json!.artifact.template).toBe('clasico');
  await page.getByRole('link', { name: 'Ver la vista previa' }).click();
  await expect(page.locator('[data-template="clasico"] article[data-kind="cv"] h1')).toHaveText(NAME);
  // Back to base for the print test's sake (it already ran; order-independent anyway).
  expect((await apiAs(OWNER_A, 'PATCH', `/api/v1/artifacts/${id}`, { template: 'base' })).status).toBe(200);
  // An unknown template is refused by the API, never stored.
  expect((await apiAs(OWNER_A, 'PATCH', `/api/v1/artifacts/${id}`, { template: 'dos-columnas' })).status).toBe(400);
  expect(violations).toEqual([]);
});

test('the tailoring workspace: one picker per chosen kind; the drafts carry each choice', async ({ page }) => {
  const violations = cspViolations(page);
  await signIn(page.context(), OWNER_A);
  await page.goto(url('app', `/empleos/${jobId}/adaptar`));
  await expect(page.getByRole('heading', { level: 1, name: 'Adaptar al empleo' })).toBeVisible();
  for (const legend of ['Plantilla: CV', 'Plantilla: Portafolio', 'Plantilla: Presentación']) await expect(page.getByRole('group', { name: legend })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Plantilla: Carta de presentación' })).toHaveCount(0);
  await page.getByRole('group', { name: 'Plantilla: CV' }).getByRole('radio', { name: /^Clásica/ }).check();
  await page.getByRole('group', { name: 'Plantilla: Presentación' }).getByRole('radio', { name: /^Alto contraste/ }).check();
  await page.getByLabel('Carta de presentación').check();
  await page.getByRole('group', { name: 'Plantilla: Carta de presentación' }).getByRole('radio', { name: /^Formal/ }).check();
  await page.getByRole('button', { name: 'Crear documentos para este empleo' }).click();
  await expect(page.getByTestId('tailor-created')).toContainText('se crearon 4 borradores');
  const list = (await apiAs(OWNER_A, 'GET', `/api/v1/artifacts?job_id=${jobId}`)).json!.artifacts as Json[];
  expect(list.map((a) => `${a.kind}/${a.template}`).sort()).toEqual(['cover_letter/formal', 'cv/clasico', 'portfolio/base', 'presentation/contraste']);
  expect(violations).toEqual([]);
});

test('owner B: 404 on A\'s documents whatever the template', async ({ page }) => {
  await signIn(page.context(), OWNER_B);
  for (const key of ['cv/compacto', 'presentation/contraste']) {
    expect((await page.goto(url('app', `/documentos/${ids[key]}/vista-previa`)))?.status()).toBe(404);
    expect((await apiAs(OWNER_B, 'PATCH', `/api/v1/artifacts/${ids[key]}`, { template: 'base' })).status).toBe(404);
  }
});
