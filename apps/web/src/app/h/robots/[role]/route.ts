import { getConfig, type Role } from '@/lib/config';
import { robotsTxt } from '@/lib/robots';

export const dynamic = 'force-dynamic';

const ROLES: readonly Role[] = ['landing', 'app', 'api'];

/** /robots.txt of each host (proxy.ts rewrites it here with the host's role). */
export async function GET(_req: Request, ctx: { params: Promise<{ role: string }> }): Promise<Response> {
  const { role } = await ctx.params;
  const known = ROLES.find((r) => r === role);
  if (!known) return new Response('Not Found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  return new Response(robotsTxt(known, getConfig()), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
