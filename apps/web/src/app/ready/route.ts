import { getConfig } from '@/lib/config';
import { readiness } from '@/lib/meta';
import { getSharedDb, pingDb } from '@/server/db/client';
import { cachedReadyPing } from '@/server/db/ping-cache';
import { getMetrics, readinessSample } from '@/server/metrics';

export const dynamic = 'force-dynamic';

/**
 * Readiness on ANY Host (lib/meta.ts readiness): 503 on an invalid configuration, or when a configured database
 * (APP_DATABASE_URL in production) does not answer `select 1` within 2 s. Unconfigured dependencies do not block.
 * One ping serves every answer for 2 s (server/db/ping-cache.ts): public /ready traffic never queues on the pool.
 */
export async function GET(): Promise<Response> {
  let handle: ReturnType<typeof getSharedDb> = null;
  let poolError: string | null = null;
  try {
    handle = getSharedDb(process.env);
  } catch (err) {
    poolError = err instanceof Error ? err.message : String(err);
  }
  const { status, body } = await readiness(getConfig, {
    env: process.env,
    pingDatabase: poolError
      ? async () => {
          throw new Error(poolError ?? 'database pool');
        }
      : handle
        ? () => cachedReadyPing(() => pingDb(handle!))
        : null,
  });
  // cv_ready and cv_db_readiness_checks_total (server/metrics.ts), served on the internal metrics port only.
  getMetrics().recordReadiness(readinessSample(status, body));
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
