/**
 * Reads of the pages host, per request (React `cache`: metadata and page share one read). The proxy already gated
 * the request (src/server/pages-gate.ts); this reads the content under the SAME public rule, so a page unpublished
 * in between is a 404, never stale content. No database configured: every page is a 404. Owner: W3-4.
 */
import { cache } from 'react';
import { SHARE_TOKEN, isAllowedSlug } from '@/lib/api-routes';
import { APP_COPY } from '@/lib/copy/app';
import type { Locale } from '@/lib/routing';
import { getSharedDb } from '@/server/db/client';
import { getLinkArtifactByToken, getPublicArtifactBySlug, type PublicArtifact } from '@/server/db/repository';

export const loadPublic = cache(async (slug: string): Promise<PublicArtifact | null> => {
  const handle = getSharedDb(process.env);
  if (!handle || !isAllowedSlug(slug)) return null;
  return getPublicArtifactBySlug(handle.db, slug);
});

export const loadLink = cache(async (token: string): Promise<PublicArtifact | null> => {
  const handle = getSharedDb(process.env);
  if (!handle || !SHARE_TOKEN.test(token)) return null;
  return getLinkArtifactByToken(handle.db, token);
});

export function pageLocale(data: PublicArtifact): Locale {
  return data.artifact.locale === 'en' ? 'en' : 'es';
}

/**
 * The browser tab and a shared link's preview: the person and the kind of document. Never the document's own title:
 * that is the owner's private label and often names the employer applied to.
 */
export function pageTitle(data: PublicArtifact): string {
  const kinds = APP_COPY[pageLocale(data)].kinds as Record<string, string>;
  const kind = kinds[data.artifact.kind] ?? kinds.cv!;
  const name = data.profile.displayName?.trim();
  return name ? `${name} · ${kind}` : kind;
}
