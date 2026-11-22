/** /ready's database ping cache (server/db/ping-cache.ts): one ping per window, concurrent callers share it, failures too. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPingCache, READY_PING_TTL_MS } from '../src/server/db/ping-cache.ts';

test('concurrent callers share one ping; within the window the result is reused; after it, a new ping runs', async () => {
  let clock = 1_000;
  let pings = 0;
  let release: () => void = () => undefined;
  const cached = createPingCache(2_000, () => clock);
  const slow = () => {
    pings += 1;
    return new Promise<void>((resolve) => {
      release = resolve;
    });
  };
  const burst = Array.from({ length: 50 }, () => cached(slow));
  release();
  await Promise.all(burst);
  assert.equal(pings, 1, 'fifty concurrent readiness answers, one ping');
  clock += 1_999;
  await cached(slow);
  assert.equal(pings, 1, 'reused inside the window');
  clock += 1;
  const next = cached(slow);
  release();
  await next;
  assert.equal(pings, 2, 'a new ping once the window passed');
});

test('a failed ping fails every answer in its window, then the next ping is tried', async () => {
  let clock = 0;
  let pings = 0;
  const cached = createPingCache(2_000, () => clock);
  const failing = async () => {
    pings += 1;
    throw new Error('ECONNREFUSED');
  };
  await assert.rejects(cached(failing), /ECONNREFUSED/);
  await assert.rejects(cached(async () => undefined), /ECONNREFUSED/, 'the failure is reused, not hidden');
  assert.equal(pings, 1);
  clock = 2_000;
  await cached(async () => undefined);
  await cached(failing);
  assert.equal(pings, 1, 'recovered: the success is reused');
});

test('the production window stays well under the readiness probe period (10 s)', () => {
  assert.ok(READY_PING_TTL_MS > 0 && READY_PING_TTL_MS <= 5_000);
});
