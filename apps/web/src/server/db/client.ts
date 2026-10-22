/**
 * The process's database pool (postgres.js + Drizzle), created lazily on first use and shared by every caller.
 *
 * - `prepare: false`: the platform PgBouncer runs `pool_mode = transaction`, where named prepared statements break.
 * - Pool max 3 per process by default (two replicas inside the cv_app role's connection limit of 8; the shared
 *   Postgres budget is 200 connections).
 * - Runtime connects with APP_DATABASE_URL (cv_app, DML only); DATABASE_URL is the owner, for migrations only
 *   (lib/auth-env.ts runtimeDatabaseUrl / migrationDatabaseUrl).
 */
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { databasePoolMax, runtimeDatabaseUrl } from '../../lib/auth-env.ts';
import * as schema from './schema.ts';

export type Db = PostgresJsDatabase<typeof schema>;
export interface DbHandle {
  db: Db;
  sql: postgres.Sql;
}

export function createDb(url: string, options: { max?: number } = {}): DbHandle {
  const sql = postgres(url, { prepare: false, max: options.max ?? 3, idle_timeout: 30, connect_timeout: 5, onnotice: () => undefined });
  return { db: drizzle(sql, { schema }), sql };
}

let shared: { url: string; handle: DbHandle } | null = null;

/** The shared handle, or null while no database is configured (data routes answer 503 not_configured). */
export function getSharedDb(env: Readonly<Record<string, string | undefined>> = process.env): DbHandle | null {
  const url = runtimeDatabaseUrl(env);
  if (!url) return null;
  if (shared && shared.url === url) return shared.handle;
  if (shared) void shared.handle.sql.end({ timeout: 5 });
  shared = { url, handle: createDb(url, { max: databasePoolMax(env) }) };
  return shared.handle;
}

/** Readiness: a cheap `select 1` bounded by a short timeout. */
export async function pingDb(handle: DbHandle, timeoutMs = 2000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`database did not answer within ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    await Promise.race([handle.sql`select 1`, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
