/**
 * W6-A activation, end to end over the built server: the job-link reader page (es-MX and en) on the landing, the pages
 * host under its production name (cv-p.madfam.io), the per-client rate limit on unauthenticated reads (429 with
 * Retry-After, keyed by CF-Connecting-IP only) and the 7-day idle session cookie.
 */
import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { apiAs, cspViolations, raw } from './support/fixtures.ts';
import { E2E_MINT_PORT, HOSTS, suiteOwners, url } from './support/env.ts';

const { OWNER_A } = suiteOwners('activation');
const SLUG = `act-${Date.now().toString(36)}`;
/** TEST-NET addresses (RFC 5737), a fresh block per run, so a re-run against the same server never starts spent. */
const BASE = (Date.now() % 50) * 5;
const ip = (n: number) => `198.51.100.${BASE + n}`;

test.beforeAll(async () => {
  expect((await apiAs(OWNER_A, 'PUT', '/api/v1/profile', { displayName: 'Ana Activa', headline: 'Analista' })).status).toBe(200);
  const made = await apiAs(OWNER_A, 'POST', '/api/v1/artifacts', { kind: 'cv', title: 'CV activo', content: { items: [] } });
  expect(made.status).toBe(201);
  const id = made.json?.artifact.id as string;
  expect((await apiAs(OWNER_A, 'POST', `/api/v1/artifacts/${id}/publish`, { visibility: 'public', slug: SLUG })).status).toBe(200);
});

for (const [path, lang, heading, other] of [
  ['/lector', 'es-MX', /lector de vacantes/i, '/en/lector'],
  ['/en/lector', 'en', /job-link reader/i, '/lector'],
] as const) {
  test(`reader page ${path}: ${lang}, noindex like the landing, the real User-Agent and opt-out, no CSP violation`, async ({ page }) => {
    const violations = cspViolations(page);
    const res = await page.goto(url('landing', path));
    expect(res?.status()).toBe(200);
    expect(res?.headers()['x-robots-tag']).toBe('noindex, nofollow');
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    await expect(page.getByTestId('reader-ua')).toHaveText(/^MADFAM-CV-Intake\/1\.0 \(\+https:\/\/cv\.madfam\.io\/lector; /);
    await expect(page.getByTestId('reader-robots')).toHaveText('User-agent: madfam-cv\nDisallow: /');
    await expect(page.getByRole('link', { name: 'support@madfam.io' })).toHaveAttribute('href', 'mailto:support@madfam.io');
    await expect(page.locator('a.lang')).toHaveAttribute('href', other);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://${HOSTS.landing}${path}`);
    expect(violations).toEqual([]);
  });
}

test('the landing footer links to the reader page in the same language', async ({ page }) => {
  await page.goto(url('landing', '/en'));
  await expect(page.getByRole('link', { name: 'Job-link reader' })).toHaveAttribute('href', `https://${HOSTS.landing}/en/lector`);
  await page.goto(url('landing', '/'));
  await expect(page.getByRole('link', { name: 'Lector de vacantes' })).toHaveAttribute('href', `https://${HOSTS.landing}/lector`);
});

test('the pages host serves a published CV under cv-p.madfam.io: pages CSP, noindex by default, no cookie', async ({ page }) => {
  expect(HOSTS.pages).toBe('cv-p.madfam.io');
  const violations = cspViolations(page);
  const res = await page.goto(url('pages', `/${SLUG}`));
  expect(res?.status()).toBe(200);
  expect(new URL(page.url()).hostname).toBe('cv-p.madfam.io');
  const h = res!.headers();
  expect(h['content-security-policy']).toMatch(/^default-src 'none'; .*form-action 'none'/);
  expect(h['x-robots-tag']).toBe('noindex, nofollow, noai, noimageai');
  expect(h['cache-control']).toContain('no-store');
  expect(h['set-cookie']).toBeUndefined();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ana Activa');
  expect(violations).toEqual([]);
});

test('pages host: a client over its budget gets 429 + Retry-After before any lookup; another client is unaffected', async () => {
  const me = ip(1);
  const missing = `/nadie-${randomBytes(4).toString('hex')}`;
  const statuses: number[] = [];
  // Default budget: 60 at once (CV_READ_LIMIT_BURST), refilled at 1 a second.
  for (let i = 0; i < 60; i++) statuses.push((await raw('pages', 'GET', i % 2 ? `/${SLUG}` : missing, { headers: { 'CF-Connecting-IP': me } })).status);
  expect(statuses.filter((s) => s === 429)).toEqual([]);
  const over = await raw('pages', 'GET', `/${SLUG}`, { headers: { 'CF-Connecting-IP': me } });
  expect(over.status).toBe(429);
  expect(Number(over.headers['retry-after'])).toBeGreaterThanOrEqual(1);
  expect(over.headers['cache-control']).toBe('no-store');
  expect(over.headers['x-robots-tag']).toBe('noindex, nofollow, noai, noimageai');
  expect(over.body).toMatch(/^Demasiadas solicitudes[\s\S]*Too many requests/);
  expect(over.body).not.toContain(SLUG);
  // A forged X-Forwarded-For changes nothing: only CF-Connecting-IP (set by Cloudflare's edge) names the client.
  expect((await raw('pages', 'GET', `/${SLUG}`, { headers: { 'CF-Connecting-IP': me, 'X-Forwarded-For': ip(2) } })).status).toBe(429);
  // A link page over budget keeps its no-referrer rule.
  const link = await raw('pages', 'GET', `/l/${randomBytes(32).toString('base64url')}`, { headers: { 'CF-Connecting-IP': me } });
  expect(link.status).toBe(429);
  expect(link.headers['referrer-policy']).toBe('no-referrer');
  expect((await raw('pages', 'GET', `/${SLUG}`, { headers: { 'CF-Connecting-IP': ip(3) } })).status).toBe(200);
  // Assets and robots.txt are not counted.
  expect((await raw('pages', 'GET', '/robots.txt', { headers: { 'CF-Connecting-IP': me } })).status).toBe(200);
});

test('cv-api public reads: 429 JSON with Retry-After past the budget; signed-in routes are not counted here', async () => {
  const me = ip(4);
  for (let i = 0; i < 60; i++) {
    expect((await raw('api', 'GET', `/api/v1/public/a/${SLUG}`, { headers: { 'CF-Connecting-IP': me } })).status).toBe(200);
  }
  const over = await raw('api', 'GET', `/api/v1/public/a/${SLUG}`, { headers: { 'CF-Connecting-IP': me } });
  expect(over.status).toBe(429);
  expect(JSON.parse(over.body)).toMatchObject({ error: 'rate_limited' });
  expect(Number(over.headers['retry-after'])).toBeGreaterThanOrEqual(1);
  expect((await raw('api', 'GET', '/api/v1/meta', { headers: { 'CF-Connecting-IP': me } })).status).toBe(200);
  expect((await raw('api', 'GET', '/api/v1/jobs', { headers: { 'CF-Connecting-IP': me } })).status).toBe(401);
});

test('a session read re-issues the cookie for 7 days (idle expiry), never the Auth.js default of 30', async () => {
  const q = new URLSearchParams({ sub: OWNER_A.sub, name: OWNER_A.name, email: OWNER_A.email });
  const minted = (await (await fetch(`http://127.0.0.1:${E2E_MINT_PORT}/session?${q}`)).json()) as { cookie: { name: string; value: string } };
  const before = Date.now();
  const res = await raw('app', 'GET', '/api/auth/session', { headers: { Cookie: `${minted.cookie.name}=${minted.cookie.value}` } });
  expect(res.status).toBe(200);
  expect(JSON.parse(res.body)).toMatchObject({ user: { sub: OWNER_A.sub } });
  const lines = ([] as string[]).concat(res.headers['set-cookie'] ?? []).filter((l) => l.startsWith(`${minted.cookie.name}=`));
  expect(lines.length).toBeGreaterThan(0);
  const expires = Date.parse(/Expires=([^;]+)/i.exec(lines[0]!)![1]!);
  const week = 7 * 24 * 60 * 60 * 1000;
  expect(Math.abs(expires - (before + week))).toBeLessThan(5 * 60 * 1000);
});
