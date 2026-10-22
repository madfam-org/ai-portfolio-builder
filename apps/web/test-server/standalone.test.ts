/**
 * Smoke test over the BUILT standalone server (run after `next build`): boots
 * .next/standalone/apps/web/server.js the way the image does and checks status codes and headers per Host.
 * `pnpm test:server`; CI runs it after the build step.
 *
 * HOSTNAME is `localhost` here (the image uses 0.0.0.0): Next.js treats a proxy rewrite as internal only when
 * its origin equals the server's own origin, and NextURL spells every loopback address `localhost`, so a
 * server bound to 127.0.0.1 would see its own rewrites as external.
 */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

const web = join(import.meta.dirname, '..');
const standalone = join(web, '.next', 'standalone');
const server = join(standalone, 'apps', 'web', 'server.js');
const PORT = 3000 + Math.floor(Math.random() * 2000) + 1000;
const REVISION = '0123456789abcdef0123456789abcdef01234567';

interface Res {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function get(host: string, path: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = request({ host: 'localhost', port: PORT, path, method: 'GET', headers: { Host: host } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

let child: ChildProcess | undefined;
let log = '';

before(async () => {
  assert.ok(existsSync(server), `missing ${server}: run the build first`);
  // The image copies the static assets next to the server; do the same here.
  const staticDst = join(standalone, 'apps', 'web', '.next', 'static');
  if (!existsSync(staticDst)) cpSync(join(web, '.next', 'static'), staticDst, { recursive: true });
  child = spawn(process.execPath, [server], {
    env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT), HOSTNAME: 'localhost', CV_REVISION: REVISION, CV_INDEXABLE: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (d: Buffer) => (log += d.toString()));
  child.stderr?.on('data', (d: Buffer) => (log += d.toString()));
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await get('10.0.0.1', '/health')).status === 200) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server did not answer /health within 20 s\n${log}`);
});

after(() => {
  child?.kill('SIGTERM');
});

test('probes answer 200 JSON on every Host, including a pod IP', async () => {
  for (const host of ['cv.madfam.io', 'cv-app.madfam.io', 'cv-api.madfam.io', '10.0.0.1:3000', 'unknown.example']) {
    const h = await get(host, '/health');
    assert.equal(h.status, 200, host);
    assert.deepEqual(JSON.parse(h.body), { status: 'ok', service: 'cv', revision: REVISION });
    const r = await get(host, '/ready');
    assert.equal(r.status, 200, host);
    assert.equal(JSON.parse(r.body).status, 'ok');
  }
});

test('unknown Host is a plain 404 everywhere else', async () => {
  for (const path of ['/', '/robots.txt', '/api/v1/meta', '/en']) {
    const r = await get('10.0.0.1', path);
    assert.equal(r.status, 404, path);
    assert.match(String(r.headers['content-type']), /text\/plain/);
  }
});

test('landing: es and en pages, nonce CSP, noindex, canon footer', async () => {
  for (const [path, lang] of [['/', 'es-MX'], ['/en', 'en']] as const) {
    const r = await get('cv.madfam.io', path);
    assert.equal(r.status, 200, path);
    const csp = String(r.headers['content-security-policy']);
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    assert.ok(nonce, 'nonce in CSP');
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
    assert.match(r.body, new RegExp(`<html lang="${lang}"`));
    // Every script tag carries this response's nonce; no inline style attributes.
    const scripts = r.body.match(/<script\b[^>]*>/g) ?? [];
    assert.ok(scripts.length > 0);
    for (const s of scripts) assert.ok(s.includes(`nonce="${nonce}"`), s);
    assert.doesNotMatch(r.body, /\sstyle="/);
    assert.equal(r.headers['x-robots-tag'], 'noindex, nofollow');
    assert.match(r.body, /<meta name="robots" content="noindex, nofollow"/);
    assert.match(r.body, /Innovaciones MADFAM S\.A\.S\. de C\.V\./);
    assert.match(r.body, /mailto:hola@madfam\.io\?subject=/);
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
  }
});

test('landing robots allow (R40), no sitemap while noindex, unknown path is a 404 page', async () => {
  const robots = await get('cv.madfam.io', '/robots.txt');
  assert.equal(robots.status, 200);
  assert.match(robots.body, /User-agent: ClaudeBot/);
  assert.doesNotMatch(robots.body, /Disallow/);
  assert.equal((await get('cv.madfam.io', '/sitemap.xml')).status, 404);
  const missing = await get('cv.madfam.io', '/nope');
  assert.equal(missing.status, 404);
  assert.match(String(missing.headers['content-type']), /text\/html/);
});

test('app host: pre-launch shell, noindex, robots disallow', async () => {
  const r = await get('cv-app.madfam.io', '/');
  assert.equal(r.status, 200);
  assert.match(r.body, /Janua/);
  assert.equal(r.headers['x-robots-tag'], 'noindex, nofollow');
  const robots = await get('cv-app.madfam.io', '/robots.txt');
  assert.match(robots.body, /User-agent: \*\nDisallow: \//);
});

test('api host: meta, JSON 404, robots disallow, no HTML', async () => {
  const m = await get('cv-api.madfam.io', '/api/v1/meta');
  assert.equal(m.status, 200);
  assert.deepEqual(JSON.parse(m.body), { name: 'MADFAM CV', service: 'cv', version: '0.1.0', revision: REVISION, api: 'v1' });
  assert.match(String(m.headers['content-security-policy']), /default-src 'none'/);
  for (const path of ['/', '/api/v1', '/_next/static/x.js', '/h/api/v1/meta']) {
    const r = await get('cv-api.madfam.io', path);
    assert.equal(r.status, 404, path);
    assert.deepEqual(JSON.parse(r.body), { error: 'not_found' });
  }
  const robots = await get('cv-api.madfam.io', '/robots.txt');
  assert.match(robots.body, /User-agent: \*\nDisallow: \//);
});
