import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_SERIES, Histogram, Scalar, createMetrics, escapeLabel, getMetrics, methodLabel, readinessSample } from '../src/server/metrics.ts';
import { processCollector } from '../src/server/metrics-process.ts';
import { metricsPort, requestLogLine } from '../src/server/metrics-server.ts';

test('exposition: counters, gauges and a cumulative histogram in format 0.0.4', () => {
  const m = createMetrics();
  m.recordRequest({ hostRole: 'api', route: '/api/v1/meta', method: 'get', status: 200, seconds: 0.004 });
  m.recordRequest({ hostRole: 'api', route: '/api/v1/meta', method: 'GET', status: 200, seconds: 0.3 });
  m.recordRequest({ hostRole: 'app', route: '/', method: 'BREW', status: 500, seconds: 20 });
  const out = m.render();
  assert.match(out, /# TYPE cv_http_requests_total counter\n/);
  assert.match(out, /cv_http_requests_total\{host_role="api",route="\/api\/v1\/meta",method="GET",status="200"\} 2\n/);
  assert.match(out, /cv_http_requests_total\{host_role="app",route="\/",method="OTHER",status="500"\} 1\n/);
  assert.match(out, /cv_http_request_duration_seconds_bucket\{host_role="api",route="\/api\/v1\/meta",method="GET",le="0.005"\} 1\n/);
  assert.match(out, /cv_http_request_duration_seconds_bucket\{host_role="api",route="\/api\/v1\/meta",method="GET",le="0.5"\} 2\n/);
  assert.match(out, /cv_http_request_duration_seconds_bucket\{host_role="app",route="\/",method="OTHER",le="10"\} 0\n/);
  assert.match(out, /cv_http_request_duration_seconds_bucket\{host_role="app",route="\/",method="OTHER",le="\+Inf"\} 1\n/);
  assert.match(out, /cv_http_request_duration_seconds_count\{host_role="api",route="\/api\/v1\/meta",method="GET"\} 2\n/);
  assert.match(out, /cv_http_request_duration_seconds_sum\{host_role="api",route="\/api\/v1\/meta",method="GET"\} 0.304\n/);
  // Initial values exist before anything happens, so rate() and == 0 rules have a series to read.
  assert.match(out, /^cv_ready 0$/m);
  for (const o of ['ok', 'error', 'not_configured']) assert.match(out, new RegExp(`cv_db_readiness_checks_total\\{outcome="${o}"\\} 0\\n`));
  assert.match(out, /cv_metrics_dropped_samples_total\{family="cv_http_requests_total"\} 0\n/);
  // Every sample line is `name{labels} value` or `name value`.
  for (const line of out.split('\n').filter((l) => l && !l.startsWith('#'))) {
    assert.match(line, /^[a-z_:][a-z0-9_:]*(\{[^}]*\})? (-?[0-9.e+-]+|\+Inf|NaN)$/, line);
  }
});

test('readiness: the gauge follows /ready and the database outcome is counted', () => {
  const m = createMetrics();
  m.recordReadiness(readinessSample(200, { checks: { config: 'ok', database: 'ok' } }));
  assert.equal(m.families.ready.get(), 1);
  m.recordReadiness(readinessSample(503, { checks: { config: 'ok', database: 'unavailable: database did not answer within 2000 ms' } }));
  assert.equal(m.families.ready.get(), 0);
  m.recordReadiness(readinessSample(200, { checks: { config: 'ok', database: 'not_configured' } }));
  m.recordReadiness(readinessSample(503, { checks: { config: 'cv config: bad host' } }));
  assert.equal(m.families.dbChecks.get(['ok']), 1);
  assert.equal(m.families.dbChecks.get(['error']), 1);
  assert.equal(m.families.dbChecks.get(['not_configured']), 1);
  assert.equal(m.families.ready.get(), 0);
  // The reason text never becomes a label.
  assert.doesNotMatch(m.render(), /did not answer/);
});

test('series cap: a family refuses new series past MAX_SERIES and counts the refusal', () => {
  const m = createMetrics();
  for (let i = 0; i < MAX_SERIES + 5; i += 1) m.recordRequest({ hostRole: 'api', route: `/r${i}`, method: 'GET', status: 200, seconds: 0.01 });
  assert.equal(m.families.requests.size, MAX_SERIES);
  assert.equal(m.families.duration.size, MAX_SERIES);
  assert.equal(m.families.dropped.get(['cv_http_requests_total']), 5);
  assert.equal(m.families.dropped.get(['cv_http_request_duration_seconds']), 5);
});

test('label escaping, method set, counter monotonicity, gauge-only set', () => {
  assert.equal(escapeLabel('a"b\\c\nd'), 'a\\"b\\\\c\\nd');
  assert.equal(methodLabel('patch'), 'PATCH');
  assert.equal(methodLabel(undefined), 'OTHER');
  assert.equal(methodLabel('PROPFIND'), 'OTHER');
  const c = new Scalar('x_total', 'x', 'counter', []);
  assert.throws(() => c.inc([], -1));
  assert.throws(() => c.set([], 1));
  assert.throws(() => c.inc(['extra']));
  const h = new Histogram('h_seconds', 'h', [], [1, 0.1]);
  h.observe([], -1);
  h.observe([], Number.NaN);
  assert.equal(h.size, 0);
  h.observe([], 0.05);
  assert.match(h.render(), /h_seconds_bucket\{le="0.1"\} 1\nh_seconds_bucket\{le="1"\} 1\n/);
});

test('one registry per process, shared through globalThis', () => {
  assert.equal(getMetrics(), getMetrics());
  assert.equal((globalThis as Record<symbol, unknown>)[Symbol.for('cv.metrics.registry.v1')], getMetrics());
});

test('process metrics use the standard names', () => {
  const p = processCollector(10);
  try {
    const out = p.collect();
    for (const name of ['process_cpu_user_seconds_total', 'process_cpu_seconds_total', 'process_resident_memory_bytes', 'process_start_time_seconds', 'nodejs_heap_size_used_bytes', 'nodejs_eventloop_lag_p99_seconds']) {
      assert.match(out, new RegExp(`^${name} [0-9.e+-]+$`, 'm'), name);
    }
    assert.match(out, /^nodejs_version_info\{version="v[0-9.]+"\} 1$/m);
  } finally {
    p.stop();
  }
});

test('CV_METRICS_PORT: default 9090, "off", a port, never the app port, never junk', () => {
  assert.equal(metricsPort({}), 9090);
  assert.equal(metricsPort({ CV_METRICS_PORT: '' }), 9090);
  assert.equal(metricsPort({ CV_METRICS_PORT: 'off' }), null);
  assert.equal(metricsPort({ CV_METRICS_PORT: '19090', PORT: '3000' }), 19090);
  for (const bad of ['0', '65536', '9090x', '-1', ' 9090', 'on']) assert.throws(() => metricsPort({ CV_METRICS_PORT: bad }), /CV_METRICS_PORT/, bad);
  assert.throws(() => metricsPort({ CV_METRICS_PORT: '3000', PORT: '3000' }), /differ from PORT/);
});

test('request log line: the template and outcome only, nothing a person or a token could be read from', () => {
  const line = requestLogLine(new Date('2026-10-22T12:00:00Z'), { hostRole: 'pages', route: '/l/:token' }, 'GET', 503, 0.12345);
  assert.deepEqual(line, { ts: '2026-10-22T12:00:00.000Z', level: 'error', event: 'http_request', host_role: 'pages', route: '/l/:token', method: 'GET', status: 503, duration_ms: 123.5 });
  assert.equal(requestLogLine(new Date(), { hostRole: 'api', route: '/x' }, 'GET', 404, 0).level, 'warn');
  assert.equal(requestLogLine(new Date(), { hostRole: 'api', route: '/x' }, 'GET', 200, 0).level, 'info');
  assert.deepEqual(Object.keys(line).sort(), ['duration_ms', 'event', 'host_role', 'level', 'method', 'route', 'status', 'ts']);
});
