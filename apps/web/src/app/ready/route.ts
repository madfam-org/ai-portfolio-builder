import { getConfig } from '@/lib/config';
import { readiness } from '@/lib/meta';

export const dynamic = 'force-dynamic';

/** Readiness on ANY Host: 200 while the configuration is valid (wave 1 has no dependency), else 503. */
export function GET(): Response {
  const { status, body } = readiness(getConfig);
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
