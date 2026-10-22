/**
 * Boot-time validation, fail visible: an invalid environment (a malformed or repeated host, a bad
 * CV_INDEXABLE or CV_REVISION) stops the server before it takes traffic, with the reason in the log.
 * The Node-only part lives in lib/boot.ts (the documented pattern for Node APIs in instrumentation).
 *
 * Migration mode: with CV_MIGRATE_AND_EXIT=true the same image applies the committed SQL migrations
 * (apps/web/drizzle) as the database owner and exits 0, or exits 1 with the reason. The PreSync Job runs the
 * image's own command this way, so the one image is the only artefact (server/db/migrate.ts).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { migrateAndExitIfAsked, validateOrExit } = await import('./lib/boot.ts');
    await migrateAndExitIfAsked();
    validateOrExit();
  }
}
