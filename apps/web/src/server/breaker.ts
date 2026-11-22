/**
 * The circuit breaker of cv's service clients (server/tlacuilo/client.ts, server/hcm/client.ts): one per client and
 * process, shared by everyone's requests, so it opens only for a service in trouble, never because of one person.
 *
 * - Only the service's failures are reported (`fail`): a timeout, a connection error, a 5xx the request did not cause.
 *   Each client decides which; whatever the request itself could have caused (a 4xx, a refused credential, a page the
 *   service could not read, an answer that does not match the contract) is never reported.
 * - It opens after `threshold` consecutive service failures that came from at least `minOwners` different people. One
 *   person's requests alone never open it, however many of them fail: a request that fails only for them says nothing
 *   about the service, and anyone's success in between resets the count.
 * - Any answer that shows the service healthy (`succeed`) resets the count.
 * - Open, it answers at once for `openMs`; then requests reach the service again, and it opens again only on a new run
 *   of failures as above.
 *
 * Keeps the owners of the current run only (fewer than `threshold`, or `minOwners`, at any time), in memory, never logged.
 */

/** Consecutive service failures that open a breaker. */
export const FAILURE_THRESHOLD = 3;
/** Different people the failures must come from: one person can never open a breaker alone. */
export const MIN_OWNERS = 2;
/** How long an open breaker answers at once. */
export const OPEN_MS = 30_000;

export interface Breaker {
  /** True while open: answer at once, without calling the service. */
  isOpen(): boolean;
  /** The service answered in a way that shows it healthy. */
  succeed(): void;
  /** A failure that is the service's, on a request of `owner` (the Janua `sub`). */
  fail(owner: string): void;
}

export function createBreaker(now: () => number, options: { threshold?: number; minOwners?: number; openMs?: number } = {}): Breaker {
  const threshold = options.threshold ?? FAILURE_THRESHOLD;
  const minOwners = options.minOwners ?? MIN_OWNERS;
  const openMs = options.openMs ?? OPEN_MS;
  let failures = 0;
  const owners = new Set<string>();
  let openUntil = 0;
  const reset = () => {
    failures = 0;
    owners.clear();
  };
  return {
    isOpen: () => openUntil > now(),
    succeed: reset,
    fail(owner) {
      failures += 1;
      owners.add(owner);
      if (failures >= threshold && owners.size >= minOwners) {
        openUntil = now() + openMs;
        reset();
      }
    },
  };
}
