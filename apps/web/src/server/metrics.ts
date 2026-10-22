/**
 * cv's Prometheus metrics: a small dependency-free registry and the text exposition format 0.0.4.
 *
 * Why not prom-client: it is deprecated upstream (2026, "replaced by @prometheus-io/client", a 0.x line), and this
 * process needs one counter, one histogram, two gauges and the process basics. Everything here is plain arithmetic
 * over Maps, unit-tested in test/metrics.test.ts.
 *
 * Cardinality is bounded BY CONSTRUCTION: `route` is a template from the route tables (server/metrics-route.ts),
 * never a raw path, id, slug or token; `method` is one of a fixed set; `host_role` is a host-table role or `none`.
 * As a second fence every family refuses new series past MAX_SERIES and counts the refusal in
 * cv_metrics_dropped_samples_total (fail visible: a non-zero value means a label escaped its template).
 *
 * ONE registry per process, on globalThis: Next.js bundles the instrumentation hook and each route separately, so a
 * module-level singleton would exist once per bundle and the /ready route would write to a registry nobody serves.
 */

type LabelValues = readonly string[];

export const HTTP_BUCKETS: readonly number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
export const MAX_SERIES = 2000;

export const HTTP_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

/** A method label from a fixed set: anything else (or a missing method) is OTHER. */
export function methodLabel(method: string | undefined): string {
  const m = (method ?? '').toUpperCase();
  return HTTP_METHODS.has(m) ? m : 'OTHER';
}

/** Escapes a label value per the exposition format (backslash, double quote, newline). */
export function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/** Formats a sample value: integers stay integers, +Inf/-Inf/NaN use the format's spelling. */
export function formatValue(v: number): string {
  if (Number.isNaN(v)) return 'NaN';
  if (v === Infinity) return '+Inf';
  if (v === -Infinity) return '-Inf';
  return String(v);
}

function labelPairs(names: readonly string[], values: LabelValues, extra = ''): string {
  const pairs = names.map((n, i) => `${n}="${escapeLabel(values[i] ?? '')}"`);
  if (extra) pairs.push(extra);
  return pairs.length ? `{${pairs.join(',')}}` : '';
}

function header(name: string, help: string, type: 'counter' | 'gauge' | 'histogram'): string {
  return `# HELP ${name} ${help.replace(/\\/g, '\\\\').replace(/\n/g, '\\n')}\n# TYPE ${name} ${type}\n`;
}

/** A labelled counter or gauge family. */
export class Scalar {
  readonly name: string;
  readonly help: string;
  readonly type: 'counter' | 'gauge';
  readonly labelNames: readonly string[];
  private readonly series = new Map<string, { values: LabelValues; value: number }>();
  private readonly onDrop: () => void;

  constructor(name: string, help: string, type: 'counter' | 'gauge', labelNames: readonly string[], onDrop: () => void = () => undefined) {
    this.name = name;
    this.help = help;
    this.type = type;
    this.labelNames = labelNames;
    this.onDrop = onDrop;
  }

  private slot(values: LabelValues): { values: LabelValues; value: number } | null {
    if (values.length !== this.labelNames.length) throw new Error(`${this.name}: expected ${this.labelNames.length} label values`);
    const key = values.join('\u0000');
    let s = this.series.get(key);
    if (!s) {
      if (this.series.size >= MAX_SERIES) {
        this.onDrop();
        return null;
      }
      s = { values: [...values], value: 0 };
      this.series.set(key, s);
    }
    return s;
  }

  inc(values: LabelValues = [], by = 1): void {
    if (this.type === 'counter' && by < 0) throw new Error(`${this.name}: a counter only goes up`);
    const s = this.slot(values);
    if (s) s.value += by;
  }

  set(values: LabelValues, value: number): void {
    if (this.type !== 'gauge') throw new Error(`${this.name}: only a gauge is set`);
    const s = this.slot(values);
    if (s) s.value = value;
  }

  get(values: LabelValues = []): number | undefined {
    return this.series.get(values.join('\u0000'))?.value;
  }

  get size(): number {
    return this.series.size;
  }

  render(): string {
    let out = header(this.name, this.help, this.type);
    for (const s of this.series.values()) out += `${this.name}${labelPairs(this.labelNames, s.values)} ${formatValue(s.value)}\n`;
    return out;
  }
}

/** A labelled histogram family with fixed upper bounds. */
export class Histogram {
  readonly name: string;
  readonly help: string;
  readonly labelNames: readonly string[];
  readonly buckets: readonly number[];
  private readonly series = new Map<string, { values: LabelValues; counts: number[]; sum: number; count: number }>();
  private readonly onDrop: () => void;

  constructor(name: string, help: string, labelNames: readonly string[], buckets: readonly number[], onDrop: () => void = () => undefined) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
    this.buckets = [...buckets].sort((a, b) => a - b);
    this.onDrop = onDrop;
  }

  observe(values: LabelValues, v: number): void {
    if (values.length !== this.labelNames.length) throw new Error(`${this.name}: expected ${this.labelNames.length} label values`);
    if (!Number.isFinite(v) || v < 0) return;
    const key = values.join('\u0000');
    let s = this.series.get(key);
    if (!s) {
      if (this.series.size >= MAX_SERIES) {
        this.onDrop();
        return;
      }
      s = { values: [...values], counts: this.buckets.map(() => 0), sum: 0, count: 0 };
      this.series.set(key, s);
    }
    // Non-cumulative per bucket here; cumulated when rendered.
    const i = this.buckets.findIndex((b) => v <= b);
    if (i !== -1) s.counts[i]! += 1;
    s.sum += v;
    s.count += 1;
  }

  get size(): number {
    return this.series.size;
  }

  render(): string {
    let out = header(this.name, this.help, 'histogram');
    for (const s of this.series.values()) {
      let cumulative = 0;
      this.buckets.forEach((b, i) => {
        cumulative += s.counts[i]!;
        out += `${this.name}_bucket${labelPairs(this.labelNames, s.values, `le="${formatValue(b)}"`)} ${cumulative}\n`;
      });
      out += `${this.name}_bucket${labelPairs(this.labelNames, s.values, 'le="+Inf"')} ${s.count}\n`;
      out += `${this.name}_sum${labelPairs(this.labelNames, s.values)} ${formatValue(s.sum)}\n`;
      out += `${this.name}_count${labelPairs(this.labelNames, s.values)} ${s.count}\n`;
    }
    return out;
  }
}

export interface RequestSample {
  hostRole: string;
  route: string;
  method: string;
  status: number;
  seconds: number;
}

/** What /ready found: overall readiness and the database check's outcome (absent when it did not run). */
export interface ReadinessSample {
  ready: boolean;
  database: 'ok' | 'error' | 'not_configured' | null;
}

export interface CvMetrics {
  recordRequest(sample: RequestSample): void;
  recordReadiness(sample: ReadinessSample): void;
  /** Adds a renderer of extra families (the process metrics); called on every scrape. */
  addCollector(collect: () => string): void;
  render(): string;
  readonly families: {
    requests: Scalar;
    duration: Histogram;
    ready: Scalar;
    dbChecks: Scalar;
    dropped: Scalar;
  };
}

/** A fresh registry (tests); the process uses getMetrics(). */
export function createMetrics(): CvMetrics {
  const dropped = new Scalar('cv_metrics_dropped_samples_total', 'Samples refused because a family reached its series cap (a label escaped its template).', 'counter', ['family']);
  const drop = (family: string) => () => dropped.inc([family]);
  const requests = new Scalar('cv_http_requests_total', 'HTTP requests answered by the cv server, by host role, route template, method and status.', 'counter', ['host_role', 'route', 'method', 'status'], drop('cv_http_requests_total'));
  const duration = new Histogram('cv_http_request_duration_seconds', 'Time from request start to the last byte of the response, by host role, route template and method.', ['host_role', 'route', 'method'], HTTP_BUCKETS, drop('cv_http_request_duration_seconds'));
  const ready = new Scalar('cv_ready', '1 when the last /ready evaluation in this process answered 200, else 0 (0 until the first probe).', 'gauge', []);
  const dbChecks = new Scalar('cv_db_readiness_checks_total', 'Outcomes of the readiness database check (select 1 within 2 s): ok, error, not_configured.', 'counter', ['outcome']);
  ready.set([], 0);
  for (const outcome of ['ok', 'error', 'not_configured']) dbChecks.inc([outcome], 0);
  dropped.inc(['cv_http_requests_total'], 0);
  const collectors: (() => string)[] = [];

  return {
    families: { requests, duration, ready, dbChecks, dropped },
    recordRequest({ hostRole, route, method, status, seconds }) {
      const m = methodLabel(method);
      requests.inc([hostRole, route, m, String(status)]);
      duration.observe([hostRole, route, m], seconds);
    },
    recordReadiness({ ready: ok, database }) {
      ready.set([], ok ? 1 : 0);
      if (database) dbChecks.inc([database]);
    },
    addCollector(collect) {
      collectors.push(collect);
    },
    render() {
      let out = requests.render() + duration.render() + ready.render() + dbChecks.render() + dropped.render();
      for (const collect of collectors) {
        try {
          out += collect();
        } catch (err) {
          console.error(`cv metrics: collector failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      return out;
    },
  };
}

const KEY = Symbol.for('cv.metrics.registry.v1');

/** The process registry (one per process, shared across Next.js bundles through globalThis). */
export function getMetrics(): CvMetrics {
  const g = globalThis as { [KEY]?: CvMetrics };
  if (!g[KEY]) g[KEY] = createMetrics();
  return g[KEY];
}

/**
 * Maps a /ready result to a readiness sample: `checks.database` is "ok", "not_configured" or "unavailable: <reason>"
 * (lib/meta.ts readiness), and is absent when the configuration itself failed.
 */
export function readinessSample(status: number, body: { checks?: Record<string, unknown> }): ReadinessSample {
  const db = body.checks?.database;
  const database = db === undefined ? null : db === 'ok' ? 'ok' : db === 'not_configured' ? 'not_configured' : 'error';
  return { ready: status === 200, database };
}
