import { getConfig } from '@/lib/config';
import { meta } from '@/lib/meta';

export const dynamic = 'force-dynamic';

/** cv-api.madfam.io/api/v1/meta (proxy.ts rewrites it here; this internal path is never public). */
export function GET(): Response {
  return Response.json(meta(getConfig()), { headers: { 'Cache-Control': 'no-store' } });
}
