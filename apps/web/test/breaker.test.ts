/** The circuit breaker of cv's service clients (src/server/breaker.ts): a run of service failures from different people. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FAILURE_THRESHOLD, MIN_OWNERS, OPEN_MS, createBreaker } from '../src/server/breaker.ts';

test('defaults: three failures, from at least two people, open it for 30 s', () => {
  assert.deepEqual([FAILURE_THRESHOLD, MIN_OWNERS, OPEN_MS], [3, 2, 30_000]);
});

test('a run from two people opens it for openMs; then it is closed, and opens again only on a new run', () => {
  let clock = 0;
  const b = createBreaker(() => clock);
  b.fail('a');
  b.fail('a');
  assert.equal(b.isOpen(), false, 'two failures: below the threshold');
  b.fail('b');
  assert.equal(b.isOpen(), true, 'three failures from two people');
  clock += OPEN_MS - 1;
  assert.equal(b.isOpen(), true);
  clock += 2;
  assert.equal(b.isOpen(), false, 'closed after openMs');
  // Opening started a new run: the people of the previous one are not remembered.
  b.fail('a');
  b.fail('a');
  b.fail('a');
  assert.equal(b.isOpen(), false, 'one person alone does not reopen it');
  b.fail('b');
  assert.equal(b.isOpen(), true, 'a second person completes the run');
});

test('one person alone never opens it; a success resets the run', () => {
  const b = createBreaker(() => 0);
  for (let i = 0; i < 1000; i += 1) b.fail('a');
  assert.equal(b.isOpen(), false);
  b.succeed();
  b.fail('b');
  b.fail('a');
  assert.equal(b.isOpen(), false, 'two failures since the success');
  b.succeed();
  b.fail('a');
  b.fail('b');
  assert.equal(b.isOpen(), false);
  b.fail('a');
  assert.equal(b.isOpen(), true);
});

test('thresholds are options (the clients use the defaults)', () => {
  const b = createBreaker(() => 0, { threshold: 2, minOwners: 3, openMs: 10 });
  b.fail('a');
  b.fail('b');
  assert.equal(b.isOpen(), false, 'two people, three needed');
  b.fail('c');
  assert.equal(b.isOpen(), true);
});
