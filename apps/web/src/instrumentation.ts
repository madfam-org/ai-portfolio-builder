/**
 * Boot-time validation, fail visible: an invalid environment (a malformed or repeated host, a bad
 * CV_INDEXABLE or CV_REVISION) stops the server before it takes traffic, with the reason in the log.
 * The Node-only part lives in lib/boot.ts (the documented pattern for Node APIs in instrumentation).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateOrExit } = await import('./lib/boot.ts');
    validateOrExit();
  }
}
