import { handlers } from '@/auth';
import { jsonResponse } from '@/lib/public-origin';
import { readServerSession } from '@/server/server-session';
import { signOut } from '@/server/sign-out';

/**
 * `POST /auth/salir`, «Cerrar sesión» (R44, RP-initiated logout): same-origin only; revokes the Janua refresh token
 * (best effort, ≤ 3 s), expires the session cookie and every chunk, then 303 to Janua's end_session_endpoint. The
 * rules live in `src/server/sign-out.ts` (unit-tested against a fake Janua: `test/sign-out.test.ts`).
 */
export const dynamic = 'force-dynamic';

export function POST(request: Request): Promise<Response> {
  const env = process.env;
  return signOut(request, env, { readSession: (r) => readServerSession(r, handlers.GET, env) });
}

export function GET(): Response {
  return jsonResponse(405, { error: 'method_not_allowed' }, { Allow: 'POST' });
}
