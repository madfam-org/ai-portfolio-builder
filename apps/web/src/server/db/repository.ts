/**
 * The ONLY way the app reads or writes data. Every exported method takes `ownerSub` (the verified Janua `sub`)
 * FIRST, and every statement carries `owner_sub = ownerSub` in its WHERE clause or its inserted values. A missing
 * row and another person's row look the same (null → 404), so existence never leaks.
 *
 * The two unscoped reads are the public ones, and they return published artifacts only:
 * `getPublicArtifactBySlug` (visibility 'public') and `getLinkArtifactByToken` (visibility 'link').
 */
import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq, gt, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { Db } from './client.ts';
import { artifacts, jobs, profileItems, profiles } from './schema.ts';
import { referencedItemIds, type ArtifactContent } from '../api/validation.ts';
import { sharedRenderData, type SharedRenderData } from '../../lib/shared-page.ts';
import { contentLocale } from '../../lib/profile-text.ts';
import { swapHeaderTexts, swapItemTexts } from '../../lib/profile-text-swap.ts';
import type { ItemKind } from '../../lib/copy/app.ts';

export type Profile = typeof profiles.$inferSelect;
export type ProfileItem = typeof profileItems.$inferSelect;
export type Job = typeof jobs.$inferSelect;
/** The job columns a person writes (create and patch); W5-J added the typed posting fields, optional here. */
export type JobWritable = Pick<Job, 'title' | 'company' | 'location' | 'sourceUrl' | 'sourceText' | 'status' | 'notes'> &
  Partial<
    Pick<
      Job,
      'sourceKind' | 'countryCode' | 'stateCode' | 'employmentType' | 'workMode' | 'salaryMin' | 'salaryMax' | 'salaryCurrency' | 'salaryPeriod' | 'datePosted' | 'validThrough'
    >
  >;
export type Artifact = typeof artifacts.$inferSelect;

export class ForeignItemsError extends Error {
  readonly ids: string[];
  constructor(ids: string[]) {
    super('content references profile items that do not exist for this owner');
    this.ids = ids;
  }
}
/** W7 (B4): a profile translation keyed by the profile's own primary language (its text belongs in the fields). */
export class PrimaryTranslationError extends Error {
  readonly locale: string;
  constructor(locale: string) {
    super('the primary language is written in the fields themselves');
    this.locale = locale;
  }
}
export class SlugTakenError extends Error {}
export class SuspendedError extends Error {}
export class JobHasArtifactsError extends Error {}
export class PublishLimitError extends Error {
  /** Whole seconds until the oldest publication in the window leaves it (at least 1): the 429's `Retry-After`. */
  readonly retryAfter: number;
  constructor(retryAfter: number) {
    super('publish limit reached');
    this.retryAfter = Math.max(1, Math.ceil(retryAfter));
  }
}

/** Creating past an owner's row ceiling (server/api/limits.ts OWNER_QUOTAS): the API answers 429 `quota_exceeded`. */
export class QuotaExceededError extends Error {
  readonly table: OwnedTable;
  readonly limit: number;
  constructor(table: OwnedTable, limit: number) {
    super('owner quota reached');
    this.table = table;
    this.limit = limit;
  }
}

type Queryable = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Inside a transaction: one owner's writes that count or limit rows run one at a time. A transaction-scoped advisory
 * lock on the owner, held until the transaction ends, so a count and the write after it cannot interleave with another
 * such write of the same person (publishes, creates under a ceiling). Other owners never wait on it.
 */
async function lockOwner(tx: Queryable, ownerSub: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ownerSub}, 0))`);
}

/**
 * Inside the transaction that inserts: takes the owner's lock, then refuses (QuotaExceededError) when `adding` more rows
 * would take the owner past `limit`. Concurrent creates of one person therefore never pass the ceiling together.
 * `limit` undefined: no ceiling to hold (repository callers other than the API, such as tests).
 */
export async function holdQuota(tx: Queryable, ownerSub: string, table: OwnedTable, adding: number, limit: number | undefined): Promise<void> {
  if (limit === undefined) return;
  await lockOwner(tx, ownerSub);
  if ((await ownerRowCount(tx, ownerSub, table)) + adding > limit) throw new QuotaExceededError(table, limit);
}

/**
 * At most this many DIFFERENT documents published per owner within any 24 hours (lane X §4.8), whatever their state
 * now: withdrawing one does not free its place, and publishing again one already counted adds nothing. Counted from
 * `published_at`, which is the time of the document's LAST publication and is kept when it is withdrawn.
 */
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

    /**
     * Full replace of the editable fields; `displayName` omitted keeps the stored one (or the name hint on creation).
     *
     * W7 (B4): the texts and `translations` of the body are read in the profile's STORED primary language (the one the
     * person was editing). When `locale` names another one, the header and EVERY one of the owner's items swap their
     * texts to it in the same transaction (lib/profile-text-swap.ts), and `items` returns the swapped rows; otherwise
     * `items` is absent. A translation keyed by the stored primary language is refused (PrimaryTranslationError).
     */
    async putProfile(
      ownerSub: string,
      // W7 (B4): `translations` undefined keeps the stored ones (clients from before W7-B4 never send it); null clears.
      input: Pick<Profile, 'headline' | 'summary' | 'locale' | 'contact'> & { displayName?: string; translations?: Profile['translations'] },
      nameHint?: string,
    ): Promise<{ profile: Profile; items?: ProfileItem[] }> {
      return db.transaction(async (tx) => {
        // The row lock serialises two saves of the same profile and holds item inserts (their FK) until the commit.
        const [stored] = await tx.select().from(profiles).where(eq(profiles.ownerSub, ownerSub)).for('update');
        const from = contentLocale(stored?.locale ?? input.locale);
        const to = contentLocale(input.locale);
        if (input.translations && typeof input.translations === 'object' && from in input.translations) throw new PrimaryTranslationError(from);
        const contact = (input.contact ?? {}) as Record<string, unknown>;
        let fields = {
          headline: input.headline,
          summary: input.summary,
          locale: input.locale,
          contact: input.contact,
          ...(input.translations === undefined ? {} : { translations: input.translations }),
        };
        const switching = stored !== undefined && from !== to;
        if (switching) {
          const location = typeof contact.location === 'string' ? contact.location : undefined;
          const kept = input.translations === undefined ? stored.translations : input.translations;
          const swapped = swapHeaderTexts({ headline: input.headline, summary: input.summary, location }, kept, from, to);
          const { location: _old, ...rest } = contact;
          fields = {
            ...fields,
            headline: swapped.header.headline,
            summary: swapped.header.summary,
            contact: swapped.header.location === undefined ? rest : { ...rest, location: swapped.header.location },
            translations: swapped.translations,
          };
        }
        const [row] = await tx
          .insert(profiles)
          .values({ ownerSub, displayName: input.displayName ?? nameHint ?? '', ...fields })
          .onConflictDoUpdate({
            target: profiles.ownerSub,
            set: { ...fields, ...(input.displayName === undefined ? {} : { displayName: input.displayName }), updatedAt: now },
          })
          .returning();
        if (!row) throw new Error('profile upsert returned nothing');
        if (!switching) return { profile: row };
        const items = await tx
          .select()
          .from(profileItems)
          .where(eq(profileItems.ownerSub, ownerSub))
          .orderBy(asc(profileItems.position), asc(profileItems.createdAt))
          .for('update');
        const out: ProfileItem[] = [];
        for (const item of items) {
          const swapped = swapItemTexts(item.kind as ItemKind, item.content, item.translations, from, to);
          if (!swapped.changed) {
            out.push(item);
            continue;
          }
          const [updated] = await tx
            .update(profileItems)
            .set({ content: swapped.content, translations: swapped.translations, updatedAt: now })
            .where(and(eq(profileItems.ownerSub, ownerSub), eq(profileItems.id, item.id)))
            .returning();
          if (!updated) throw new Error('item swap returned nothing');
          out.push(updated);
        }
        return { profile: row, items: out };
      });
    },

    // ---- profile items ---------------------------------------------------------------------------------------
    async listItems(ownerSub: string): Promise<ProfileItem[]> {
      return db.select().from(profileItems).where(eq(profileItems.ownerSub, ownerSub)).orderBy(asc(profileItems.position), asc(profileItems.createdAt));
    },

    async createItem(
      ownerSub: string,
      input: Pick<ProfileItem, 'kind' | 'position' | 'content' | 'tags'> & { translations?: ProfileItem['translations'] },
      nameHint?: string,
      quotaLimit?: number,
    ): Promise<ProfileItem> {
      return db.transaction(async (tx) => {
        await holdQuota(tx, ownerSub, 'items', 1, quotaLimit);
        const profile = await ensureProfile(ownerSub, tx, nameHint);
        const [row] = await tx
          .insert(profileItems)
          .values({ ownerSub, profileId: profile.id, kind: input.kind, position: input.position, content: input.content, tags: input.tags, translations: input.translations ?? null })
          .returning();
        if (!row) throw new Error('item insert returned nothing');
        return row;
      });
    },

    async getItem(ownerSub: string, id: string): Promise<ProfileItem | null> {
      const [row] = await db.select().from(profileItems).where(and(eq(profileItems.ownerSub, ownerSub), eq(profileItems.id, id)));
      return row ?? null;
    },

    async updateItem(ownerSub: string, id: string, patch: Partial<Pick<ProfileItem, 'position' | 'content' | 'tags' | 'translations'>>): Promise<ProfileItem | null> {
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

    async createJob(ownerSub: string, input: JobWritable, quotaLimit?: number): Promise<Job> {
      return db.transaction(async (tx) => {
        await holdQuota(tx, ownerSub, 'jobs', 1, quotaLimit);
        const [row] = await tx.insert(jobs).values({ ...input, ownerSub }).returning();
        if (!row) throw new Error('job insert returned nothing');
        return row;
      });
    },

    async getJob(ownerSub: string, id: string): Promise<Job | null> {
      const [row] = await db.select().from(jobs).where(and(eq(jobs.ownerSub, ownerSub), eq(jobs.id, id)));
      return row ?? null;
    },

    async updateJob(ownerSub: string, id: string, patch: Partial<JobWritable>): Promise<Job | null> {
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
      quotaLimit?: number,
    ): Promise<Artifact | null> {
      return db.transaction(async (tx) => {
        await holdQuota(tx, ownerSub, 'artifacts', 1, quotaLimit);
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
      input: { jobId: string | null; locale: string; template: string; artifacts: { kind: string; title: string; content: ArtifactContent; template?: string }[] },
      quotaLimit?: number,
    ): Promise<Artifact[] | null> {
      if (input.artifacts.length < 1 || input.artifacts.length > ARTIFACT_SET_MAX) throw new Error('artifact set size out of range');
      return db.transaction(async (tx) => {
        await holdQuota(tx, ownerSub, 'artifacts', input.artifacts.length, quotaLimit);
        if (input.jobId) {
          const [job] = await tx.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.ownerSub, ownerSub), eq(jobs.id, input.jobId)));
          if (!job) return null;
        }
        const created: Artifact[] = [];
        for (const a of input.artifacts) {
          await assertOwnItems(tx, ownerSub, a.content);
          const [row] = await tx
            .insert(artifacts)
            .values({ ownerSub, jobId: input.jobId, kind: a.kind, title: a.title, locale: input.locale, template: a.template ?? input.template, content: a.content })
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
        // `publishedAt` stays: it is the last publication, which the daily limit counts (PUBLISH_DAILY_LIMIT).
        const withdraw = patch.status ? { visibility: 'private', shareToken: null, slug: null, indexable: false } : {};
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
        return await db.transaction(async (tx) => {
          // One owner's publishes run one at a time (lockOwner), so the count below and the update after it cannot
          // interleave with another publish of the same person.
          await lockOwner(tx, ownerSub);
          const [existing] = await tx.select({ suspendedAt: artifacts.suspendedAt }).from(artifacts).where(and(eq(artifacts.ownerSub, ownerSub), eq(artifacts.id, id)));
          if (!existing) return null;
          if (existing.suspendedAt) throw new SuspendedError('artifact suspended');
          // Rate limit (a count, no new table): the owner's documents whose last publication is within 24 hours,
          // published now or not. This one, when already among them, takes no new place.
          const [recent] = await tx
            .select({
              others: sql<number>`count(*) filter (where ${artifacts.id} <> ${id})::int`,
              self: sql<boolean>`coalesce(bool_or(${artifacts.id} = ${id}), false)`,
              wait: sql<number | null>`extract(epoch from (min(${artifacts.publishedAt}) filter (where ${artifacts.id} <> ${id}) + interval '1 day' - now()))::float8`,
            })
            .from(artifacts)
            .where(and(eq(artifacts.ownerSub, ownerSub), gt(artifacts.publishedAt, sql`now() - interval '1 day'`)));
          if (!recent?.self && (recent?.others ?? 0) >= PUBLISH_DAILY_LIMIT) throw new PublishLimitError(Number(recent?.wait ?? 1));
          const [row] = await tx
            .update(artifacts)
            .set({ ...set, status: 'published', publishedAt: now, updatedAt: now })
            .where(and(eq(artifacts.ownerSub, ownerSub), eq(artifacts.id, id), isNull(artifacts.suspendedAt)))
            .returning();
          if (!row) throw new SuspendedError('artifact suspended');
          return row;
        });
      } catch (err) {
        const { code, constraint } = pgCode(err);
        if (code === '23505' && constraint === 'artifacts_slug_unique') throw new SlugTakenError('slug taken');
        throw err;
      }
    },

    /**
     * Back to private 'ready': the token and the slug stop working at once. `publishedAt` stays (the last
     * publication, which the daily limit counts).
     */
    async unpublishArtifact(ownerSub: string, id: string): Promise<Artifact | null> {
      const [row] = await db
        .update(artifacts)
        .set({ status: 'ready', visibility: 'private', shareToken: null, slug: null, indexable: false, updatedAt: now })
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

/**
 * What both public reads return (and the pages host renders): only what the published page prints
 * (lib/shared-page.ts): no title, no publication time, the text already in the document's language, the profile's
 * summary only when the document has none of its own; plus `indexable`, the page's robots choice.
 */
export interface PublicArtifact extends SharedRenderData {
  artifact: SharedRenderData['artifact'] & Pick<Artifact, 'indexable'>;
}

async function publicProjection(db: Db, row: Artifact): Promise<PublicArtifact> {
  const content = row.content as ArtifactContent;
  const ids = referencedItemIds(content);
  // Items are read with the ARTIFACT's owner, so a public page can only ever show that person's own items.
  const items = ids.length
    ? await db
        .select({ id: profileItems.id, kind: profileItems.kind, content: profileItems.content, translations: profileItems.translations })
        .from(profileItems)
        .where(and(eq(profileItems.ownerSub, row.ownerSub), inArray(profileItems.id, ids)))
    : [];
  const [profile] = await db.select().from(profiles).where(eq(profiles.ownerSub, row.ownerSub));
  const shared = sharedRenderData({
    artifact: { kind: row.kind, locale: row.locale, template: row.template, content: row.content },
    profile: {
      displayName: profile?.displayName ?? '',
      headline: profile?.headline ?? '',
      summary: profile?.summary ?? '',
      ...(content.showContact ? { contact: profile?.contact ?? {} } : {}),
      ...(profile ? { locale: profile.locale, translations: profile.translations } : {}),
    },
    items,
  });
  return { ...shared, artifact: { ...shared.artifact, indexable: row.indexable } };
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

/** The tables an owner's quota counts (server/api/limits.ts). */
export type OwnedTable = 'items' | 'jobs' | 'artifacts';

/**
 * OWNER-SCOPED count of one person's rows in one table, for the per-owner quotas (W4-S). Indexed by `owner_sub`
 * (profile_items_owner_profile_idx, jobs_owner_sub_idx, artifacts_owner_job_idx all lead with it). A create checks its
 * ceiling with this inside its own transaction, under the owner's lock (holdQuota); alone, it only answers «is there
 * room now» (the job-intake previews, which store nothing).
 */
export async function ownerRowCount(db: Queryable, ownerSub: string, table: OwnedTable): Promise<number> {
  const t = table === 'items' ? profileItems : table === 'jobs' ? jobs : artifacts;
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(t).where(eq(t.ownerSub, ownerSub));
  return row?.n ?? 0;
}
