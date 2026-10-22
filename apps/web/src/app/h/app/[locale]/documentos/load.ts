/**
 * Server reads of the documents pages (`/documentos/:id`, `/vista-previa`, `/imprimir`): one artifact of the signed-in
 * person, resolved against THEIR profile on the server (components/render/model.ts ownerRenderData), so the preview
 * is the public page's exact renderer and data shape.
 *
 * The access rule is the API's own (server/api/handler.ts): the session's Janua access token must verify (RS256,
 * issuer, audience cv-api) and its `sub` is the owner key of every read, through the owner-scoped repository
 * (another person's id is the same 404 as a missing one). A page cannot set cookies, so it never refreshes a session:
 * an expired access token answers `refresh`, and the page lets the browser renew it through the same-origin proxy
 * (documentos/ui/SessionRefresh.tsx) before reading again.
 */
import { headers } from 'next/headers';
import { getToken } from 'next-auth/jwt';
import { ownerRenderData, type RenderData } from '@/components/render/model';
import { authSecret, isSignInConfigured, secureAuthCookies, sessionCookieName, verifierConfig } from '@/lib/auth-env';
import type { ArtifactDto } from '@/lib/client/types';
import { getSharedDb } from '@/server/db/client';
import { createRepository, type Artifact } from '@/server/db/repository';
import { authenticate } from '@/server/janua';
import type { CvSessionToken } from '@/server/session-token';

export type DocumentLoad =
  | { status: 'signed_out' }
  | { status: 'not_configured' }
  | { status: 'refresh' }
  | { status: 'unavailable' }
  | { status: 'missing' }
  | { status: 'ok'; artifact: ArtifactDto; data: RenderData; job: { id: string; title: string; company: string } | null };

/** The browser's view of a row (the API's `view()`: no owner key; ISO timestamps). */
export function artifactDto(row: Artifact): ArtifactDto {
  const { ownerSub: _owner, ...rest } = row;
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return {
    ...rest,
    kind: rest.kind as ArtifactDto['kind'],
    locale: rest.locale as ArtifactDto['locale'],
    status: rest.status as ArtifactDto['status'],
    visibility: rest.visibility as ArtifactDto['visibility'],
    content: rest.content as ArtifactDto['content'],
    publishedAt: iso(rest.publishedAt),
    suspendedAt: iso(rest.suspendedAt),
    createdAt: rest.createdAt.toISOString(),
    updatedAt: rest.updatedAt.toISOString(),
  };
}

async function verifiedOwner(env: NodeJS.ProcessEnv): Promise<{ sub: string } | DocumentLoad> {
  const verifier = verifierConfig(env);
  if (!verifier) return { status: 'not_configured' };
  const cookieName = sessionCookieName(env);
  let token: CvSessionToken | null;
  try {
    token = (await getToken({ req: { headers: await headers() }, secret: authSecret(env)!, secureCookie: secureAuthCookies(env), cookieName, salt: cookieName })) as CvSessionToken | null;
  } catch {
    token = null;
  }
  if (!token?.sub) return { status: 'signed_out' };
  if (!token.accessToken) return { status: 'refresh' };
  const auth = await authenticate(`Bearer ${token.accessToken}`, verifier);
  if (!auth.ok) return auth.status === 503 ? { status: 'unavailable' } : { status: 'refresh' };
  // The cookie's owner and the token's subject must agree (a refresh never changes the person).
  if (auth.sub !== token.sub) return { status: 'refresh' };
  return { sub: auth.sub };
}

export async function loadOwnerDocument(id: string): Promise<DocumentLoad> {
  const env = process.env;
  if (!isSignInConfigured(env)) return { status: 'signed_out' };
  const owner = await verifiedOwner(env);
  if ('status' in owner) return owner;
  const handle = getSharedDb(env);
  if (!handle) return { status: 'not_configured' };
  try {
    const repo = createRepository(handle.db);
    const row = await repo.getArtifact(owner.sub, id);
    if (!row) return { status: 'missing' };
    const [{ profile, items }, job] = await Promise.all([repo.getProfile(owner.sub), row.jobId ? repo.getJob(owner.sub, row.jobId) : Promise.resolve(null)]);
    return {
      status: 'ok',
      artifact: artifactDto(row),
      data: ownerRenderData(row, profile, items),
      job: job ? { id: job.id, title: job.title, company: job.company } : null,
    };
  } catch (err) {
    const code = (err as { code?: unknown })?.code;
    // The code only: driver messages can carry bound values.
    console.error(`cv documents: read failed ${typeof code === 'string' ? code : 'unknown'}`);
    return { status: 'unavailable' };
  }
}
