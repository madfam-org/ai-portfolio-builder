/**
 * W5-J: per-owner ceilings on the intake (abuse bounds, not product tiers; the owner may tune them).
 *
 * In memory, per process, on purpose: a durable log would store which sites each person reads (personal data) only to
 * count them. With R replicas the effective ceiling is at most R × the numbers below (production runs 2). A window is a
 * sliding log of timestamps per owner, capped in size, and owners with no recent use are dropped.
 */

export interface Window {
  /** Most events in `ms`. */
  max: number;
  ms: number;
}

/** Link reads (each may make up to three HTTP requests: robots.txt, an ATS API, the page). */
export const FETCH_WINDOWS: readonly Window[] = [
  { max: 20, ms: 10 * 60 * 1000 },
  { max: 100, ms: 24 * 60 * 60 * 1000 },
];
/** Any intake call (text and captures are parsed on the server too). */
export const PARSE_WINDOWS: readonly Window[] = [{ max: 120, ms: 10 * 60 * 1000 }];

const MAX_OWNERS = 10_000;

export class RateLimiter {
  readonly #windows: readonly Window[];
  readonly #log = new Map<string, number[]>();
  readonly #now: () => number;

  constructor(windows: readonly Window[], now: () => number = Date.now) {
    this.#windows = windows;
    this.#now = now;
  }

  /** Records one event and returns 0, or returns the seconds until one is allowed (nothing recorded). */
  take(owner: string): number {
    const now = this.#now();
    const longest = Math.max(...this.#windows.map((w) => w.ms));
    const kept = (this.#log.get(owner) ?? []).filter((t) => now - t < longest);
    for (const w of this.#windows) {
      const inWindow = kept.filter((t) => now - t < w.ms);
      if (inWindow.length >= w.max) {
        this.#log.set(owner, kept);
        return Math.max(1, Math.ceil((inWindow[0]! + w.ms - now) / 1000));
      }
    }
    kept.push(now);
    this.#log.delete(owner);
    this.#log.set(owner, kept);
    if (this.#log.size > MAX_OWNERS) this.#log.delete(this.#log.keys().next().value!);
    return 0;
  }
}

export const fetchLimiter = new RateLimiter(FETCH_WINDOWS);
export const parseLimiter = new RateLimiter(PARSE_WINDOWS);
