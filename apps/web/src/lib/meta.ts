/** Bodies of the probe and meta endpoints. Pure, so their shapes are unit-tested. */
import { APP_VERSION, PRODUCT_LABEL, SERVICE_NAME } from './brand.ts';
import { SIGN_IN_ENV_KEYS, missingSignInEnv } from './auth-env.ts';
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

type Env = Readonly<Record<string, string | undefined>>;

export interface ReadinessDeps {
  env: Env;
  /** Pings the runtime database; null while no database URL is configured. */
  pingDatabase: (() => Promise<void>) | null;
}

/**
 * Readiness, honestly and fail-closed:
 * - an invalid configuration answers 503 with the reason, so a bad rollout never takes traffic;
 * - a dependency that is NOT configured is reported and does not block (the dormant default: the landing keeps
 *   serving while sign-in and data wait for their settings);
 * - a dependency that IS configured must answer: the database gets a bounded `select 1`, and a failure is a 503.
 * - Janua is NOT pinged: its JWKS is fetched lazily and cached, and an identity-provider outage must not take the
 *   landing down; the API answers 503 per request instead (fail closed there, R106).
 * Partial sign-in settings are reported by name (never value) and leave sign-in off.
 */
export async function readiness(load: () => Config, deps: ReadinessDeps = { env: {}, pingDatabase: null }): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    load();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { status: 503, body: { status: 'unavailable', service: SERVICE_NAME, checks: { config: reason } } };
  }
  const missing = missingSignInEnv(deps.env);
  const signIn = missing.length === 0 ? 'configured' : missing.length === SIGN_IN_ENV_KEYS.length ? 'not_configured' : { incomplete: missing };
  let database: string = 'not_configured';
  let ok = true;
  if (deps.pingDatabase) {
    try {
      await deps.pingDatabase();
      database = 'ok';
    } catch (err) {
      ok = false;
      database = `unavailable: ${err instanceof Error ? err.message.slice(0, 200) : 'error'}`;
    }
  }
  const dependencies = deps.pingDatabase ? ['postgres'] : [];
  return {
    status: ok ? 200 : 503,
    body: { status: ok ? 'ok' : 'unavailable', service: SERVICE_NAME, checks: { config: 'ok', signIn, database }, dependencies },
  };
}
