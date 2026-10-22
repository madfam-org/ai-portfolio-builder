/**
 * Observability for the one cv process (started by src/instrumentation.ts, Node runtime only):
 *
 * 1. A SEPARATE listener on CV_METRICS_PORT (default 9090) that serves `GET /metrics` and nothing else. The public
 *    hosts reach the app port (3000) through Service `cv`:80 only; this port is on no Service and no tunnel route,
 *    and the NetworkPolicy admits it from the monitoring namespace only (infra/k8s/production). The app port has no
 *    /metrics route at all: on every public host it is the router's 404 (test-server/metrics.test.ts proves both).
 * 2. Request counting and one structured JSON log line per request, from Node's own `http.server.*` diagnostics
 *    channels: every response the server writes is seen once, whether the proxy or a route answered it, with no
 *    patching of Next.js. The listener above is excluded.
 *
 * The log line carries the host role, route TEMPLATE, method, status and duration. Never the raw path or query
 * (ids, slugs and share tokens live there), headers, cookies, tokens, the client address or the owner's `sub`.
 * Successful probes and build assets are counted but not logged (the kubelet alone would be most of the log).
 */
import { subscribe } from 'node:diagnostics_channel';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { getConfig, type Config } from '../lib/config.ts';
import { getMetrics, methodLabel, type CvMetrics } from './metrics.ts';
import { processCollector } from './metrics-process.ts';
import { routeLabels } from './metrics-route.ts';

export const DEFAULT_METRICS_PORT = 9090;

type Env = Readonly<Record<string, string | undefined>>;

/** CV_METRICS_PORT: unset or empty → 9090; "off" → no listener (tests only); else an integer 1-65535. Throws on junk. */
export function metricsPort(env: Env): number | null {
  const raw = env.CV_METRICS_PORT;
  if (raw === undefined || raw === '') return DEFAULT_METRICS_PORT;
  if (raw === 'off') return null;
  if (!/^[0-9]{1,5}$/.test(raw) || Number(raw) < 1 || Number(raw) > 65535) {
    throw new Error(`cv config: CV_METRICS_PORT must be a port 1-65535 or "off" (got ${JSON.stringify(raw)})`);
  }
  if (raw === env.PORT) throw new Error('cv config: CV_METRICS_PORT must differ from PORT (the public app port)');
  return Number(raw);
}

export interface RequestLogLine {
  ts: string;
  level: 'info' | 'warn' | 'error';
  event: 'http_request';
  host_role: string;
  route: string;
  method: string;
  status: number;
  duration_ms: number;
}

/** The structured log line for one request (pure; test/metrics.test.ts checks it carries nothing else). */
export function requestLogLine(at: Date, labels: { hostRole: string; route: string }, method: string, status: number, seconds: number): RequestLogLine {
  return {
    ts: at.toISOString(),
    level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
    event: 'http_request',
    host_role: labels.hostRole,
    route: labels.route,
    method,
    status,
    duration_ms: Math.round(seconds * 1e4) / 10,
  };
}

/** Serves /metrics only: GET/HEAD → 200 exposition; another method → 405; any other path → 404. */
export function metricsHandler(metrics: CvMetrics): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    const path = (req.url ?? '').split('?')[0];
    if (path !== '/metrics') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end('Not Found\n');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' }).end('Method Not Allowed\n');
      return;
    }
    const body = metrics.render();
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  };
}

function configOrNull(): Config | null {
  try {
    return getConfig();
  } catch {
    return null;
  }
}

interface Started {
  host: string | undefined;
  url: string | undefined;
  method: string | undefined;
  t0: bigint;
}

const STATE = Symbol.for('cv.observability.started.v1');

/**
 * Starts request instrumentation and the metrics listener, once per process. An invalid CV_METRICS_PORT stops the
 * server (fail visible, like every other configuration error); a listener that cannot bind logs the reason and the
 * app keeps serving (the scrape then fails, and CVTargetDown says so).
 */
export function startObservability(env: Env = process.env): void {
  const g = globalThis as { [STATE]?: true };
  if (g[STATE]) return;
  g[STATE] = true;

  let port: number | null;
  try {
    port = metricsPort(env);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const metrics = getMetrics();
  const proc = processCollector();
  metrics.addCollector(() => proc.collect());

  let listener: Server | null = null;
  const started = new WeakMap<IncomingMessage, Started>();

  subscribe('http.server.request.start', (message) => {
    const { request, server } = message as { request: IncomingMessage; server: Server };
    if (server === listener) return;
    // Read before Next.js handles the request (rewrites may change request.url later).
    started.set(request, { host: request.headers.host, url: request.url, method: request.method, t0: process.hrtime.bigint() });
  });

  subscribe('http.server.response.finish', (message) => {
    const { request, response, server } = message as { request: IncomingMessage; response: ServerResponse; server: Server };
    if (server === listener) return;
    const s = started.get(request);
    if (!s) return;
    started.delete(request);
    const seconds = Number(process.hrtime.bigint() - s.t0) / 1e9;
    const labels = routeLabels(s.host, s.url, configOrNull());
    const status = response.statusCode;
    const method = s.method ?? 'OTHER';
    metrics.recordRequest({ hostRole: labels.hostRole, route: labels.route, method, status, seconds });
    if (labels.quiet && status < 400) return;
    const line = requestLogLine(new Date(), labels, methodLabel(method), status, seconds);
    process.stdout.write(`${JSON.stringify(line)}\n`);
  });

  if (port === null) {
    console.warn('cv metrics: listener off (CV_METRICS_PORT=off)');
    return;
  }
  const bind = env.HOSTNAME || '0.0.0.0';
  listener = createServer(metricsHandler(metrics));
  listener.headersTimeout = 5_000;
  listener.requestTimeout = 10_000;
  listener.on('error', (err: NodeJS.ErrnoException) => {
    console.error(`cv metrics: listener on ${bind}:${port} failed: ${err.code ?? err.message}`);
  });
  listener.listen(port, bind, () => {
    console.warn(`cv metrics: serving GET /metrics on ${bind}:${port} (not routed by any public host)`);
  });
}

