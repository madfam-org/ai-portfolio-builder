/**
 * W3-3, the core loop end to end: owner A pastes a job, moves it through the pipeline from the keyboard, reads the
 * AI-free match explained, tailors (deselect, add, reorder, override) and creates CV + portafolio + presentación in
 * ONE batch; the profile is re-read and is unchanged. Owner B sees none of it, in the UI and through the API.
 */
import { expect, test } from '@playwright/test';
import { apiAs, cspViolations, signIn, type Json } from './support/fixtures.ts';
import { suiteOwners, url } from './support/env.ts';

const { OWNER_A, OWNER_B } = suiteOwners('jobs');

const POSTING = 'Buscamos desarrolladora backend con experiencia en PostgreSQL y TypeScript. Deseable: Kubernetes. Trabajo remoto desde México.';
const SOURCE = 'https://empleos.example.test/vacante/42';

test.describe.serial('jobs, pipeline and tailoring', () => {
  const title = `Desarrolladora backend ${Date.now()}`;
  let jobId = '';
  const ids: Record<'exp' | 'k8s' | 'photo' | 'edu', string> = { exp: '', k8s: '', photo: '', edu: '' };
  let profileBefore: Json[] = [];

  test.beforeAll(async () => {
    const seed: [keyof typeof ids, Json][] = [
      ['exp', { kind: 'experience', content: { role: 'Backend developer', organization: 'Acme Pagos', summary: 'Construí APIs de pagos.', highlights: ['APIs en TypeScript'] }, tags: ['PostgreSQL'] }],
      ['k8s', { kind: 'skill', content: { name: 'Kubernetes' }, tags: [] }],
      ['photo', { kind: 'skill', content: { name: 'Fotografía' }, tags: ['arte'] }],
      ['edu', { kind: 'education', content: { institution: 'UNAM', degree: 'Ingeniería en computación' }, tags: [] }],
    ];
    for (const [key, body] of seed) {
      const res = await apiAs(OWNER_A, 'POST', '/api/v1/profile/items', body);
      expect(res.status, key).toBe(201);
      ids[key] = res.json!.item.id as string;
    }
    const profile = await apiAs(OWNER_A, 'GET', '/api/v1/profile');
    profileBefore = profile.json!.items as Json[];
    expect(profileBefore.length).toBeGreaterThanOrEqual(4); // read-proof
  });

  test('A: intake with a counter, then a keyboard status change that persists and moves the card', async ({ page, context }) => {
    const violations = cspViolations(page);
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await signIn(context, OWNER_A);
    await page.goto(url('app', '/empleos'));
    await expect(page.getByRole('heading', { level: 1, name: 'Empleos' })).toBeVisible();

    await page.getByLabel('Puesto').fill(title);
    await page.getByLabel('Empresa (opcional)').fill('Ejemplo SA');
    await page.getByLabel('Ubicación (opcional)').fill('Remoto');
    await page.getByLabel('Enlace al anuncio (opcional)').fill(SOURCE);
    await expect(page.getByText('Solo guardamos el enlace; no lo visitamos.').first()).toBeVisible();
    await page.getByLabel('Texto del anuncio').fill(POSTING);
    await expect(page.getByTestId('job-new-counter')).toHaveText(`${POSTING.length} de 50,000 caracteres`);
    await page.getByRole('button', { name: 'Guardar empleo' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Empleo guardado' })).toBeVisible();

    const saved = page.getByTestId('column-saved').getByTestId('job-card').filter({ hasText: title });
    await expect(saved).toHaveCount(1);
    const href = await saved.getByRole('link', { name: title }).getAttribute('href');
    jobId = href!.split('/').pop()!;
    expect(jobId).toMatch(/^[0-9a-f-]{36}$/);

    // Keyboard only: the select does nothing by itself; Tab to «Mover» and Enter commits; focus follows the card.
    const select = page.getByLabel(`Estado de «${title}»`);
    await select.focus();
    await select.selectOption('applying');
    await expect(page.getByTestId('column-saved').getByTestId('job-card').filter({ hasText: title })).toHaveCount(1);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('column-applying').getByTestId('job-card').filter({ hasText: title })).toHaveCount(1);
    await expect(page.getByTestId('column-saved').getByTestId('job-card').filter({ hasText: title })).toHaveCount(0);
    await expect(page.getByLabel(`Estado de «${title}»`)).toBeFocused();

    await page.reload();
    await expect(page.getByTestId('column-applying').getByTestId('job-card').filter({ hasText: title })).toHaveCount(1);
    const api = await apiAs(OWNER_A, 'GET', `/api/v1/jobs/${jobId}`);
    expect(api.json!.job.status).toBe('applying');
    expect(api.json!.job.sourceUrl).toBe(SOURCE);
    expect(requests.filter((u) => u.includes('empleos.example.test'))).toEqual([]);
    expect(violations).toEqual([]);
  });

  test('A: the job page explains the keyword match with the API\'s own numbers and links the posting without visiting it', async ({ page, context }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await signIn(context, OWNER_A);
    await page.goto(url('app', `/empleos/${jobId}`));
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    const panel = page.getByTestId('match-panel');
    await expect(panel.getByRole('heading', { name: 'Coincidencia por palabras clave (sin IA)' })).toBeVisible();
    await expect(panel).toContainText('keyword-overlap-v1');

    const match = (await apiAs(OWNER_A, 'GET', `/api/v1/jobs/${jobId}/match`)).json!;
    await expect(page.getByTestId('match-coverage')).toHaveText(`El anuncio tiene ${match.jobTerms} términos distintos; tu perfil cubre ${match.coveredTerms}.`);
    const top = page.getByTestId('match-ranked').getByRole('listitem').first();
    await expect(top).toContainText('Backend developer · Acme Pagos');
    await expect(top).toContainText(`${match.items[0].score} puntos`);
    await expect(top.getByRole('list', { name: 'Etiquetas que aparecen en el anuncio:' })).toContainText('PostgreSQL');
    await expect(page.getByTestId('match-missing')).toContainText(match.missingTerms[0] as string);
    await expect(page.locator('body')).not.toContainText('%');

    const link = page.getByTestId('job-source-link');
    await expect(link).toHaveAttribute('href', SOURCE);
    await expect(link).toHaveAttribute('rel', 'ugc nofollow noopener noreferrer');
    await expect(link).toHaveText('Anuncio original en empleos.example.test');

    // The same page in English under /en.
    await page.goto(url('app', `/en/empleos/${jobId}`));
    await expect(page.getByRole('heading', { name: 'Keyword match (no AI)' })).toBeVisible();
    await expect(page.getByTestId('match-coverage')).toHaveText(`The posting has ${match.jobTerms} distinct terms; your profile covers ${match.coveredTerms}.`);
    expect(requests.filter((u) => u.includes('empleos.example.test'))).toEqual([]);
  });

  test('A: tailor (deselect, add, reorder, override) and create 3 drafts in one batch; the profile does not change', async ({ page, context }) => {
    const violations = cspViolations(page);
    await signIn(context, OWNER_A);
    await page.goto(url('app', `/empleos/${jobId}/adaptar`));
    await expect(page.getByRole('heading', { level: 1, name: 'Adaptar al empleo' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sugerencias con IA (próximamente)' })).toBeVisible();

    // Pre-selected: the items that matched, in the API's rank order.
    const match = (await apiAs(OWNER_A, 'GET', `/api/v1/jobs/${jobId}/match`)).json!;
    const expected = (match.items as Json[]).filter((m) => m.score > 0).map((m) => m.itemId as string);
    expect(expected).toEqual([ids.exp, ids.k8s]);
    const selected = page.getByTestId('tailor-selected').getByTestId('tailor-entry');
    await expect(selected).toHaveCount(2);
    expect(await selected.evaluateAll((els) => els.map((e) => e.getAttribute('data-item-id')))).toEqual(expected);

    await page.getByRole('button', { name: 'Quitar: Kubernetes' }).click();
    await expect(page.getByRole('button', { name: 'Agregar: Kubernetes' })).toBeFocused();
    await page.getByRole('button', { name: 'Agregar: Fotografía' }).click();
    await expect(page.getByRole('button', { name: 'Quitar: Fotografía' })).toBeFocused();
    await page.getByRole('button', { name: 'Subir: Fotografía' }).click();
    await expect(page.getByRole('button', { name: 'Bajar: Fotografía' })).toBeFocused();
    expect(await selected.evaluateAll((els) => els.map((e) => e.getAttribute('data-item-id')))).toEqual([ids.photo, ids.exp]);

    const exp = selected.filter({ hasText: 'Backend developer · Acme Pagos' });
    await exp.getByText('Ajustar el texto para este empleo').click();
    await exp.getByLabel('Descripción para este empleo').fill('APIs de pagos con PostgreSQL, solo para esta vacante.');
    await expect(exp.getByText('Texto ajustado')).toBeVisible();

    await expect(page.getByTestId('tailor-will-create').getByRole('listitem')).toHaveText([`CV · ${title} · Ejemplo SA`, `Portafolio · ${title} · Ejemplo SA`, `Presentación · ${title} · Ejemplo SA`]);
    await page.getByRole('button', { name: 'Crear documentos para este empleo' }).click();
    const result = page.getByTestId('tailor-created');
    await expect(result).toContainText('Listo: se crearon 3 borradores para este empleo.');
    await expect(result).toBeFocused();
    await expect(result.getByRole('link')).toHaveCount(3);
    await expect(result.getByRole('link', { name: 'Abrir el CV' })).toHaveAttribute('href', /^\/documentos\/[0-9a-f-]{36}$/);

    const list = (await apiAs(OWNER_A, 'GET', `/api/v1/artifacts?job_id=${jobId}`)).json!.artifacts as Json[];
    expect(list.map((a) => a.kind).sort()).toEqual(['cv', 'portfolio', 'presentation']);
    for (const a of list) {
      expect(a.status).toBe('draft');
      expect(a.template).toBe('base');
      expect(a.jobId).toBe(jobId);
      expect(a.content.items).toEqual([{ itemId: ids.photo }, { itemId: ids.exp, override: { summary: 'APIs de pagos con PostgreSQL, solo para esta vacante.' } }]);
    }

    // Overrides never change the core profile: every item, field by field, as before.
    const after = (await apiAs(OWNER_A, 'GET', '/api/v1/profile')).json!.items as Json[];
    expect(after).toEqual(profileBefore);

    // The job's documents, numbered as versions; a second set is allowed and becomes version 2.
    const docs = page.getByTestId('job-documents');
    await expect(docs.getByTestId('job-document')).toHaveCount(3);
    await page.getByRole('button', { name: 'Crear documentos para este empleo' }).click();
    await expect(docs.getByTestId('job-document')).toHaveCount(6);
    await expect(docs).toContainText('(versión 2)');
    expect(violations).toEqual([]);
  });

  test('A: deleting a job that has documents is refused and explained (no silent cascade)', async ({ page, context }) => {
    await signIn(context, OWNER_A);
    await page.goto(url('app', `/empleos/${jobId}`));
    await page.getByRole('button', { name: 'Eliminar empleo' }).click();
    const dialog = page.getByRole('dialog', { name: '¿Eliminar este empleo?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Este empleo tiene documentos.' })).toBeVisible();
    expect((await apiAs(OWNER_A, 'GET', `/api/v1/jobs/${jobId}`)).status).toBe(200);
  });

  test('B: sees none of A\'s jobs, match or documents, and cannot reach them through the API', async ({ page, context }) => {
    await signIn(context, OWNER_B);
    await page.goto(url('app', '/empleos'));
    await expect(page.getByText('Aún no guardas ningún empleo.')).toBeVisible();
    await expect(page.getByText(title)).toHaveCount(0);
    for (const path of [`/empleos/${jobId}`, `/empleos/${jobId}/adaptar`]) {
      await page.goto(url('app', path));
      await expect(page.getByRole('alert').filter({ hasText: 'No encontramos este empleo.' }), path).toBeVisible();
      await expect(page.getByText(title)).toHaveCount(0);
    }

    expect((await apiAs(OWNER_B, 'GET', `/api/v1/jobs/${jobId}`)).status).toBe(404);
    expect((await apiAs(OWNER_B, 'GET', `/api/v1/jobs/${jobId}/match`)).status).toBe(404);
    expect((await apiAs(OWNER_B, 'PATCH', `/api/v1/jobs/${jobId}`, { status: 'rejected' })).status).toBe(404);
    expect((await apiAs(OWNER_B, 'GET', `/api/v1/artifacts?job_id=${jobId}`)).json!.artifacts).toEqual([]);
    const batch = { jobId, artifacts: [{ kind: 'cv', title: 'x', content: { items: [{ itemId: ids.exp }] } }] };
    expect((await apiAs(OWNER_B, 'POST', '/api/v1/artifacts/batch', batch)).status).toBe(404);
    const foreign = await apiAs(OWNER_B, 'POST', '/api/v1/artifacts/batch', { ...batch, jobId: null });
    expect(foreign.status).toBe(422);
    expect(foreign.json!.itemIds).toEqual([ids.exp]);

    // A's data, re-read: unchanged by every attempt above.
    const job = (await apiAs(OWNER_A, 'GET', `/api/v1/jobs/${jobId}`)).json!.job;
    expect(job.status).toBe('applying');
    expect(((await apiAs(OWNER_A, 'GET', `/api/v1/artifacts?job_id=${jobId}`)).json!.artifacts as Json[]).length).toBe(6);
    expect((await apiAs(OWNER_B, 'GET', '/api/v1/jobs')).json!.jobs).toEqual([]);
  });
});
