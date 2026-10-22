/**
 * Real-Postgres harness (`pnpm test:pg`; CI job `pg` runs it against a postgres service container).
 *
 * - CV_TEST_OWNER_URL: the database OWNER (runs the migrations, like the PreSync Job with DATABASE_URL).
 * - CV_TEST_APP_URL: the least-privilege runtime role `cv_app` (NOBYPASSRLS, DML only), like APP_DATABASE_URL.
 *   Every repository and API test runs AS cv_app, which proves the grants migration.
 * Fail closed: both variables are required (no silent skip), and the database name must end in `_test`, because
 * the harness drops the app's tables before migrating.
 */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import postgres from 'postgres';
import { createDb, type DbHandle } from '../src/server/db/client.ts';
import { runMigrations } from '../src/server/db/migrate.ts';

export function testUrls(): { owner: string; app: string } {
  const owner = process.env.CV_TEST_OWNER_URL;
  const app = process.env.CV_TEST_APP_URL;
  assert.ok(owner && app, 'CV_TEST_OWNER_URL and CV_TEST_APP_URL are required for the Postgres suite (no silent skip)');
  for (const url of [owner, app]) assert.match(new URL(url).pathname, /_test$/, 'the test database name must end in _test');
  return { owner, app };
}

/** Drops the app's tables and the migration journal, then applies the committed migrations as the owner. */
export async function resetAndMigrate(): Promise<void> {
  const { owner } = testUrls();
  const sql = postgres(owner, { max: 1, onnotice: () => undefined });
  try {
    await sql.unsafe('drop table if exists artifacts, jobs, profile_items, profiles cascade; drop schema if exists drizzle cascade;');
  } finally {
    await sql.end();
  }
  await runMigrations(owner, join(import.meta.dirname, '..', 'drizzle'));
}

/** A pool connected as cv_app (the runtime role). */
export function appDb(): DbHandle {
  return createDb(testUrls().app, { max: 2 });
}

export const A = 'janua|owner-a';
export const B = 'janua|owner-b';
