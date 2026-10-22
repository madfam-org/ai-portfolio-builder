/**
 * The e2e run's fixed coordinates (shared by playwright.config.ts, the server launcher and the specs). Hosts are
 * `*.localhost`: browsers resolve them to loopback, and Auth.js keeps plain (non-__Secure-) cookie names for them.
 */
export const E2E_PORT = Number(process.env.CV_E2E_PORT ?? 3311);
/** The launcher's test-only token minting endpoint (never part of the product). */
export const E2E_MINT_PORT = Number(process.env.CV_E2E_MINT_PORT ?? 3312);
/** The server's internal metrics listener (CV_METRICS_PORT; production uses 9090, never a public host). */
export const E2E_METRICS_PORT = Number(process.env.CV_E2E_METRICS_PORT ?? 3313);

export const HOSTS = {
  landing: 'cv.localhost',
  app: 'cv-app.localhost',
  api: 'cv-api.localhost',
  pages: 'cv-p.localhost',
} as const;

export const url = (host: keyof typeof HOSTS, path = '/') => `http://${HOSTS[host]}:${E2E_PORT}${path}`;

/** Two owners in every suite. */
export const OWNER_A = { sub: 'janua|e2e-owner-a', name: 'Ana Prueba', email: 'ana@example.test' };
export const OWNER_B = { sub: 'janua|e2e-owner-b', name: 'Beto Prueba', email: 'beto@example.test' };

/**
 * Per-suite owners. Every spec file runs against the SAME Postgres, so two specs that both write as OWNER_A see each
 * other's profile items, jobs and documents (2026-10-22: a documents spec's items changed the jobs spec's keyword
 * match). A spec whose assertions depend on what one owner holds signs in as its own pair; app.spec keeps OWNER_A/B.
 */
export function suiteOwners(suite: string): { OWNER_A: typeof OWNER_A; OWNER_B: typeof OWNER_B } {
  return {
    OWNER_A: { ...OWNER_A, sub: `janua|e2e-${suite}-a` },
    OWNER_B: { ...OWNER_B, sub: `janua|e2e-${suite}-b` },
  };
}
