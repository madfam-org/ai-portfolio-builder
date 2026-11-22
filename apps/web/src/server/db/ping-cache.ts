/**
 * `/ready` answers on every Host (lib/meta.ts readiness), publicly. One database ping serves every readiness answer
 * for a short while: callers that arrive while a ping runs wait for that ping, and a result (success or failure) is
 * reused for `ttlMs`. A burst of public `/ready` requests then costs one `select 1`, never a queue on the small pool
 * the kubelet's own probe needs. The TTL (2 s in production) stays well under the readiness period (10 s,
 * infra/k8s/production/deployment.yaml), so a failing database still fails the next probe.
 */
export type Ping = () => Promise<void>;

export function createPingCache(ttlMs: number, now: () => number = () => Date.now()): (ping: Ping) => Promise<void> {
  let last: { at: number; error: unknown } | null = null;
  let inflight: Promise<void> | null = null;
  return async (ping) => {
    if (!last || now() - last.at >= ttlMs) {
      inflight ??= ping().then(
        () => {
          last = { at: now(), error: null };
        },
        (error: unknown) => {
          last = { at: now(), error: error ?? new Error('database ping failed') };
        },
      ).finally(() => {
        inflight = null;
      });
      await inflight;
    }
    if (last?.error) throw last.error;
  };
}

/** The process-wide cache the readiness route uses. */
export const READY_PING_TTL_MS = 2_000;
export const cachedReadyPing = createPingCache(READY_PING_TTL_MS);
