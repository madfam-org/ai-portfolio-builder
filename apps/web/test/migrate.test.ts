import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeMigrationError, isTransientMigrationError, runMigrationsWithRetry } from '../src/server/db/migrate.ts';

/** The shape drizzle throws: a wrapper whose `cause` is the Postgres (or socket) error. */
function wrapped(cause: Record<string, unknown>): Error {
  const err = new Error('Failed query: CREATE SCHEMA IF NOT EXISTS "drizzle"\nparams: ');
  Object.assign(err, { cause: Object.assign(new Error(String(cause.message ?? 'boom')), cause) });
  return err;
}

test('describeMigrationError surfaces the Postgres SQLSTATE, message and hint behind the drizzle wrapper', () => {
  const line = describeMigrationError(
    wrapped({ code: '42501', severity: 'ERROR', message: 'permission denied for database cv', routine: 'aclcheck_error' }),
  );
  assert.match(line, /^Failed query: CREATE SCHEMA IF NOT EXISTS "drizzle" \| cause: /);
  assert.match(line, /code="42501"/);
  assert.match(line, /message="permission denied for database cv"/);
  assert.match(line, /routine="aclcheck_error"/);
  assert.doesNotMatch(line, /params:/, 'only the first line of the wrapper message');
});

test('describeMigrationError never prints a connection URL it was not given, and degrades for plain errors', () => {
  assert.equal(describeMigrationError(new Error('plain failure')), 'plain failure');
  assert.equal(describeMigrationError('a string'), 'a string');
  const line = describeMigrationError(wrapped({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 10.43.0.10:6432' }));
  assert.doesNotMatch(line, /postgres(ql)?:\/\//);
});

test('isTransientMigrationError: connection-class and lock/serialization codes retry; permissions and syntax do not', () => {
  for (const code of ['08006', '08001', '57P01', '57P03', '53300', '55P03', '40001', '40P01', 'ECONNRESET', 'CONNECTION_CLOSED']) {
    assert.equal(isTransientMigrationError(wrapped({ code })), true, code);
  }
  for (const code of ['42501', '42P07', '23505', '42601', '']) {
    assert.equal(isTransientMigrationError(wrapped({ code })), false, code || '(none)');
  }
  assert.equal(isTransientMigrationError(new Error('no cause')), false);
});

test('runMigrationsWithRetry retries transient failures, then succeeds; logs every failed attempt', async () => {
  const lines: string[] = [];
  let calls = 0;
  await runMigrationsWithRetry('postgres://unused', '/unused', {
    attempts: 4,
    baseDelayMs: 1,
    log: (l) => lines.push(l),
    run: async () => {
      calls += 1;
      if (calls < 3) throw wrapped({ code: '08006', message: 'connection failure' });
    },
  });
  assert.equal(calls, 3);
  assert.equal(lines.length, 2);
  assert.match(lines[0] ?? '', /attempt 1\/4 failed \(transient\)/);
});

test('runMigrationsWithRetry fails fast on a non-transient error and gives up after the last transient attempt', async () => {
  let calls = 0;
  await assert.rejects(
    runMigrationsWithRetry('postgres://unused', '/unused', {
      baseDelayMs: 1,
      log: () => undefined,
      run: async () => {
        calls += 1;
        throw wrapped({ code: '42501', message: 'permission denied' });
      },
    }),
  );
  assert.equal(calls, 1);

  calls = 0;
  await assert.rejects(
    runMigrationsWithRetry('postgres://unused', '/unused', {
      attempts: 3,
      baseDelayMs: 1,
      log: () => undefined,
      run: async () => {
        calls += 1;
        throw wrapped({ code: '57P01', message: 'terminating connection due to administrator command' });
      },
    }),
  );
  assert.equal(calls, 3);
});
