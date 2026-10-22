import { handlers } from '@/auth';
import { isSignInConfigured } from '@/lib/auth-env';
import { notConfigured } from '@/lib/public-origin';
import type { NextRequest } from 'next/server';

/**
 * Auth.js endpoints on cv-app.madfam.io only (proxy.ts routes /api/auth/* here on the app host and 404s it on every
 * other host): sign-in, the Janua callback /api/auth/callback/janua, session, CSRF. Dormant until every AUTH_* value
 * is set: 503 {"error":"not_configured"}.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  return isSignInConfigured(process.env) ? handlers.GET(request) : notConfigured();
}

export async function POST(request: NextRequest): Promise<Response> {
  return isSignInConfigured(process.env) ? handlers.POST(request) : notConfigured();
}
