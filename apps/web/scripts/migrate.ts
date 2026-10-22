/** `pnpm db:migrate`: applies apps/web/drizzle to DIRECT_DATABASE_URL ?? DATABASE_URL (the owner role). */
import { join } from 'node:path';
import { migrationDatabaseUrl } from '../src/lib/auth-env.ts';
import { runMigrations } from '../src/server/db/migrate.ts';

const url = migrationDatabaseUrl(process.env);
if (!url) {
  console.error('db:migrate: set DIRECT_DATABASE_URL or DATABASE_URL (the database owner role)');
  process.exit(1);
}
try {
  await runMigrations(url, join(import.meta.dirname, '..', 'drizzle'));
  console.warn('db:migrate: migrations applied');
} catch (err) {
  // Never print the URL or bound parameters.
  console.error(`db:migrate: failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
