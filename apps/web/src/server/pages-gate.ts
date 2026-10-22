/**
 * The pages host's gate (src/proxy.ts): before a user page renders, look the artifact up under the public rule
 * (published, unsuspended, shared that way), so a miss is the HTML 404 and the response headers follow the artifact
 * (its owner's `indexable` choice, its locale). The page itself reads the content again through the same rule.
 *
 * Dormant: without a database every user page is a 404 (never a 500, never a fake page). A configured database that
 * fails is a 503 (fail closed: an outage must not look like "this page does not exist" to a crawler).
 */
import type { Locale } from '../lib/routing.ts';
import { getSharedDb } from './db/client.ts';
import { sharedPageGate } from './db/repository.ts';

export type GateResult = { status: 'found'; indexable: boolean; locale: Locale } | { status: 'missing' } | { status: 'unavailable' };

type Env = Readonly<Record<string, string | undefined>>;
export type GateLookup = (share: 'public' | 'link', key: string) => Promise<{ indexable: boolean; locale: string } | null>;

function defaultLookup(env: Env): GateLookup | null {
  const handle = getSharedDb(env);
  return handle ? (share, key) => sharedPageGate(handle.db, share, key) : null;
}

export async function gateUserPage(share: 'public' | 'link', key: string, lookup: GateLookup | null = defaultLookup(process.env)): Promise<GateResult> {
  if (!lookup) return { status: 'missing' };
  try {
    const found = await lookup(share, key);
    if (!found) return { status: 'missing' };
    return { status: 'found', indexable: share === 'public' && found.indexable, locale: found.locale === 'en' ? 'en' : 'es' };
  } catch (err) {
    const code = (err as { code?: unknown })?.code;
    // The code only: driver messages can carry the bound slug or token.
    console.error(`cv pages: lookup failed ${typeof code === 'string' ? code : 'unknown'}`);
    return { status: 'unavailable' };
  }
}
