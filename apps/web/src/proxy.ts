/**
 * Next.js Proxy (the v16 name for Middleware; Node.js runtime by default). A thin adapter: the routing
 * rules live in lib/routing.ts and the header rules in lib/headers.ts, both unit-tested.
 *
 * It runs on every request (no matcher), so an unknown Host is a 404 even for /_next assets.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { januaIssuer } from './lib/auth-env.ts';
import { getConfig, type Config } from './lib/config.ts';
import { BASELINE_HEADERS, LOCKED_CSP, htmlCsp, newNonce, robotsTag } from './lib/headers.ts';
import { NOT_FOUND_ROUTE, decide, type Decision } from './lib/routing.ts';

function finish(res: NextResponse, decision: Decision, config: Config | null, csp: string): NextResponse {
  for (const [k, v] of Object.entries(BASELINE_HEADERS)) res.headers.set(k, v);
  res.headers.set('Content-Security-Policy', csp);
  res.headers.set('X-Robots-Tag', config ? robotsTag(decision.role, config) : 'noindex, nofollow');
  return res;
}

/** An internal rewrite target on the request's own origin (a different origin would make Next proxy it out). */
function internal(req: NextRequest, to: string): URL {
  const url = req.nextUrl.clone();
  url.pathname = to;
  url.search = '';
  return url;
}

/** The app shell's forms post to itself and are redirected to Janua (sign-in, account switching, sign-out). */
function formTargets(decision: Decision): string[] {
  if (decision.role !== 'app') return [];
  const issuer = januaIssuer(process.env);
  return issuer ? ["'self'", new URL(issuer).origin] : ["'self'"];
}

function rewriteHtml(req: NextRequest, to: string, locale: string, decision: Decision, config: Config): NextResponse {
  const csp = htmlCsp(newNonce(), config.dev, formTargets(decision));
  const requestHeaders = new Headers(req.headers);
  // Next.js reads the nonce from the request's policy and stamps it on the scripts it renders.
  requestHeaders.set('Content-Security-Policy', csp);
  requestHeaders.set('x-cv-locale', locale);
  const res = NextResponse.rewrite(internal(req, to), { request: { headers: requestHeaders } });
  return finish(res, decision, config, csp);
}

export function proxy(req: NextRequest): NextResponse {
  let config: Config | null = null;
  try {
    config = getConfig();
  } catch (err) {
    // Fail visible: /ready answers 503 with the reason (instrumentation.ts already refused to boot).
    console.error(err instanceof Error ? err.message : err);
  }

  const path = req.nextUrl.pathname;
  if (!config) {
    const probe = path === '/health' || path === '/ready';
    const res = probe
      ? NextResponse.next()
      : new NextResponse('Service misconfigured\n', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    return finish(res, { kind: 'probe', role: null }, null, LOCKED_CSP);
  }

  const decision = decide(req.headers.get('host'), path, config);
  switch (decision.kind) {
    case 'probe':
    case 'pass':
    case 'asset':
      return finish(NextResponse.next(), decision, config, LOCKED_CSP);
    case 'rewrite':
      if (decision.html) return rewriteHtml(req, decision.to, decision.locale ?? 'es', decision, config);
      return finish(NextResponse.rewrite(internal(req, decision.to)), decision, config, LOCKED_CSP);
    case 'not-found':
      if (decision.format === 'html') {
        const res = rewriteHtml(req, NOT_FOUND_ROUTE, 'es', decision, config);
        return res;
      }
      if (decision.format === 'json') {
        return finish(NextResponse.json({ error: 'not_found' }, { status: 404 }), decision, config, LOCKED_CSP);
      }
      return finish(
        new NextResponse('Not Found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }),
        decision,
        config,
        LOCKED_CSP,
      );
  }
}
