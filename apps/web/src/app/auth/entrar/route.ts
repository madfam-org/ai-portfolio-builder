import { signIn } from '@/auth';
import { JANUA_PROVIDER_ID, isSignInConfigured, sessionCookieName, secureAuthCookies } from '@/lib/auth-env';
import { isSameOriginRequest, jsonResponse, notConfigured, safeRedirectPath } from '@/lib/public-origin';
import { expireSessionCookies, parseCookieHeader } from '@/lib/session-cookies';
import { uiLocalesFor } from '@/lib/ui-locales';

/**
 * `POST /auth/entrar` (a plain form on the app shell; same-origin only, 403 otherwise; GET 405):
 * - no `prompt`: «Iniciar sesión», a live Janua session is reused;
 * - `prompt=select_account`: «Cambiar de cuenta», Janua shows its account chooser;
 * - `prompt=login`: «Entrar como otra persona», Janua asks for credentials even with a live session.
 * Every variant sends Janua `ui_locales` (es-MX, or `en` when `redirect_to` is an `/en` page).
 * The two switches first end the cv session (its cookie and every chunk), so a cancelled switch never leaves the
 * previous person signed in (R44; voxa apps/web/src/lib/account-switch.ts). Answers 303 to Janua's /authorize.
 */
export const dynamic = 'force-dynamic';

const PROMPTS = new Set(['select_account', 'login']);

export async function POST(request: Request): Promise<Response> {
  const env = process.env;
  if (!isSignInConfigured(env)) return notConfigured();
  if (!isSameOriginRequest(request, env)) return jsonResponse(403, { error: 'cross_origin' });
  const form = await request.formData().catch(() => null);
  const prompt = form?.get('prompt');
  if (prompt !== null && prompt !== undefined && prompt !== '' && !(typeof prompt === 'string' && PROMPTS.has(prompt))) {
    return jsonResponse(400, { error: 'invalid_prompt' });
  }
  const redirectTo = safeRedirectPath(form?.get('redirect_to'));
  const switching = typeof prompt === 'string' && PROMPTS.has(prompt);
  // Janua's pages follow the page the person signs in from (`redirect_to`): es-MX, or English under `/en`.
  const params: Record<string, string> = { ui_locales: uiLocalesFor(redirectTo) };
  if (switching) params.prompt = prompt as string;
  const location = (await signIn(JANUA_PROVIDER_ID, { redirect: false, redirectTo }, params)) as string;
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  if (switching) for (const line of expireSessionCookies(parseCookieHeader(request.headers.get('cookie')), sessionCookieName(env), secureAuthCookies(env))) headers.append('Set-Cookie', line);
  return new Response(null, { status: 303, headers });
}

export function GET(): Response {
  return jsonResponse(405, { error: 'method_not_allowed' }, { Allow: 'POST' });
}
