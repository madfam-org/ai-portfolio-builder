import { getSharedDb } from '@/server/db/client';
import { handleApi } from '@/server/api/handler';

/**
 * cv-api.madfam.io/api/v1/* (proxy.ts rewrites the allow-listed paths here; this internal path is never public).
 * Bearer-authenticated, owner-scoped (server/api/handler.ts). `/api/v1/meta` keeps its own route.
 * Dormant: without AUTH_JANUA_ISSUER or a database URL the routes answer 503 {"error":"not_configured"}.
 */
export const dynamic = 'force-dynamic';

async function handle(request: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  return handleApi(request, path, { env: process.env, getDb: () => getSharedDb(process.env) });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
