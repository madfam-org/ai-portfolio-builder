/**
 * Abuse ceilings of cv-api (W4-S security review, 2026-10-22). They bound what ONE person can store and send; they are
 * not product tiers (no plan or price depends on them) and sit far above any real use. Tuning them is the owner's call.
 *
 * - `MAX_BODY_BYTES`: the largest request body the API reads (413 `body_too_large` above it). next.config.ts caps the
 *   proxy's copy of every request body at twice this, so nothing larger is ever held in memory.
 * - `OWNER_QUOTAS`: rows per person and table. Creating past the ceiling answers 429 `quota_exceeded` (with the
 *   resource and the limit), so a single account cannot fill the shared database. 500 items is also the reorder
 *   body's maximum; 500 jobs × 50 000 characters and 1 000 artifacts × 256 KiB bound one person's storage.
 */
export const MAX_BODY_BYTES = 256 * 1024;

export interface OwnerQuotas {
  items: number;
  jobs: number;
  artifacts: number;
}

export const OWNER_QUOTAS: Readonly<OwnerQuotas> = { items: 500, jobs: 500, artifacts: 1000 };
