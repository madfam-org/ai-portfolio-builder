/**
 * A cover letter's own body (2026-11-21): written in the tailoring workspace, printed between the greeting and the
 * closing in the preview and in the PDF's text layer (only the letter stores it), edited in the document editor under
 * the unsaved-changes guard, and emptied again, which brings the summary back as the letter's opening. A long body
 * keeps the print view's «Aprox. N páginas» equal to the PDF on Carta and A4 in both letter templates. Owner B gets
 * the 404. Synthetic persona and company only.
 */
import { expect, test, type Page } from '@playwright/test';
import { readPdf } from './documents-pdf.ts';
import { apiAs, cspViolations, signIn, type Json } from './support/fixtures.ts';
import { suiteOwners, url } from './support/env.ts';

const { OWNER_A, OWNER_B } = suiteOwners('letter-body');

const RUN = Date.now().toString(36);
const PROFILE_SUMMARY = 'Resumen del perfil de Lucía, para todos sus documentos.';
const FIRST = 'Me interesa la vacante de asesora en Joyería Ejemplo porque conozco a su clientela.';
const SECOND = 'En mi puesto actual llevo una cartera propia y atiendo en español e inglés.';
const squash = (s: string) => s.replace(/\s/g, '');

test.describe.serial('a cover letter body of its own', () => {
  let jobId = '';
  let letterId = '';
  let expId = '';

  test.beforeAll(async () => {
    expect((await apiAs(OWNER_A, 'PUT', '/api/v1/profile', { displayName: 'Lucía Prueba', headline: 'Asesora de ventas', summary: PROFILE_SUMMARY })).status).toBe(200);
    const item = await apiAs(OWNER_A, 'POST', '/api/v1/profile/items', { kind: 'experience', content: { role: 'Asesora de ventas', organization: 'Boutique Ficticia', startDate: '2021-02', current: true }, tags: [] });
    expect(item.status).toBe(201);
    expId = item.json!.item.id as string;
    const job = await apiAs(OWNER_A, 'POST', '/api/v1/jobs', { title: `Asesora ${RUN}`, company: 'Joyería Ejemplo', sourceText: 'Buscamos asesora de ventas con cartera de clientes.' });
    expect(job.status).toBe(201);
    jobId = job.json!.job.id as string;
  });

  async function printedText(page: Page, id: string) {
    await page.emulateMedia({ media: 'screen' });
    await page.goto(url('app', `/documentos/${id}/imprimir`));
    await expect(page.getByTestId('print-pages')).toBeVisible();
    const estimate = Number(await page.getByTestId('print-pages').getAttribute('data-pages'));
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const pdf = readPdf(await page.pdf({ preferCSSPageSize: true }));
    await page.emulateMedia({ media: 'screen' });
    expect(pdf.images).toBe(0);
    return { estimate, pdf };
  }

  test('tailoring: the body is written beside the greeting and closing, printed between them, and stored by the letter only', async ({ page, context }) => {
    const violations = cspViolations(page);
    await signIn(context, OWNER_A);
    await page.goto(url('app', `/empleos/${jobId}/adaptar`));
    await expect(page.getByTestId('tailor-selected').getByTestId('tailor-entry')).toHaveCount(1);
    await expect(page.getByLabel('Cuerpo de la carta')).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Carta de presentación' }).check();
    const letter = page.getByTestId('tailor-letter');
    const body = letter.getByLabel('Cuerpo de la carta');
    // In the letter's reading order, with the summary it would otherwise print shown in grey.
    expect(await letter.locator('input, textarea').evaluateAll((els) => els.map((e) => e.id))).toEqual(['tailor-greeting', 'tailor-body', 'tailor-closing']);
    await expect(body).toHaveAttribute('placeholder', PROFILE_SUMMARY);
    await expect(letter).toContainText('Lo que dejes vacío usa el texto que ves en gris.');
    await expect(letter).toContainText('Separa los párrafos con una línea en blanco (máximo 5000 caracteres).');
    await body.fill(`${FIRST}\n\n${SECOND}`);
    await page.getByRole('button', { name: 'Crear documentos para este empleo' }).click();
    await expect(page.getByTestId('tailor-created')).toContainText('se crearon 4 borradores');

    const list = (await apiAs(OWNER_A, 'GET', `/api/v1/artifacts?job_id=${jobId}`)).json!.artifacts as Json[];
    expect(list.map((a) => a.kind).sort()).toEqual(['cover_letter', 'cv', 'portfolio', 'presentation']);
    for (const a of list) {
      if (a.kind === 'cover_letter') expect(a.content.body).toBe(`${FIRST}\n\n${SECOND}`);
      else expect('body' in a.content, `${a.kind as string}: no body`).toBe(false);
    }
    letterId = list.find((a) => a.kind === 'cover_letter')!.id as string;

    await page.goto(url('app', `/documentos/${letterId}/vista-previa`));
    const doc = page.locator('article[data-kind="cover_letter"]');
    await expect(doc.locator('[data-part="letter-text"] p')).toHaveText([FIRST, SECOND]);
    await expect(doc).not.toContainText(PROFILE_SUMMARY);
    const text = (await doc.textContent()) ?? '';
    const order = ['Estimado equipo de Joyería Ejemplo:', FIRST, SECOND, 'Experiencia relevante', 'Atentamente,'].map((x) => text.indexOf(x));
    expect(order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1]!)), `order ${order}`).toBe(true);

    const { estimate, pdf } = await printedText(page, letterId);
    expect(squash(pdf.text)).toContain(squash(FIRST));
    expect(squash(pdf.text)).toContain(squash(SECOND));
    expect(squash(pdf.text)).not.toContain(squash(PROFILE_SUMMARY));
    expect(estimate, 'Carta estimate = PDF pages').toBe(pdf.pages);
    expect(violations).toEqual([]);
  });

  test('the document editor: the body is edited under the unsaved-changes guard; emptied, the letter opens with the summary again', async ({ page, context }) => {
    const violations = cspViolations(page);
    await signIn(context, OWNER_A);
    await page.goto(url('app', `/documentos/${letterId}`));
    const editor = page.getByTestId('doc-content-editor');
    const body = editor.getByTestId('doc-letter').getByLabel('Cuerpo de la carta');
    await expect(body).toHaveValue(`${FIRST}\n\n${SECOND}`);
    // The summary says plainly that this letter does not print it while the body is written, and when it does again.
    await expect(editor).toContainText('Esta carta no lo imprime: tiene su propio cuerpo.');
    await expect(editor.getByTestId('doc-content-state')).toHaveText('Sin cambios pendientes.');
    const edited = 'Un solo párrafo, escrito de nuevo para esta carta.';
    await body.fill(edited);
    await expect(editor.getByTestId('doc-content-state')).toHaveText('Tienes cambios sin guardar.');
    const asksBeforeLeaving = () =>
      page.evaluate(() => {
        const e = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(e);
        return e.defaultPrevented;
      });
    // The guard's listener is (un)registered in an effect after the render that shows the state: poll, never probe once.
    await expect.poll(asksBeforeLeaving).toBe(true);
    await editor.getByRole('button', { name: 'Guardar contenido' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Contenido guardado.' })).toBeVisible();
    await expect(editor.getByTestId('doc-content-state')).toHaveText('Sin cambios pendientes.');
    await expect.poll(asksBeforeLeaving).toBe(false);
    expect((await apiAs(OWNER_A, 'GET', `/api/v1/artifacts/${letterId}`)).json!.artifact.content.body).toBe(edited);
    await page.goto(url('app', `/documentos/${letterId}/vista-previa`));
    await expect(page.locator('[data-part="letter-text"] p')).toHaveText([edited]);

    await page.goto(url('app', `/documentos/${letterId}`));
    await editor.getByTestId('doc-letter').getByLabel('Cuerpo de la carta').fill('');
    await expect(editor).toContainText('Abre esta carta mientras su cuerpo esté vacío.');
    await editor.getByRole('button', { name: 'Guardar contenido' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Contenido guardado.' })).toBeVisible();
    const content = (await apiAs(OWNER_A, 'GET', `/api/v1/artifacts/${letterId}`)).json!.artifact.content as Json;
    expect('body' in content).toBe(false);
    expect(content.items).toEqual([{ itemId: expId }]);
    await page.goto(url('app', `/documentos/${letterId}/vista-previa`));
    const doc = page.locator('article[data-kind="cover_letter"]');
    await expect(doc).toContainText(PROFILE_SUMMARY);
    await expect(doc.locator('[data-part="letter-text"]')).toHaveCount(0);
    expect(violations).toEqual([]);
  });

  test('a long body: the print estimate equals the PDF on Carta and A4, in both letter templates', async ({ page, context }) => {
    const paragraph = (n: number) => `Párrafo ${n}. ${'Atiendo a cada cliente con calma, conozco el inventario y doy seguimiento después de cada visita. '.repeat(4).trim()}`;
    const long = Array.from({ length: 11 }, (_, i) => paragraph(i + 1)).join('\n\n');
    expect(long.length).toBeLessThanOrEqual(5000);
    await signIn(context, OWNER_A);
    for (const template of ['base', 'formal']) {
      const created = await apiAs(OWNER_A, 'POST', '/api/v1/artifacts', {
        jobId,
        kind: 'cover_letter',
        template,
        title: `Carta larga ${template} ${RUN}`,
        content: { items: [{ itemId: expId }], greeting: 'Hola:', body: long, closing: 'Saludos,' },
      });
      expect(created.status).toBe(201);
      const id = created.json!.artifact.id as string;
      const letter = await printedText(page, id);
      expect(squash(letter.pdf.text)).toContain(squash(paragraph(11)));
      expect(letter.pdf.pages, `${template}: a long body spills onto a second page`).toBeGreaterThanOrEqual(2);
      expect(letter.estimate, `${template}: Carta estimate = PDF pages`).toBe(letter.pdf.pages);
      await page.getByLabel('A4').check();
      await expect(page.getByTestId('print-pages')).toContainText('A4');
      const a4Estimate = Number(await page.getByTestId('print-pages').getAttribute('data-pages'));
      await page.emulateMedia({ media: 'print' });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const a4 = readPdf(await page.pdf({ preferCSSPageSize: true }));
      await page.emulateMedia({ media: 'screen' });
      test.info().annotations.push({ type: 'pages', description: `${template}: letter ${letter.estimate}/${letter.pdf.pages}; a4 ${a4Estimate}/${a4.pages}` });
      expect(a4Estimate, `${template}: A4 estimate = PDF pages`).toBe(a4.pages);
    }
  });

  test('owner B: A\'s letter and its body are the 404', async ({ page, context }) => {
    expect((await apiAs(OWNER_B, 'GET', `/api/v1/artifacts/${letterId}`)).status).toBe(404);
    expect((await apiAs(OWNER_B, 'PATCH', `/api/v1/artifacts/${letterId}`, { content: { items: [], body: 'Ajeno' } })).status).toBe(404);
    await signIn(context, OWNER_B);
    const res = await page.goto(url('app', `/documentos/${letterId}/vista-previa`));
    expect(res?.status()).toBe(404);
  });
});
