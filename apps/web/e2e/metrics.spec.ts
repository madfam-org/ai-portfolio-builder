/**
 * W4-O: `/metrics` is served on the internal metrics port only. On the public port every host (landing, app, API and
 * the pages host) answers its router 404, and the metrics port labels requests by route template, never by a raw
 * path, id, slug or share token.
 */
import { request } from 'node:http';
import { expect, test } from '@playwright/test';
import { apiAs, raw, signIn } from './support/fixtures.ts';
import { E2E_METRICS_PORT, HOSTS, suiteOwners, url } from './support/env.ts';

const { OWNER_A } = suiteOwners('metrics');

function scrape(path = '/metrics', host = '10.0.0.9:9090', method = 'GET'): Promise<{ status: number; type: string; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: 'localhost', port: E2E_METRICS_PORT, path, method, headers: { Host: host } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, type: String(res.headers['content-type']), body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('/metrics is not reachable on cv, cv-app, cv-api or the pages host', async () => {
  for (const host of Object.keys(HOSTS) as (keyof typeof HOSTS)[]) {
    for (const method of ['GET', 'HEAD', 'POST']) {
      const res = await raw(host, method, '/metrics');
      expect(res.status, `${method} ${host}/metrics`).toBe(404);
      expect(res.body).not.toMatch(/# TYPE|cv_http_requests_total/);
    }
  }
});

test('the browser cannot open /metrics on a public host', async ({ page }) => {
  for (const host of Object.keys(HOSTS) as (keyof typeof HOSTS)[]) {
    const res = await page.goto(url(host, '/metrics'));
    expect(res?.status(), host).toBe(404);
    expect(await page.content()).not.toMatch(/cv_http_requests_total/);
  }
});

test('the metrics port: GET /metrics only, route templates only, readiness exported', async ({ context, page }) => {
  // Real traffic with ids: a job created through the API, then its tailoring page in the signed-in app.
  const created = await apiAs(OWNER_A, 'POST', '/api/v1/jobs', { title: 'Analista de datos', company: 'Ejemplo', sourceText: 'Buscamos SQL y Python.' });
  expect(created.status).toBe(201);
  const id = String(created.json?.job.id);
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  await signIn(context, OWNER_A);
  expect((await page.goto(url('app', `/empleos/${id}/adaptar`)))?.status()).toBe(200);
  await raw('api', 'GET', '/ready');

  const res = await scrape();
  expect(res.status).toBe(200);
  expect(res.type).toBe('text/plain; version=0.0.4; charset=utf-8');
  expect(res.body).toMatch(/cv_http_requests_total\{host_role="api",route="\/api\/v1\/jobs",method="POST",status="201"\} [1-9]/);
  expect(res.body).toMatch(/cv_http_requests_total\{host_role="app",route="\/empleos\/:id\/adaptar",method="GET",status="200"\} [1-9]/);
  expect(res.body).toMatch(/^cv_ready 1$/m);
  expect(res.body).toMatch(/cv_db_readiness_checks_total\{outcome="ok"\} [1-9]/);
  expect(res.body).not.toContain(id);
  expect(res.body).not.toContain(OWNER_A.sub);

  for (const path of ['/', '/health', '/ready', '/api/v1/meta']) expect((await scrape(path, `${HOSTS.api}:${E2E_METRICS_PORT}`)).status, path).toBe(404);
  expect((await scrape('/metrics', '10.0.0.9:9090', 'POST')).status).toBe(405);
});
