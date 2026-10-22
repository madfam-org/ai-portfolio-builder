/**
 * W5-H: the market-range panel on /empleos/:id, end to end against the launcher's SYNTHETIC Symbiosis HCM
 * (test-support/hcm-fake.ts; every figure is invented and labelled SINTÉTICO). The browser talks only to cv; cv's
 * server asks HCM with the job title and state; another person's job is a 404.
 */
import { expect, test } from '@playwright/test';
import { apiAs, cspViolations, signIn } from './support/fixtures.ts';
import { E2E_HCM_PORT, suiteOwners, url } from './support/env.ts';

const { OWNER_A, OWNER_B } = suiteOwners('benchmark');

async function createJob(title: string, location: string): Promise<string> {
  const res = await apiAs(OWNER_A, 'POST', '/api/v1/jobs', { title, company: 'Ejemplo SA', location, sourceText: 'Vacante sintética para pruebas del panel de mercado.' });
  expect(res.status).toBe(201);
  return res.json!.job.id as string;
}

test.describe.serial('market range panel (synthetic HCM)', () => {
  const ids = { dev: '', thin: '', vague: '' };

  test.beforeAll(async () => {
    ids.dev = await createJob('Desarrolladora backend Sr.', 'Ciudad de México');
    ids.thin = await createJob('Contador general', 'Guadalajara, Jalisco');
    ids.vague = await createJob('Ninja de la vida', 'Remoto');
  });

  test('A: range, median, n, quarter and source next to the figures; state read from the location', async ({ page, context }) => {
    const violations = cspViolations(page);
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await signIn(context, OWNER_A);
    await page.goto(url('app', `/empleos/${ids.dev}`));
    const panel = page.getByTestId('benchmark-panel');
    await expect(panel.getByRole('heading', { level: 2, name: 'Rango de ingreso en el mercado' })).toBeVisible();
    await expect(panel.getByTestId('benchmark-median')).toHaveText('$14,950 al mes');
    await expect(panel.getByTestId('benchmark-figures')).toContainText('$12,450 – $17,450');
    await expect(panel.getByTestId('benchmark-figures')).toContainText('$10,950 – $18,950');
    await expect(panel.getByTestId('benchmark-source')).toContainText('Datos de la ENOE (INEGI), 2031-T3, n = 100.');
    await expect(panel.getByTestId('benchmark-geography')).toContainText('Estado leído de la ubicación «Ciudad de México»: Ciudad de México.');
    await expect(panel.getByTestId('benchmark-chart')).toBeVisible();
    await expect(panel.getByTestId('benchmark-posting')).toHaveText('Esta vacante no indica un salario mensual en pesos que se pueda comparar.');
    await expect(panel).toContainText('nunca tu nombre, tu perfil ni tu CV');
    await expect(panel).toContainText('De cada 100 personas de esa población, 99 declararon un monto');
    await expect(panel).not.toContainText('%');
    expect(requests.some((u) => u.includes(`:${E2E_HCM_PORT}`)), 'the browser never calls HCM').toBe(false);
    expect(violations).toEqual([]);
  });

  test('A: «sin datos suficientes» with n when HCM withholds the figures; unresolved titles show no numbers', async ({ page, context }) => {
    await signIn(context, OWNER_A);
    await page.goto(url('app', `/empleos/${ids.thin}`));
    await expect(page.getByTestId('benchmark-insufficient')).toHaveText(
      'Sin datos suficientes: la ENOE tiene 12 registros con ingreso para esta ocupación y se necesitan 30.',
    );
    await expect(page.getByTestId('benchmark-figures')).toHaveCount(0);

    await page.goto(url('app', `/empleos/${ids.vague}`));
    await expect(page.getByTestId('benchmark-unresolved')).toContainText('No pudimos clasificar «Ninja de la vida»');
    await expect(page.getByTestId('benchmark-chart')).toHaveCount(0);
  });

  test('A in English: the same figures, English copy', async ({ page, context }) => {
    await signIn(context, OWNER_A);
    await page.goto(url('app', `/en/empleos/${ids.dev}`));
    const panel = page.getByTestId('benchmark-panel');
    await expect(panel.getByRole('heading', { level: 2, name: 'Market income range' })).toBeVisible();
    await expect(panel.getByTestId('benchmark-median')).toHaveText('MX$14,950 a month');
    await expect(panel.getByTestId('benchmark-source')).toContainText('ENOE data (INEGI), 2031 Q3, n = 100.');
  });

  test('B: A’s job benchmark is a 404 through the API', async () => {
    const res = await apiAs(OWNER_B, 'GET', `/api/v1/jobs/${ids.dev}/benchmark`);
    expect(res.status).toBe(404);
    const mine = await apiAs(OWNER_A, 'GET', `/api/v1/jobs/${ids.dev}/benchmark`);
    expect(mine.status).toBe(200);
    expect(mine.json!.source.dataset_id).toBe('MEX-INEGI.SYNTHETIC-ENOE-2031-III');
  });
});
