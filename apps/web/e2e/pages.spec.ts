/**
 * Smoke: the pages host (cv-p) — a public artifact, a link artifact, indexing by the owner's choice, unpublish and
 * unknown slugs 404, inert user text, the abuse link, and no cookie handling.
 */
import { expect, test } from '@playwright/test';
import { apiAs, cspViolations, raw } from './support/fixtures.ts';
import { OWNER_A, OWNER_B, url } from './support/env.ts';

const XSS = '<img src=x onerror="window.__pwned=1">';
const SLUG = `ana-cv-${Date.now().toString(36)}`;
let cvId = '';
let linkToken = '';

test.beforeAll(async () => {
  expect((await apiAs(OWNER_A, 'PUT', '/api/v1/profile', { displayName: 'Ana Prueba', headline: 'Ingeniera de datos', summary: XSS })).status).toBe(200);
  const item = await apiAs(OWNER_A, 'POST', '/api/v1/profile/items', {
    kind: 'experience',
    content: { role: 'Backend', organization: 'Acme', startDate: '2022-01', summary: XSS, highlights: [XSS] },
  });
  expect(item.status).toBe(201);
  const itemId = item.json?.item.id as string;
  const set = await apiAs(OWNER_A, 'POST', '/api/v1/artifacts/batch', {
    artifacts: [
      { kind: 'cv', title: 'CV público', content: { items: [{ itemId }] } },
      { kind: 'portfolio', title: 'Portafolio con enlace', content: { items: [{ itemId }] } },
      { kind: 'presentation', title: 'Borrador', content: { items: [{ itemId }] } },
    ],
  });
  expect(set.status).toBe(201);
  cvId = set.json?.artifacts[0].id as string;
  expect((await apiAs(OWNER_B, 'POST', `/api/v1/artifacts/${cvId}/publish`, { visibility: 'public', slug: SLUG })).status).toBe(404);
  expect((await apiAs(OWNER_A, 'POST', `/api/v1/artifacts/${cvId}/publish`, { visibility: 'public', slug: SLUG })).status).toBe(200);
  const link = await apiAs(OWNER_A, 'POST', `/api/v1/artifacts/${set.json?.artifacts[1].id}/publish`, { visibility: 'link' });
  linkToken = link.json?.artifact.shareToken as string;
  expect(linkToken).toHaveLength(43);
});

test('a public artifact renders on the pages host: noindex by default, no-store, inert user text, abuse link', async ({ page }) => {
  const violations = cspViolations(page);
  const res = await page.goto(url('pages', `/${SLUG}`));
  expect(res?.status()).toBe(200);
  const h = res!.headers();
  expect(h['x-robots-tag']).toBe('noindex, nofollow, noai, noimageai');
  expect(h['cache-control']).toContain('no-store');
  expect(h['content-security-policy']).toContain("form-action 'none'");
  expect(h['set-cookie']).toBeUndefined();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ana Prueba');
  await expect(page.getByText('Ingeniera de datos')).toBeVisible();
  await expect(page.locator('main img')).toHaveCount(0);
  await expect(page.getByText(XSS).first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  await expect(page.getByRole('link', { name: /Repórtalo/ })).toHaveAttribute('href', /^mailto:legal@madfam\.io\?subject=/);
  expect(violations).toEqual([]);
});

test('indexing follows the owner\'s choice', async ({ page }) => {
  expect((await apiAs(OWNER_A, 'POST', `/api/v1/artifacts/${cvId}/publish`, { visibility: 'public', slug: SLUG, indexable: true })).status).toBe(200);
  const res = await page.goto(url('pages', `/${SLUG}`));
  expect(res?.headers()['x-robots-tag']).toBe('index, follow');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
});

test('a link artifact renders under /l/<token>: noindex, no-store, no-referrer; never by slug', async ({ page }) => {
  const res = await page.goto(url('pages', `/l/${linkToken}`));
  expect(res?.status()).toBe(200);
  const h = res!.headers();
  expect(h['x-robots-tag']).toBe('noindex, nofollow, noai, noimageai');
  expect(h['cache-control']).toBe('private, no-store');
  expect(h['referrer-policy']).toBe('no-referrer');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ana Prueba');
  const report = await page.getByRole('link', { name: /Repórtalo/ }).getAttribute('href');
  expect(decodeURIComponent(report ?? '')).not.toContain(linkToken);
});

test('unknown, unpublished and malformed addresses are the noindex 404; cookies change nothing', async ({ page }) => {
  for (const path of ['/no-existe-este', '/', `/l/${'x'.repeat(43)}`, '/health-check-x']) {
    const res = await page.goto(url('pages', path));
    expect(res?.status(), path).toBe(404);
    expect(res?.headers()['x-robots-tag'], path).toBe('noindex, nofollow, noai, noimageai');
  }
  const plain = await raw('pages', 'GET', `/${SLUG}`);
  const withCookie = await raw('pages', 'GET', `/${SLUG}`, { headers: { Cookie: 'authjs.session-token=whatever' } });
  // The per-response nonce is the only difference allowed.
  const strip = (r: typeof plain) => {
    const nonce = /'nonce-([^']+)'/.exec(String(r.headers['content-security-policy']))?.[1];
    expect(nonce).toBeTruthy();
    return r.body.split(nonce!).join('NONCE');
  };
  expect(withCookie.headers['set-cookie']).toBeUndefined();
  expect(strip(withCookie)).toBe(strip(plain));

  expect((await apiAs(OWNER_A, 'POST', `/api/v1/artifacts/${cvId}/unpublish`)).status).toBe(200);
  expect((await page.goto(url('pages', `/${SLUG}`)))?.status()).toBe(404);
  const robots = await raw('pages', 'GET', '/robots.txt');
  expect(robots.body).toContain('User-agent: ClaudeBot');
});
