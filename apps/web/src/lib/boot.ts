import { migrationDatabaseUrl, missingSignInEnv, SIGN_IN_ENV_KEYS } from './auth-env.ts';
import { loadConfig } from './config.ts';

/** Validates the environment once at server start; exits non-zero with the reason when it is invalid. */
export function validateOrExit(): void {
  try {
    const config = loadConfig(process.env);
    const hosts = Object.entries(config.hosts)
      .map(([role, host]) => `${role}=${host}`)
      .join(' ');
    const missing = missingSignInEnv(process.env);
    const signIn = missing.length === 0 ? 'on' : missing.length === SIGN_IN_ENV_KEYS.length ? 'off (not configured)' : `off (missing ${missing.join(', ')})`;
    const db = process.env.APP_DATABASE_URL ? 'configured' : 'not configured';
    console.warn(`cv: serving ${hosts} indexable=${config.indexable} revision=${config.revision ?? 'unset'} sign-in=${signIn} database=${db}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

/** CV_MIGRATE_AND_EXIT=true: apply migrations as the owner role and exit (the PreSync Job). Otherwise a no-op. */
export async function migrateAndExitIfAsked(): Promise<void> {
  if (process.env.CV_MIGRATE_AND_EXIT !== 'true') return;
  const url = migrationDatabaseUrl(process.env);
  if (!url) {
    console.error('cv migrate: DATABASE_URL (or DIRECT_DATABASE_URL) is not set');
    process.exit(1);
  }
  try {
    const { defaultMigrationsFolder, runMigrations } = await import('../server/db/migrate.ts');
    await runMigrations(url, defaultMigrationsFolder());
    console.warn('cv migrate: migrations applied');
    process.exit(0);
  } catch (err) {
    console.error(`cv migrate: failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
