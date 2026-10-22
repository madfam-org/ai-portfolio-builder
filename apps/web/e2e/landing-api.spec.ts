/** Smoke: the landing and the API hosts (W3-1 harness). */
import { expect, test } from '@playwright/test';
import { cspViolations, raw } from './support/fixtures.ts';
import { url } from './support/env.ts';

test('landing renders es-MX, noindex, no CSP violation', async ({ page }) => {
  const violations = cspViolations(page);
  const res = await page.goto(url('landing', '/'));
  expect(res?.status()).toBe(200);
  expect(res?.headers()['x-robots-tag']).toBe('noindex, nofollow');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-MX');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(violations).toEqual([]);
});

test('api host: meta answers JSON; data needs a bearer', async () => {
  const meta = await raw('api', 'GET', '/api/v1/meta');
  expect(meta.status).toBe(200);
  expect(JSON.parse(meta.body)).toMatchObject({ service: 'cv', api: 'v1' });
  const jobs = await raw('api', 'GET', '/api/v1/jobs');
  expect(jobs.status).toBe(401);
  const ready = JSON.parse((await raw('api', 'GET', '/ready')).body) as { checks: { database: string; signIn: string } };
  expect(ready.checks).toMatchObject({ database: 'ok', signIn: 'configured' });
});
