/**
 * W7 (B3): the luxury-retail beta journey with a SYNTHETIC persona (a fictional client advisor, a fictional employer
 * and a fictional house; nothing real): the profile with the «Ideas para ventas de lujo y retail» guide → a posting
 * captured from a synthetic SuccessFactors-style job page (microdata, Java-style date) → a tailored CV in Spanish and
 * its English version, both «Clásica» → private previews in each language → the «Búsqueda confidencial» reminder
 * before sharing (nothing is published). Owner B sees none of it; no CSP violation anywhere.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { apiAs, cspViolations, signIn, type Json } from './support/fixtures.ts';
import { suiteOwners, url } from './support/env.ts';

const { OWNER_B } = suiteOwners('luxury');
/** The persona: invented, never a real person. */
const VALERIA = { sub: 'janua|e2e-luxury-persona', name: 'Valeria Ficticia Robles', email: 'valeria@example.test' };
const FIX = join(import.meta.dirname, '..', 'test', 'fixtures', 'ingest', 'luxury');
const POSTING_URL = 'https://empleos.maison-ejemplo.example/job/Ciudad-de-Mexico-Client-Advisor-Boutique-Polanco/1100000001/';
const JOB_TITLE = 'Client Advisor - Boutique Polanco';
const SHOTS = process.env.CV_E2E_SHOTS;
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `luxury-${name}.png`), fullPage: true });
}

test.describe.serial('luxury retail beta journey (synthetic persona)', () => {
  let jobId = '';
  let experienceId = '';
  const docs: Record<'es' | 'en', string> = { es: '', en: '' };

  test('profile: the retail guide in the experience form, a suggested keyword in one click, the rest seeded', async ({ page, context }) => {
    const violations = cspViolations(page);
    await signIn(context, VALERIA);
    await page.goto(url('app', '/perfil'));
    await page.getByTestId('section-experience').getByRole('button', { name: 'Agregar experiencia', exact: true }).click();
    const form = page.getByTestId('form-experience-nuevo');
    const guide = form.getByTestId('sector-guide');
    await expect(guide).not.toHaveAttribute('open', '');
    await guide.getByText('Ideas para ventas de lujo y retail').click();
    await expect(guide.getByText('cumplimiento de meta (%), ticket promedio, unidades por transacción (UPT)', { exact: false })).toBeVisible();
    await expect(guide.getByText('las cifras son ilustrativas', { exact: false })).toBeVisible();
    await guide.getByRole('button', { name: 'Sugerencia: agregar «Clienteling»' }).click();
    await guide.getByRole('button', { name: 'Sugerencia: agregar «Eventos VIC»' }).click();
    await expect(guide.getByRole('button', { name: 'Sugerencia: agregar «Clienteling»' })).toBeDisabled();
    const chips = form.getByRole('list', { name: 'Palabras clave agregadas' });
    await expect(chips).toContainText('Clienteling');
    await expect(chips).toContainText('Eventos VIC');
    await shot(page, '1-profile-guide');

    await form.getByLabel('Puesto', { exact: false }).first().fill('Client Advisor');
    await form.getByLabel('Empresa u organización', { exact: false }).fill('Boutique de alta joyería (Monterrey)');
    await form.getByLabel('Inicio').fill('2021-02');
    await form.getByLabel('Es mi trabajo actual').check();
    await form.getByLabel('Logros y responsabilidades').fill('Cumplí el 112 % de mi meta anual de ventas en 2025.\nDesarrollé una cartera de 150 clientes activos mediante clienteling y CRM.\nOrganicé eventos privados para clientes VIC.');
    await form.getByLabel('Palabras clave', { exact: true }).fill('CRM, Visual merchandising');
    await form.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByTestId('section-experience').getByTestId('profile-item')).toHaveCount(1);

    const seeded = await apiAs(VALERIA, 'POST', '/api/v1/profile/items/batch', {
      profile: { headline: 'Client Advisor · alta joyería y relojería', summary: 'Asesora de ventas de lujo con cinco años en boutique, cartera propia y servicio bilingüe.' },
      items: [
        { kind: 'language', content: { name: 'Inglés', level: 'C1' }, tags: ['Inglés', 'Bilingüe'] },
        { kind: 'skill', content: { name: 'Visual merchandising', level: 'advanced' }, tags: ['Visual merchandising'] },
        { kind: 'certification', content: { name: 'Curso de diamantes y gemas de color', issuer: 'Escuela Ejemplo de Gemología', date: '2023' }, tags: ['Gemología'] },
        { kind: 'achievement', content: { title: 'Primer lugar regional en ventas, segundo trimestre de 2025' }, tags: ['Ventas', 'Metas'] },
      ],
    });
    expect(seeded.status).toBe(201);
    const items = (await apiAs(VALERIA, 'GET', '/api/v1/profile')).json!.items as Json[];
    const exp = items.find((i) => i.kind === 'experience')!;
    experienceId = exp.id as string;
    expect(exp.tags).toEqual(['Clienteling', 'Eventos VIC', 'CRM', 'Visual merchandising']);
    expect(violations).toEqual([]);
  });

  test('job: the «Capturar vacante» bookmark on a synthetic luxury-house posting (SuccessFactors-style microdata)', async ({ page, context }) => {
    const violations = cspViolations(page);
    await signIn(context, VALERIA);
    await page.goto(url('app', '/empleos/nuevo'));
    const href = (await page.getByTestId('bookmarklet').getAttribute('href'))!;
    const board = await context.newPage();
    await board.route('https://empleos.maison-ejemplo.example/**', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: readFileSync(join(FIX, 'successfactors-microdata.html'), 'utf8') }));
    await board.goto(POSTING_URL);
    const opened = context.waitForEvent('page');
    await board.addScriptTag({ content: decodeURIComponent(href.slice('javascript:'.length)) });
    const tab = await opened;
    const tabViolations = cspViolations(tab);
    await tab.waitForLoadState();
    const preview = tab.getByTestId('intake-preview');
    await expect(preview.getByLabel('Puesto')).toHaveValue(JOB_TITLE);
    await expect(preview.getByTestId('from-title')).toHaveText('de los microdatos de la página');
    await expect(preview.getByLabel('Empresa')).toHaveValue('Maison Ejemplo');
    await expect(preview.getByLabel('Estado')).toHaveValue('MX-CMX');
    await shot(tab, '2-job-captured');
    await preview.getByRole('button', { name: 'Guardar vacante' }).click();
    await tab.waitForURL(/\/empleos\/[0-9a-f-]{36}$/);
    jobId = tab.url().split('/').pop()!;
    const job = (await apiAs(VALERIA, 'GET', `/api/v1/jobs/${jobId}`)).json!.job as Json;
    expect([job.sourceKind, job.company, job.stateCode, job.datePosted]).toEqual(['capture', 'Maison Ejemplo', 'MX-CMX', '2026-10-14']);
    expect((await apiAs(OWNER_B, 'GET', `/api/v1/jobs/${jobId}`)).status).toBe(404);
    expect([...violations, ...tabViolations]).toEqual([]);
  });

  test('tailoring: a «Clásica» CV in Spanish, then its English version; both previews private and in their language', async ({ page, context }) => {
    const violations = cspViolations(page);
    await signIn(context, VALERIA);
    await page.goto(url('app', `/empleos/${jobId}/adaptar`));
    const selected = page.getByTestId('tailor-selected').getByTestId('tailor-entry');
    await expect(selected.filter({ hasText: 'Client Advisor · Boutique de alta joyería (Monterrey)' })).toHaveCount(1);
    for (const kind of ['Portafolio', 'Presentación']) await page.getByLabel(kind, { exact: true }).uncheck();
    const cvTemplates = page.getByRole('group', { name: 'Plantilla: CV' });
    await expect(cvTemplates).toContainText('Una buena opción para postular a casas de lujo');
    await expect(cvTemplates.getByRole('radio', { name: /^Básica/ })).toBeChecked();
    await cvTemplates.getByRole('radio', { name: /^Clásica/ }).check();
    const language = page.getByTestId('tailor-language');
    await expect(language.getByRole('radio', { name: 'Español (México)' })).toBeChecked();
    await expect(language).toContainText('Aún no hay documentos para este empleo.');
    await expect(page.getByTestId('tailor-will-create').getByRole('listitem')).toHaveText([`CV · ${JOB_TITLE} · Maison Ejemplo`]);
    await page.getByRole('button', { name: 'Crear documentos para este empleo' }).click();
    await expect(page.getByTestId('tailor-created')).toContainText('se crearon 1 borradores');
    await expect(language).toContainText('Español (México): CV');

    await page.getByRole('button', { name: 'Preparar también la versión en inglés' }).click();
    await expect(language.getByRole('radio', { name: 'Inglés' })).toBeChecked();
    await expect(language.getByRole('radio', { name: 'Inglés' })).toBeFocused();
    await expect(language.getByRole('status')).toContainText('Elegiste inglés');
    const exp = selected.filter({ hasText: 'Client Advisor · Boutique de alta joyería (Monterrey)' });
    await exp.getByText('Ajustar el texto para este empleo').click();
    await exp.getByLabel('Puntos clave para este empleo (uno por línea)').fill('Reached 112% of my annual sales target in 2025.\nBuilt a book of 150 active clients through clienteling and CRM.');
    await expect(page.getByTestId('tailor-will-create').getByRole('listitem')).toHaveText([`CV · ${JOB_TITLE} · Maison Ejemplo (English)`]);
    await shot(page, '3-tailor-english');
    await page.getByRole('button', { name: 'Crear documentos para este empleo' }).click();
    await expect(page.getByTestId('tailor-created')).toBeVisible();
    await expect(language).toContainText('Inglés: CV');

    const list = (await apiAs(VALERIA, 'GET', `/api/v1/artifacts?job_id=${jobId}`)).json!.artifacts as Json[];
    expect(list.map((a) => [a.kind, a.locale, a.template, a.visibility]).sort()).toEqual([
      ['cv', 'en', 'clasico', 'private'],
      ['cv', 'es-MX', 'clasico', 'private'],
    ]);
    docs.es = list.find((a) => a.locale === 'es-MX')!.id as string;
    docs.en = list.find((a) => a.locale === 'en')!.id as string;
    const en = list.find((a) => a.locale === 'en')!;
    expect(en.content.items.find((i: Json) => i.itemId === experienceId).override.highlights).toEqual(['Reached 112% of my annual sales target in 2025.', 'Built a book of 150 active clients through clienteling and CRM.']);

    await page.goto(url('app', `/documentos/${docs.es}/vista-previa`));
    const esDoc = page.locator('article[data-kind="cv"]');
    await expect(esDoc).toHaveAttribute('lang', 'es-MX');
    await expect(esDoc.getByRole('heading', { name: 'Experiencia' })).toBeVisible();
    await expect(esDoc).toContainText('Cumplí el 112 % de mi meta anual de ventas en 2025.');
    await shot(page, '4-preview-es');
    await page.goto(url('app', `/documentos/${docs.en}/vista-previa`));
    const enDoc = page.locator('article[data-kind="cv"]');
    await expect(enDoc).toHaveAttribute('lang', 'en');
    await expect(enDoc.getByRole('heading', { name: 'Experience' })).toBeVisible();
    await expect(enDoc).toContainText('Reached 112% of my annual sales target in 2025.');
    await expect(enDoc).not.toContainText('Cumplí el 112 %');
    await shot(page, '5-preview-en');

    for (const id of [docs.es, docs.en]) {
      expect((await apiAs(OWNER_B, 'GET', `/api/v1/artifacts/${id}`)).status).toBe(404);
    }
    expect(violations).toEqual([]);
  });

  test('sharing: «Búsqueda confidencial» before a link or a public page, quoting the title; nothing is published', async ({ page, context }) => {
    const violations = cspViolations(page);
    await signIn(context, VALERIA);
    await page.goto(url('app', `/documentos/${docs.es}`));
    await expect(page.getByTestId('discretion-reminder')).toHaveCount(0);
    await page.getByLabel('Con enlace').check();
    const reminder = page.getByTestId('discretion-reminder');
    await expect(reminder).toContainText('Búsqueda confidencial');
    await expect(reminder).toContainText('Cualquier persona con el enlace podrá ver este documento');
    await expect(reminder).toContainText(`El título «CV · ${JOB_TITLE} · Maison Ejemplo» aparece en la pestaña del navegador`);
    await shot(page, '6-discretion-link');
    await page.getByLabel('Público').check();
    await expect(reminder).toContainText('los buscadores podrán encontrarla si marcas la casilla de indexación');
    await expect(page.getByLabel('Permitir que buscadores indexen esta página', { exact: false })).not.toBeChecked();
    await page.getByLabel('Privado').check();
    await expect(page.getByTestId('discretion-reminder')).toHaveCount(0);

    await page.goto(url('app', `/en/documentos/${docs.en}`));
    await page.getByRole('radio', { name: 'Link', exact: true }).check();
    await expect(page.getByTestId('discretion-reminder')).toContainText('Confidential job search');
    await expect(page.getByTestId('discretion-reminder')).toContainText('(English)” shows in the browser tab');

    const after = (await apiAs(VALERIA, 'GET', `/api/v1/artifacts?job_id=${jobId}`)).json!.artifacts as Json[];
    expect(after.every((a) => a.visibility === 'private' && a.shareToken === null && a.slug === null)).toBe(true);
    expect(violations).toEqual([]);
  });
});
