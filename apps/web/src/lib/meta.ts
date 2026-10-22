/** Bodies of the probe and meta endpoints. Pure, so their shapes are unit-tested. */
import { APP_VERSION, PRODUCT_LABEL, SERVICE_NAME } from './brand.ts';
import type { Config } from './config.ts';

export interface Meta {
  name: string;
  service: string;
  version: string;
  revision: string | null;
  api: 'v1';
}

export function meta(config: Pick<Config, 'revision'>): Meta {
  return { name: PRODUCT_LABEL, service: SERVICE_NAME, version: APP_VERSION, revision: config.revision, api: 'v1' };
}

/** Liveness: a static answer with no dependency checks. */
export function health(revision: string | null): { status: 'ok'; service: string; revision: string | null } {
  return { status: 'ok', service: SERVICE_NAME, revision };
}

/**
 * Readiness, honestly: wave 1 has no dependency (no database, no identity provider, no secret), so the
 * process is ready when it serves and its configuration is valid. A configuration defect answers 503
 * with the reason, so a bad rollout never takes traffic.
 */
export function readiness(load: () => Config): { status: number; body: Record<string, unknown> } {
  try {
    load();
    return { status: 200, body: { status: 'ok', service: SERVICE_NAME, checks: { config: 'ok' }, dependencies: [] } };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { status: 503, body: { status: 'unavailable', service: SERVICE_NAME, checks: { config: reason } } };
  }
}
