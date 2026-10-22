/**
 * The process basics, under the names Prometheus' own clients use (process_*, nodejs_*), so the estate's existing
 * dashboards and queries read them unchanged. Rendered on every scrape from Node's own counters; the event-loop
 * delay is a 60 s window (perf_hooks.monitorEventLoopDelay), reset on an unref'd timer so it never holds the
 * process open.
 */
import { readdirSync } from 'node:fs';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { formatValue } from './metrics.ts';

function gauge(name: string, help: string, value: number, labels = ''): string {
  return `# HELP ${name} ${help}\n# TYPE ${name} gauge\n${name}${labels} ${formatValue(value)}\n`;
}

function counter(name: string, help: string, value: number): string {
  return `# HELP ${name} ${help}\n# TYPE ${name} counter\n${name} ${formatValue(value)}\n`;
}

/** Open file descriptors (Linux only: /proc/self/fd); null elsewhere. */
function openFds(): number | null {
  if (process.platform !== 'linux') return null;
  try {
    return readdirSync('/proc/self/fd').length;
  } catch {
    return null;
  }
}

export interface ProcessCollector {
  collect(): string;
  stop(): void;
}

export function processCollector(windowMs = 60_000): ProcessCollector {
  const startSeconds = Math.round(Date.now() / 1000 - process.uptime());
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  let last = { p50: 0, p99: 0, max: 0 };
  const roll = () => {
    // Values are nanoseconds; NaN/0 before the first sample.
    const seconds = (ns: number) => (Number.isFinite(ns) ? ns / 1e9 : 0);
    last = { p50: seconds(delay.percentile(50)), p99: seconds(delay.percentile(99)), max: seconds(delay.max) };
    delay.reset();
  };
  const timer = setInterval(roll, windowMs);
  timer.unref();

  return {
    collect() {
      const cpu = process.cpuUsage();
      const mem = process.memoryUsage();
      const user = cpu.user / 1e6;
      const system = cpu.system / 1e6;
      let out = '';
      out += counter('process_cpu_user_seconds_total', 'Total user CPU time spent in seconds.', user);
      out += counter('process_cpu_system_seconds_total', 'Total system CPU time spent in seconds.', system);
      out += counter('process_cpu_seconds_total', 'Total user and system CPU time spent in seconds.', user + system);
      out += gauge('process_start_time_seconds', 'Start time of the process since unix epoch in seconds.', startSeconds);
      out += gauge('process_resident_memory_bytes', 'Resident memory size in bytes.', mem.rss);
      const fds = openFds();
      if (fds !== null) out += gauge('process_open_fds', 'Number of open file descriptors.', fds);
      out += gauge('nodejs_heap_size_total_bytes', 'Process heap size from Node.js in bytes.', mem.heapTotal);
      out += gauge('nodejs_heap_size_used_bytes', 'Process heap size used from Node.js in bytes.', mem.heapUsed);
      out += gauge('nodejs_external_memory_bytes', 'Node.js external memory size in bytes.', mem.external);
      out += gauge('nodejs_eventloop_lag_p50_seconds', 'The 50th percentile of the event loop delay over the last window.', last.p50);
      out += gauge('nodejs_eventloop_lag_p99_seconds', 'The 99th percentile of the event loop delay over the last window.', last.p99);
      out += gauge('nodejs_eventloop_lag_max_seconds', 'The maximum event loop delay over the last window.', last.max);
      out += gauge('nodejs_version_info', 'Node.js version info.', 1, `{version="${process.version}"}`);
      return out;
    },
    stop() {
      clearInterval(timer);
      delay.disable();
    },
  };
}
