/**
 * Data portability and data rights (W4-I), beside the main repository and under the same rules: every function takes
 * `ownerSub` (the verified Janua `sub`) FIRST and every statement carries `owner_sub = ownerSub`.
 *
 * - `importItems`: the import a person confirmed, in ONE transaction (all items and header fields, or nothing).
 * - `exportAll`: everything the owner holds, read in one REPEATABLE READ, read-only transaction (a consistent copy).
 * - `deleteAll`: every row the owner holds, in ONE transaction. Published pages stop at once: the public reads find
 *   no row, and public pages are served `no-store`.
 */
import { asc, desc, eq, sql } from 'drizzle-orm';
import type { Db } from './client.ts';
import type { Artifact, Job, Profile, ProfileItem } from './repository.ts';
import { artifacts, jobs, profileItems, profiles } from './schema.ts';

export interface ContactInput {
  email?: string;
  phone?: string;
  location?: string;
  links?: { label: string; url: string }[];
}

export interface ImportInput {
  items: { kind: string; content: unknown; tags: string[] }[];
  profile?: { displayName?: string; headline?: string; summary?: string; contact?: ContactInput };
}

export interface OwnerData {
  profile: Profile | null;
  items: ProfileItem[];
  jobs: Job[];
  artifacts: Artifact[];
}

/** At most this many header links (contactSchema). */
const CONTACT_LINKS_MAX = 20;

/** Header contact after an import: given keys replace; links are appended when new (by URL), up to the limit. */
export function mergeContact(current: ContactInput, patch: ContactInput): ContactInput {
  const next: ContactInput = { ...current };
  if (patch.email !== undefined) next.email = patch.email;
  if (patch.phone !== undefined) next.phone = patch.phone;
  if (patch.location !== undefined) next.location = patch.location;
  if (patch.links !== undefined) {
    const links = [...(current.links ?? [])];
    const seen = new Set(links.map((l) => l.url));
    for (const l of patch.links) {
      if (seen.has(l.url) || links.length >= CONTACT_LINKS_MAX) continue;
      seen.add(l.url);
      links.push(l);
    }
    next.links = links;
  }
  return next;
}

export function createDataRights(db: Db) {
  return {
    /**
     * Adds the confirmed items after the owner's existing ones (positions max+1 …) and applies the chosen header
     * fields, in one transaction. Creates the profile when absent (display name from the Janua `name` claim unless the
     * import sets one).
     */
    async importItems(ownerSub: string, input: ImportInput, nameHint?: string): Promise<{ profile: Profile; items: ProfileItem[] }> {
      return db.transaction(async (tx) => {
        await tx
          .insert(profiles)
          .values({ ownerSub, displayName: input.profile?.displayName ?? nameHint ?? '' })
          .onConflictDoNothing({ target: profiles.ownerSub });
        let [profile] = await tx.select().from(profiles).where(eq(profiles.ownerSub, ownerSub));
        if (!profile) throw new Error('profile row missing after insert');
        const p = input.profile;
        if (p && Object.keys(p).length > 0) {
          const set: Partial<Pick<Profile, 'displayName' | 'headline' | 'summary' | 'contact'>> = {};
          if (p.displayName !== undefined) set.displayName = p.displayName;
          if (p.headline !== undefined) set.headline = p.headline;
          if (p.summary !== undefined) set.summary = p.summary;
          if (p.contact !== undefined) set.contact = mergeContact((profile.contact ?? {}) as ContactInput, p.contact);
          [profile] = await tx
            .update(profiles)
            .set({ ...set, updatedAt: sql`now()` })
            .where(eq(profiles.ownerSub, ownerSub))
            .returning();
          if (!profile) throw new Error('profile update returned nothing');
        }
        if (input.items.length === 0) return { profile, items: [] };
        const [last] = await tx
          .select({ max: sql<number | null>`max(${profileItems.position})` })
          .from(profileItems)
          .where(eq(profileItems.ownerSub, ownerSub));
        const base = (last?.max ?? -1) + 1;
        const rows = await tx
          .insert(profileItems)
          .values(input.items.map((it, i) => ({ ownerSub, profileId: profile.id, kind: it.kind, position: base + i, content: it.content, tags: it.tags })))
          .returning();
        return { profile, items: rows.sort((a, b) => a.position - b.position) };
      });
    },

    /** Everything the owner holds, as one consistent snapshot. */
    async exportAll(ownerSub: string): Promise<OwnerData> {
      return db.transaction(
        async (tx) => {
          const [profile] = await tx.select().from(profiles).where(eq(profiles.ownerSub, ownerSub));
          const items = await tx.select().from(profileItems).where(eq(profileItems.ownerSub, ownerSub)).orderBy(asc(profileItems.position), asc(profileItems.createdAt));
          const jobRows = await tx.select().from(jobs).where(eq(jobs.ownerSub, ownerSub)).orderBy(desc(jobs.createdAt));
          const artifactRows = await tx.select().from(artifacts).where(eq(artifacts.ownerSub, ownerSub)).orderBy(desc(artifacts.createdAt));
          return { profile: profile ?? null, items, jobs: jobRows, artifacts: artifactRows };
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
    },

    /**
     * Deletes every row the owner holds (artifacts first: they reference jobs and, inside content, items), in one
     * transaction. Returns how many rows of each table went.
     */
    async deleteAll(ownerSub: string): Promise<{ profiles: number; items: number; jobs: number; artifacts: number }> {
      return db.transaction(async (tx) => {
        const a = await tx.delete(artifacts).where(eq(artifacts.ownerSub, ownerSub)).returning({ id: artifacts.id });
        const i = await tx.delete(profileItems).where(eq(profileItems.ownerSub, ownerSub)).returning({ id: profileItems.id });
        const j = await tx.delete(jobs).where(eq(jobs.ownerSub, ownerSub)).returning({ id: jobs.id });
        const p = await tx.delete(profiles).where(eq(profiles.ownerSub, ownerSub)).returning({ id: profiles.id });
        return { profiles: p.length, items: i.length, jobs: j.length, artifacts: a.length };
      });
    },
  };
}

export type DataRights = ReturnType<typeof createDataRights>;
