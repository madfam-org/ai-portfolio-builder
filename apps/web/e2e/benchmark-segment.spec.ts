/**
 * W7: the honest market panel for store careers, end to end against the launcher's SYNTHETIC Symbiosis HCM
 * (test-support/hcm-fake.ts; every figure is invented, the source says SINTÉTICO). The general figure names itself
 * «mercado general»; retail-sales occupations also get the industry segment under HCM's exact label («no solo
 * lujo»); a posting above the general P90 gets a neutral note, never «too high». The browser talks only to cv.
 *
 * Screenshots for the lane report are written to this test's output folder (test-results/).
 */
import { expect, test } from '@playwright/test';
import { apiAs, cspViolations, signIn } from './support/fixtures.ts';
import { E2E_HCM_PORT, suiteOwners, url } from './support/env.ts';

const { OWNER_A } = suiteOwners('benchmark-segment');
const MONTHLY_30K = { salaryMin: 30_000, salaryMax: 30_000, salaryCurrency: 'MXN', salaryPeriod: 'month' };
const NEVER = [/atípic/i, /demasiado/i, /excesiv/i, /outlier/i, /too high/i, /unusual/i, /%/];

async function createJob(title: string, location: string, extra: Record<string, unknown> = {}): Promise<string> {
  const res = await apiAs(OWNER_A, 'POST', '/api/v1/jobs', { title, company: 'Casa Ejemplo', location, sourceText: 'Vacante sintética de tienda.', ...extra });
  expect(res.status).toBe(201);
  return res.json!.job.id as string;
}

test.describe.serial('market panel for store careers (synthetic HCM)', () => {
  const ids = { advisor: '', manager: '', assistant: '', dev: '' };

  test.beforeAll(async () => {
    ids.advisor = await createJob('Client Advisor', 'Ciudad de México', MONTHLY_30K);
    ids.manager = await createJob('Store Manager', 'Ciudad de México');
    ids.assistant = await createJob('Subgerente de tienda', 'Ciudad de México');
    ids.dev = await createJob('Desarrolladora backend', 'Ciudad de México');
  });

  test('above the general P90: neutral note, general market named, segment with its label, n, quarter and source', async ({ page, context }, info) => {
    const violations = cspViolations(page);
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await signIn(context, OWNER_A);
    await page.goto(url('app', `/empleos/${ids.advisor}`));
    const panel = page.getByTestId('benchmark-panel');
    await expect(panel.getByTestId('benchmark-median')).toHaveText('$8,000 al mes');
    await expect(panel.getByTestId('benchmark-market-scope')).toHaveText('Mercado general: todas las empresas y tiendas de esta ocupación, de cualquier giro y tamaño.');
    await expect(panel.getByTestId('benchmark-posting')).toHaveText('Salario del anuncio: $30,000 al mes, por encima del percentil 90.');
    await expect(panel.getByTestId('benchmark-above-p90')).toHaveText(
      'La ENOE no distingue a las casas de lujo del resto de las empresas, y en los puestos con comisión el ingreso que la gente declara suele reportarse de otra forma que el sueldo de un anuncio. Quedar por encima del percentil 90 general describe al mercado general, no a esta oferta.',
    );
    await expect(panel.getByTestId('benchmark-source')).toContainText('Datos de la ENOE (INEGI), 2031-T3, n = 140.');

    const segment = panel.getByTestId('benchmark-segment');
    await expect(segment.getByRole('heading', { level: 3, name: 'Mismo dato, sólo en un giro del comercio' })).toBeVisible();
    await expect(segment.getByTestId('benchmark-segment-label')).toContainText('joyería y relojes); no solo lujo.');
    await expect(segment).toContainText('SINCO 4211');
    await expect(segment.getByTestId('benchmark-segment-median')).toHaveText('$6,400 al mes');
    await expect(segment.getByTestId('benchmark-segment-figures')).toContainText('$4,400 – $8,400');
    await expect(segment.getByTestId('benchmark-segment-figures')).toContainText('P10 y P90 no se publican con menos de 100 registros.');
    await expect(segment.getByTestId('benchmark-segment-source')).toContainText('Datos de la ENOE (INEGI), 2031-T3, n = 30.');
    await expect(segment.getByTestId('benchmark-segment-posting')).toHaveText('Frente a este giro, el salario del anuncio queda por encima del percentil 75.');
    await expect(segment.getByTestId('benchmark-segment-chart')).toBeVisible();

    const text = (await panel.innerText()).replace(/\s+/g, ' ');
    for (const word of NEVER) expect(text, `the panel never says ${word}`).not.toMatch(word);
    expect(requests.some((u) => u.includes(`:${E2E_HCM_PORT}`)), 'the browser never calls HCM').toBe(false);
    expect(violations).toEqual([]);
    await panel.screenshot({ path: info.outputPath('panel-es-client-advisor.png') });
  });

  test('withheld segment: «sin datos suficientes» with n; the general figure stays', async ({ page, context }, info) => {
    await signIn(context, OWNER_A);
    await page.goto(url('app', `/empleos/${ids.manager}`));
    const panel = page.getByTestId('benchmark-panel');
    await expect(panel.getByTestId('benchmark-median')).toHaveText('$16,500 al mes');
    await expect(panel.getByTestId('benchmark-segment-insufficient')).toHaveText('Sin datos suficientes en este giro: la ENOE tiene 12 registros con ingreso y se necesitan 30.');
    await expect(panel.getByTestId('benchmark-segment-figures')).toHaveCount(0);
    await expect(panel.getByTestId('benchmark-segment-source')).toContainText('n = 12.');
    await expect(panel.getByTestId('benchmark-above-p90')).toHaveCount(0);
    await panel.screenshot({ path: info.outputPath('panel-es-store-manager-withheld.png') });
  });

  test('segment unavailable: the panel says so and keeps the general figure', async ({ page, context }) => {
    await signIn(context, OWNER_A);
    await page.goto(url('app', `/empleos/${ids.assistant}`));
    const panel = page.getByTestId('benchmark-panel');
    await expect(panel.getByTestId('benchmark-median')).toHaveText('$14,000 al mes');
    await expect(panel.getByTestId('benchmark-segment-unavailable')).toHaveText('El dato de este giro no está disponible en este momento; el dato general de arriba no cambia.');
  });

  test('not a store occupation: no segment section at all', async ({ page, context }) => {
    await signIn(context, OWNER_A);
    await page.goto(url('app', `/empleos/${ids.dev}`));
    const panel = page.getByTestId('benchmark-panel');
    await expect(panel.getByTestId('benchmark-median')).toHaveText('$14,950 al mes');
    await expect(panel.getByTestId('benchmark-market-scope')).toBeVisible();
    await expect(panel.getByTestId('benchmark-segment')).toHaveCount(0);
  });

  test('in English: the English label and the same neutral note', async ({ page, context }, info) => {
    await signIn(context, OWNER_A);
    await page.goto(url('app', `/en/empleos/${ids.advisor}`));
    const panel = page.getByTestId('benchmark-panel');
    await expect(panel.getByTestId('benchmark-market-scope')).toHaveText('General market: every company and store in this occupation, of any line of business and size.');
    await expect(panel.getByTestId('benchmark-above-p90')).toContainText('The ENOE does not separate luxury houses from other employers');
    await expect(panel.getByTestId('benchmark-segment-label')).toContainText('jewellery and watches); not only luxury.');
    await expect(panel.getByTestId('benchmark-segment-median')).toHaveText('MX$6,400 a month');
    await expect(panel.getByTestId('benchmark-segment-source')).toContainText('ENOE data (INEGI), 2031 Q3, n = 30.');
    const text = (await panel.innerText()).replace(/\s+/g, ' ');
    for (const word of NEVER) expect(text).not.toMatch(word);
    await panel.screenshot({ path: info.outputPath('panel-en-client-advisor.png') });
  });
});
