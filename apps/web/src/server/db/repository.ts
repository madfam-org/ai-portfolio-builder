/**
 * The ONLY way the app reads or writes data. Every exported method takes `ownerSub` (the verified Janua `sub`)
 * FIRST, and every statement carries `owner_sub = ownerSub` in its WHERE clause or its inserted values. A missing
 * row and another person's row look the same (null → 404), so existence never leaks.
 *
 * The two unscoped reads are the public ones, and they return published artifacts only:
 * `getPublicArtifactBySlug` (visibility 'public') and `getLinkArtifactByToken` (visibility 'link').
 */
import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq, gt, inArray, isNull, ne, sql, type SQL } from 'drizzle-orm';
import type { Db } from './client.ts';
import { artifacts, jobs, profileItems, profiles } from './schema.ts';
import { referencedItemIds, type ArtifactContent } from '../api/validation.ts';

export type Profile = typeof profiles.$inferSelect;
export type ProfileItem = typeof profileItems.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Artifact = typeof artifacts.$inferSelect;

export class ForeignItemsError extends Error {
  readonly ids: string[];
  constructor(ids: string[]) {
    super('content references profile items that do not exist for this owner');
    this.ids = ids;
  }
}
export class SlugTakenError extends Error {}
export class SuspendedError extends Error {}
export class JobHasArtifactsError extends Error {}
export class PublishLimitError extends Error {}

/** At most this many artifacts published (or re-published) per owner in any 24 hours (lane X §4.8, anti-spam). */
export const PUBLISH_DAILY_LIMIT = 20;
/** At most this many artifacts created in one `createArtifactSet` call (one per kind). */
export const ARTIFACT_SET_MAX = 4;

function pgCode(err: unknown): { code?: string; constraint?: string } {
  let e: unknown = err;
  for (let i = 0; i < 3 && e && typeof e === 'object'; i += 1) {
    const rec = e as { code?: unknown; constraint_name?: unknown; cause?: unknown };
    if (typeof rec.code === 'string' && /^[0-9A-Z]{5}$/.test(rec.code)) {
      return { code: rec.code, constraint: typeof rec.constraint_name === 'string' ? rec.constraint_name : undefined };
    }
    e = rec.cause;
  }
  return {};
}

/** 256-bit, URL-safe share token for 'link' artifacts. */
export function newShareToken(): string {
  return randomBytes(32).toString('base64url');
}

const now = sql`now()`;

export function createRepository(db: Db) {
  type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

  /** `nameHint`: the Janua `name` claim, used only when the profile is created. */
  async function ensureProfile(ownerSub: string, q: Db | Tx = db, nameHint?: string): Promise<Profile> {
    await q
      .insert(profiles)
      .values({ ownerSub, displayName: nameHint ?? '' })
      .onConflictDoNothing({ target: profiles.ownerSub });
    const [row] = await q.select().from(profiles).where(eq(profiles.ownerSub, ownerSub));
    if (!row) throw new Error('profile row missing after insert');
    return row;
  }

  async function assertOwnItems(q: Db | Tx, ownerSub: string, content: ArtifactContent): Promise<void> {
    const ids = referencedItemIds(content);
    if (ids.length === 0) return;
    const rows = await q
      .select({ id: profileItems.id })
      .from(profileItems)
      .where(and(eq(profileItems.ownerSub, ownerSub), inArray(profileItems.id, ids)));
    const found = new Set(rows.map((r) => r.id));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) throw new ForeignItemsError(missing);
  }

  return {
    // ---- profile ---------------------------------------------------------------------------------------------
    async getProfile(ownerSub: string): Promise<{ profile: Profile | null; items: ProfileItem[] }> {
      const [profile] = await db.select().from(profiles).where(eq(profiles.ownerSub, ownerSub));
      const items = await db.select().from(profileItems).where(eq(profileItems.ownerSub, ownerSub)).orderBy(asc(profileItems.position), asc(profileItems.createdAt));
      return { profile: profile ?? null, items };
    },

    /** Full replace of the editable fields; `displayName` omitted keeps the stored one (or the name hint on creation). */
    async putProfile(
      ownerSub: string,
      input: Pick<Profile, 'headline' | 'summary' | 'locale' | 'contact'> & { displayName?: string },
      nameHint?: string,
    ): Promise<Profile> {
      const fields = { headline: input.headline, summary: input.summary, locale: input.locale, contact: input.contact };
      const [row] = await db
        .insert(profiles)
        .values({ ownerSub, displayName: input.displayName ?? nameHint ?? '', ...fields })
        .onConflictDoUpdate({
          target: profiles.ownerSub,
          set: { ...fields, ...(input.displayName === undefined ? {} : { displayName: input.displayName }), updatedAt: now },
        })
        .returning();
      if (!row) throw new Error('profile upsert returned nothing');
      return row;
    },

    // ---- profile items ---------------------------------------------------------------------------------------
    async listItems(ownerSub: string): Promise<ProfileItem[]> {
      return db.select().from(profileItems).where(eq(profileItems.ownerSub, ownerSub)).orderBy(asc(profileItems.position), asc(profileItems.createdAt));
    },

    async createItem(ownerSub: string, input: Pick<ProfileItem, 'kind' | 'position' | 'content' | 'tags'>, nameHint?: string): Promise<ProfileItem> {
      return db.transaction(async (tx) => {
        const profile = await ensureProfile(ownerSub, tx, nameHint);
        const [row] = await tx
          .insert(profileItems)
          .values({ ownerSub, profileId: profile.id, kind: input.kind, position: input.position, content: input.content, tags: input.tags })
          .returning();
        if (!row) throw new Error('item insert returned nothing');
        return row;
      });
    },

    async getItem(ownerSub: string, id: string): Promise<ProfileItem | null> {
      const [row] = await db.select().from(profileItems).where(and(eq(profileItems.ownerSub, ownerSub), eq(profileItems.id, id)));
      return row ?? null;
    },

    async updateItem(ownerSub: string, id: string, patch: Partial<Pick<ProfileItem, 'position' | 'content' | 'tags'>>): Promise<ProfileItem | null> {
      const [row] = await db
        .update(profileItems)
        .set({ ...patch, updatedAt: now })
        .where(and(eq(profileItems.ownerSub, ownerSub), eq(profileItems.id, id)))
        .returning();
      return row ?? null;
    },

    async deleteItem(ownerSub: string, id: string): Promise<boolean> {
      const rows = await db.delete(profileItems).where(and(eq(profileItems.ownerSub, ownerSub), eq(profileItems.id, id))).returning({ id: profileItems.id });
      return rows.length === 1;
    },

    /**
     * «Subir» / «Bajar» and any reorder: `itemIds` in their new order get positions 0..n-1 in ONE transaction. Every
     * id must be one of the owner's items (ForeignItemsError otherwise, and nothing changes); items not listed keep
     * their position.
     */
    async reorderItems(ownerSub: string, itemIds: readonly string[]): Promise<ProfileItem[]> {
      return db.transaction(async (tx) => {
        const ids = [...new Set(itemIds)];
        const rows = ids.length
          ? await tx.select({ id: profileItems.id }).from(profileItems).where(and(eq(profileItems.ownerSub, ownerSub), inArray(profileItems.id, ids)))
          : [];
        const found = new Set(rows.map((r) => r.id));
        const missing = ids.filter((id) => !found.has(id));
        if (missing.length > 0) throw new ForeignItemsError(missing);
        for (const [position, id] of ids.entries()) {
          await tx
            .update(profileItems)
            .set({ position, updatedAt: now })
            .where(and(eq(profileItems.ownerSub, ownerSub), eq(profileItems.id, id)));
        }
        return tx.select().from(profileItems).where(eq(profileItems.ownerSub, ownerSub)).orderBy(asc(profileItems.position), asc(profileItems.createdAt));
      });
    },

    // ---- jobs ------------------------------------------------------------------------------------------------
    async listJobs(ownerSub: string): Promise<Job[]> {
      return db.select().from(jobs).where(eq(jobs.ownerSub, ownerSub)).orderBy(desc(jobs.createdAt));
    },

    async createJob(ownerSub: string, input: Pick<Job, 'title' | 'company' | 'location' | 'sourceUrl' | 'sourceText' | 'status' | 'notes'>): Promise<Job> {
      const [row] = await db.insert(jobs).values({ ...input, ownerSub }).returning();
      if (!row) throw new Error('job insert returned nothing');
      return row;
    },

    async getJob(ownerSub: string, id: string): Promise<Job | null> {
      const [row] = await db.select().from(jobs).where(and(eq(jobs.ownerSub, ownerSub), eq(jobs.id, id)));
      return row ?? null;
    },

    async updateJob(ownerSub: string, id: string, patch: Partial<Pick<Job, 'title' | 'company' | 'location' | 'sourceUrl' | 'sourceText' | 'status' | 'notes'>>): Promise<Job | null> {
      const [row] = await db
        .update(jobs)
        .set({ ...patch, updatedAt: now })
        .where(and(eq(jobs.ownerSub, ownerSub), eq(jobs.id, id)))
        .returning();
      return row ?? null;
    },

    /** False when absent or another person's. Throws JobHasArtifactsError while artifacts still point at it. */
    async deleteJob(ownerSub: string, id: string): Promise<boolean> {
      try {
        const rows = await db.delete(jobs).where(and(eq(jobs.ownerSub, ownerSub), eq(jobs.id, id))).returning({ id: jobs.id });
        return rows.length === 1;
      } catch (err) {
        if (pgCode(err).code === '23503') throw new JobHasArtifactsError('job still has artifacts');
        throw err;
      }
    },

    // ---- artifacts -------------------------------------------------------------------------------------------
    async listArtifacts(ownerSub: string, filter: { jobId?: string; kind?: string } = {}): Promise<Artifact[]> {
      const where: SQL[] = [eq(artifacts.ownerSub, ownerSub)];
      if (filter.jobId) where.push(eq(artifacts.jobId, filter.jobId));
      if (filter.kind) where.push(eq(artifacts.kind, filter.kind));
      return db.select().from(artifacts).where(and(...where)).orderBy(desc(artifacts.createdAt));
    },

    /** Null when `jobId` is set but is not one of the owner's jobs. Throws ForeignItemsError on foreign item ids. */
    async createArtifact(
      ownerSub: string,
      input: { jobId: string | null; kind: string; title: string; locale: string; template: string; content: ArtifactContent },
    ): Promise<Artifact | null> {
      return db.transaction(async (tx) => {
        if (input.jobId) {
          const [job] = await tx.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.ownerSub, ownerSub), eq(jobs.id, input.jobId)));
          if (!job) return null;
        }
        await assertOwnItems(tx, ownerSub, input.content);
        const [row] = await tx.insert(artifacts).values({ ...input, ownerSub }).returning();
        return row ?? null;
      });
    },

    /**
     * «Crear CV, portafolio y presentación para este empleo»: several artifacts in ONE transaction, so either all
     * exist or none does. Null when `jobId` is set but is not one of the owner's jobs; ForeignItemsError on foreign
     * item ids; any insert failure rolls every insert back.
     */
    async createArtifactSet(
      ownerSub: string,
      input: { jobId: string | null; locale: string; template: string; artifacts: { kind: string; title: string; content: ArtifactContent }[] },
    ): Promise<Artifact[] | null> {
      if (input.artifacts.length < 1 || input.artifacts.length > ARTIFACT_SET_MAX) throw new Error('artifact set size out of range');
      return db.transaction(async (tx) => {
        if (input.jobId) {
          const [job] = await tx.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.ownerSub, ownerSub), eq(jobs.id, input.jobId)));
          if (!job) return null;
        }
        const created: Artifact[] = [];
        for (const a of input.artifacts) {
          await assertOwnItems(tx, ownerSub, a.content);
          const [row] = await tx
            .insert(artifacts)
            .values({ ownerSub, jobId: input.jobId, kind: a.kind, title: a.title, locale: input.locale, template: input.template, content: a.content })
            .returning();
          if (!row) throw new Error('artifact insert returned nothing');
          created.push(row);
        }
        return created;
      });
    },

    async getArtifact(ownerSub: string, id: string): Promise<Artifact | null> {
      const [row] = await db.select().from(artifacts).where(and(eq(artifacts.ownerSub, ownerSub), eq(artifacts.id, id)));
      return row ?? null;
    },

    async updateArtifact(
      ownerSub: string,
      id: string,
      patch: { title?: string; locale?: string; template?: string; status?: 'draft' | 'ready'; content?: ArtifactContent },
    ): Promise<Artifact | null> {
      return db.transaction(async (tx) => {
        if (patch.content) await assertOwnItems(tx, ownerSub, patch.content);
        // Moving a published artifact back to draft/ready also withdraws it (the CHECK constraints require it).
        const withdraw = patch.status ? { visibility: 'private', shareToken: null, slug: null, indexable: false, publishedAt: null } : {};
        const [row] = await tx
          .update(artifacts)
          .set({ ...patch, ...withdraw, updatedAt: now })
          .where(and(eq(artifacts.ownerSub, ownerSub), eq(artifacts.id, id)))
          .returning();
        return row ?? null;
      });
    },

    async deleteArtifact(ownerSub: string, id: string): Promise<boolean> {
      const rows = await db.delete(artifacts).where(and(eq(artifacts.ownerSub, ownerSub), eq(artifacts.id, id))).returning({ id: artifacts.id });
      return rows.length === 1;
    },

    /**
     * Publishes under a fresh share token ('link', never indexable) or the given slug ('public', indexable only when
     * asked); the other handle is cleared. A suspended artifact cannot be published again (SuspendedError).
     */
    async publishArtifact(
      ownerSub: string,
      id: string,
      target: { visibility: 'link' } | { visibility: 'public'; slug: string; indexable: boolean },
    ): Promise<Artifact | null> {
      const set =
        target.visibility === 'link'
          ? { visibility: 'link', shareToken: newShareToken(), slug: null, indexable: false }
          : { visibility: 'public', slug: target.slug, shareToken: null, indexable: target.indexable };
      try {
        const [existing] = await db.select({ suspendedAt: artifacts.suspendedAt }).from(artifacts).where(and(eq(artifacts.ownerSub, ownerSub), eq(artifacts.id, id)));
        if (!existing) return null;
        if (existing.suspendedAt) throw new SuspendedError('artifact suspended');
        // Rate limit (a count, no new table): the owner's OTHER artifacts published within the last 24 hours.
        const [recent] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(artifacts)
          .where(and(eq(artifacts.ownerSub, ownerSub), ne(artifacts.id, id), gt(artifacts.publishedAt, sql`now() - interval '1 day'`)));
        if ((recent?.n ?? 0) >= PUBLISH_DAILY_LIMIT) throw new PublishLimitError('publish limit reached');
        const [row] = await db
          .update(artifacts)
          .set({ ...set, status: 'published', publishedAt: now, updatedAt: now })
          .where(and(eq(artifacts.ownerSub, ownerSub), eq(artifacts.id, id), isNull(artifacts.suspendedAt)))
          .returning();
        if (!row) throw new SuspendedError('artifact suspended');
        return row;
      } catch (err) {
        const { code, constraint } = pgCode(err);
        if (code === '23505' && constraint === 'artifacts_slug_unique') throw new SlugTakenError('slug taken');
        throw err;
      }
    },

    /** Back to private 'ready': the token and the slug stop working at once. */
    async unpublishArtifact(ownerSub: string, id: string): Promise<Artifact | null> {
      const [row] = await db
        .update(artifacts)
        .set({ status: 'ready', visibility: 'private', shareToken: null, slug: null, indexable: false, publishedAt: null, updatedAt: now })
        .where(and(eq(artifacts.ownerSub, ownerSub), eq(artifacts.id, id)))
        .returning();
      return row ?? null;
    },

    /** Profile items for the deterministic matcher (`/jobs/:id/match`). */
    async itemsForMatch(ownerSub: string): Promise<ProfileItem[]> {
      return db.select().from(profileItems).where(eq(profileItems.ownerSub, ownerSub)).orderBy(asc(profileItems.position), asc(profileItems.createdAt));
    },
  };
}

export type Repository = ReturnType<typeof createRepository>;

export interface PublicArtifact {
  artifact: Pick<Artifact, 'kind' | 'title' | 'locale' | 'template' | 'content' | 'publishedAt' | 'indexable'>;
  profile: { displayName: string; headline: string; summary: string; contact?: unknown };
  items: Pick<ProfileItem, 'id' | 'kind' | 'content'>[];
}

async function publicProjection(db: Db, row: Artifact): Promise<PublicArtifact> {
  const content = row.content as ArtifactContent;
  const ids = referencedItemIds(content);
  // Items are read with the ARTIFACT's owner, so a public page can only ever show that person's own items.
  const items = ids.length
    ? await db
        .select({ id: profileItems.id, kind: profileItems.kind, content: profileItems.content })
        .from(profileItems)
        .where(and(eq(profileItems.ownerSub, row.ownerSub), inArray(profileItems.id, ids)))
    : [];
  const [profile] = await db.select().from(profiles).where(eq(profiles.ownerSub, row.ownerSub));
  return {
    artifact: { kind: row.kind, title: row.title, locale: row.locale, template: row.template, content: row.content, publishedAt: row.publishedAt, indexable: row.indexable },
    profile: {
      displayName: profile?.displayName ?? '',
      headline: profile?.headline ?? '',
      summary: profile?.summary ?? '',
      ...(content.showContact ? { contact: profile?.contact ?? {} } : {}),
    },
    items,
  };
}

/** The one rule of both public reads: published, unsuspended, and shared the way it is asked for. */
function sharedWhere(share: 'public' | 'link', key: string): SQL | undefined {
  const handle = share === 'public' ? eq(artifacts.slug, key) : eq(artifacts.shareToken, key);
  return and(handle, eq(artifacts.visibility, share), eq(artifacts.status, 'published'), isNull(artifacts.suspendedAt));
}

/** UNSCOPED public read: a published, unsuspended artifact with visibility 'public', by slug. Never a draft, private, link or suspended one. */
export async function getPublicArtifactBySlug(db: Db, slug: string): Promise<PublicArtifact | null> {
  const [row] = await db.select().from(artifacts).where(sharedWhere('public', slug));
  return row ? publicProjection(db, row) : null;
}

/** UNSCOPED public read: a published, unsuspended artifact with visibility 'link', by its share token. */
export async function getLinkArtifactByToken(db: Db, token: string): Promise<PublicArtifact | null> {
  const [row] = await db.select().from(artifacts).where(sharedWhere('link', token));
  return row ? publicProjection(db, row) : null;
}

/**
 * UNSCOPED, for the pages-host proxy only: whether a shared page exists and how it may be indexed, under the SAME
 * rule as the two reads above (one indexed lookup; no content).
 */
export async function sharedPageGate(db: Db, share: 'public' | 'link', key: string): Promise<{ indexable: boolean; locale: string } | null> {
  const [row] = await db.select({ indexable: artifacts.indexable, locale: artifacts.locale }).from(artifacts).where(sharedWhere(share, key));
  return row ? { indexable: share === 'public' && row.indexable, locale: row.locale } : null;
}
