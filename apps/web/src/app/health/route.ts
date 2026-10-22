import { health } from '@/lib/meta';

export const dynamic = 'force-dynamic';

/** Liveness on ANY Host (kubelet probes use the pod IP): static, no dependency checks. */
export function GET(): Response {
  return Response.json(health(process.env.CV_REVISION || null), { headers: { 'Cache-Control': 'no-store' } });
}
