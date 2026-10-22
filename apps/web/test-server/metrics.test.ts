/**
 * The internal metrics listener over the BUILT standalone server (`pnpm build`, then `pnpm test:server`):
 *
 * - `/metrics` is NOT reachable on the app port under any public Host (landing, app, API, pages) or a pod IP: the
 *   router answers its 404 and the body carries no exposition;
 * - the metrics port answers `GET /metrics` only (any other path is a 404, whatever the Host) and its labels are
 *   route templates (no id, slug, token or query string);
 * - the structured request log carries no raw path either.
 *
 * Booted with every host configured (the pages host too) and CV_METRICS_PORT on a random port, so it runs next to
 * standalone.test.ts.
 */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { cpSync, existsSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

const web = join(import.meta.dirname, '..');
const standalone = join(web, '.next', 'standalone');
const server = join(standalone, 'apps', 'web', 'server.js');
const PORT = 6000 + Math.floor(Math.random() * 1500);
const METRICS_PORT = PORT + 1500;
const HOSTS = { landing: 'cv.madfam.io', app: 'cv-app.madfam.io', api: 'cv-api.madfam.io', pages: 'cv-p.madfam.io' } as const;

interface Res {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function call(port: number, host: string, path: string, method = 'GET'): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = request({ host: 'localhost', port, path, method, headers: { Host: host } }, (res) => {
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
let stdout = '';
let log = '';

before(async () => {
  assert.ok(existsSync(server), `missing ${server}: run the build first`);
  const staticDst = join(standalone, 'apps', 'web', '.next', 'static');
  if (!existsSync(staticDst)) cpSync(join(web, '.next', 'static'), staticDst, { recursive: true });
  child = spawn(process.execPath, [server], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORT),
      HOSTNAME: 'localhost',
      CV_METRICS_PORT: String(METRICS_PORT),
      CV_HOST_LANDING: HOSTS.landing,
      CV_HOST_APP: HOSTS.app,
      CV_HOST_API: HOSTS.api,
      CV_HOST_PAGES: HOSTS.pages,
      CV_INDEXABLE: '',
      APP_DATABASE_URL: '',
      DATABASE_URL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (d: Buffer) => {
    stdout += d.toString();
    log += d.toString();
  });
  child.stderr?.on('data', (d: Buffer) => (log += d.toString()));
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await call(PORT, '10.0.0.1', '/health')).status === 200 && (await call(METRICS_PORT, 'x', '/metrics')).status === 200) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server or metrics listener did not answer within 20 s\n${log}`);
});

after(() => {
  child?.kill('SIGTERM');
});

const scrape = async () => (await call(METRICS_PORT, '10.0.0.9:9090', '/metrics')).body;

test('/metrics is NOT reachable on the app port: cv, cv-app, cv-api, the pages host or a pod IP', async () => {
  for (const host of [...Object.values(HOSTS), '10.0.0.1', `${HOSTS.api}:443`]) {
    for (const path of ['/metrics', '/metrics/', '/metrics?x=1']) {
      for (const method of ['GET', 'HEAD']) {
        const r = await call(PORT, host, path, method);
        assert.equal(r.status, 404, `${method} ${host}${path}`);
        assert.doesNotMatch(r.body, /# TYPE|cv_http_requests_total|process_cpu/, `${host}${path}`);
      }
    }
  }
});

test('the metrics port serves GET /metrics only, whatever the Host', async () => {
  const ok = await call(METRICS_PORT, HOSTS.landing, '/metrics');
  assert.equal(ok.status, 200);
  assert.equal(ok.headers['content-type'], 'text/plain; version=0.0.4; charset=utf-8');
  for (const family of ['cv_http_requests_total', 'cv_http_request_duration_seconds', 'cv_ready', 'cv_db_readiness_checks_total', 'process_cpu_seconds_total', 'process_resident_memory_bytes', 'nodejs_eventloop_lag_p99_seconds']) {
    assert.match(ok.body, new RegExp(`# TYPE ${family} `), family);
  }
  for (const host of [...Object.values(HOSTS), '10.0.0.1']) {
    for (const path of ['/', '/en', '/health', '/ready', '/api/v1/meta', '/robots.txt', '/metricsx', '/h/landing/es']) {
      const r = await call(METRICS_PORT, host, path);
      assert.equal(r.status, 404, `${host}${path}`);
      assert.equal(r.body, 'Not Found\n');
    }
  }
  const post = await call(METRICS_PORT, HOSTS.api, '/metrics', 'POST');
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, 'GET, HEAD');
});

test('requests are counted under route templates; readiness and the database outcome are exported', async () => {
  const id = randomUUID();
  const token = randomBytes(32).toString('base64url');
  const visits: [string, string][] = [
    [HOSTS.landing, '/'],
    [HOSTS.landing, '/en?utm_source=campana-otono'],
    [HOSTS.app, `/empleos/${id}/adaptar`],
    [HOSTS.api, `/api/v1/jobs/${id}`],
    [HOSTS.api, '/api/v1/public/a/ana-garcia-cv'],
    [HOSTS.pages, '/ana-garcia-cv'],
    [HOSTS.pages, `/l/${token}`],
    ['10.0.0.1:3000', '/ready'],
  ];
  for (const [host, path] of visits) await call(PORT, host, path);
  // The finish event fires after the response is flushed; give the server a moment.
  await new Promise((r) => setTimeout(r, 200));
  const body = await scrape();
  assert.match(body, /cv_http_requests_total\{host_role="landing",route="\/",method="GET",status="200"\} [1-9]/);
  assert.match(body, /cv_http_requests_total\{host_role="landing",route="\/en",method="GET",status="200"\} [1-9]/);
  assert.match(body, /cv_http_requests_total\{host_role="app",route="\/empleos\/:id\/adaptar",method="GET",status="200"\} [1-9]/);
  assert.match(body, /cv_http_requests_total\{host_role="api",route="\/api\/v1\/jobs\/:id",method="GET",status="(401|503)"\} [1-9]/);
  assert.match(body, /cv_http_requests_total\{host_role="pages",route="\/:slug",method="GET",status="404"\} [1-9]/);
  assert.match(body, /cv_http_requests_total\{host_role="pages",route="\/l\/:token",method="GET",status="404"\} [1-9]/);
  assert.match(body, /cv_http_requests_total\{host_role="none",route="\/ready",method="GET",status="200"\} [1-9]/);
  // /metrics asked of the public hosts above: the router's 404, counted as unmatched.
  assert.match(body, /cv_http_requests_total\{host_role="api",route="unmatched",method="GET",status="404"\} [1-9]/);
  assert.match(body, /^cv_ready 1$/m);
  assert.match(body, /cv_db_readiness_checks_total\{outcome="not_configured"\} [1-9]/);
  for (const leak of [id, token, 'ana-garcia-cv', 'utm_source', 'campana-otono', '/h/']) assert.ok(!body.includes(leak), `metrics leaked ${leak}`);
  assert.match(body, /cv_metrics_dropped_samples_total\{family="cv_http_requests_total"\} 0\n/);
});

test('structured request log: JSON lines with templates only; successful probes are not logged', async () => {
  const id = randomUUID();
  await call(PORT, HOSTS.app, `/documentos/${id}?ref=correo-otono`);
  await call(PORT, '10.0.0.1', '/health');
  await new Promise((r) => setTimeout(r, 200));
  const lines = stdout
    .split('\n')
    .filter((l) => l.startsWith('{'))
    .map((l) => JSON.parse(l) as Record<string, unknown>)
    .filter((l) => l.event === 'http_request');
  assert.ok(lines.length >= 5, `read ${lines.length} request log lines`);
  assert.ok(lines.some((l) => l.host_role === 'app' && l.route === '/documentos/:id' && l.status === 200));
  assert.ok(!lines.some((l) => l.route === '/health' || l.route === '/ready'), 'successful probes are not logged');
  for (const l of lines) assert.deepEqual(Object.keys(l).sort(), ['duration_ms', 'event', 'host_role', 'level', 'method', 'route', 'status', 'ts']);
  for (const leak of [id, 'correo-otono', 'ana-garcia-cv', 'utm_source']) assert.ok(!stdout.includes(leak), `log leaked ${leak}`);
});
