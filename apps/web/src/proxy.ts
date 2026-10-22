/**
 * Next.js Proxy (the v16 name for Middleware; Node.js runtime by default). A thin adapter: the routing
 * rules live in lib/routing.ts and the header rules in lib/headers.ts, both unit-tested.
 *
 * It runs on every request (no matcher), so an unknown Host is a 404 even for /_next assets.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { januaIssuer } from './lib/auth-env.ts';
import { getConfig, type Config } from './lib/config.ts';
import { BASELINE_HEADERS, LOCKED_CSP, htmlCsp, newNonce, pagesCsp, robotsTag, userPageHeaders } from './lib/headers.ts';
import { NOT_FOUND_ROUTE, decide, type Decision } from './lib/routing.ts';
import { gateUserPage } from './server/pages-gate.ts';
import { checkRead, readSurface, tooManyText, type ReadSurface } from './server/read-limit.ts';

function finish(res: NextResponse, decision: Decision, config: Config | null, csp: string, extra: Record<string, string> = {}): NextResponse {
  for (const [k, v] of Object.entries(BASELINE_HEADERS)) res.headers.set(k, v);
  res.headers.set('Content-Security-Policy', csp);
  res.headers.set('X-Robots-Tag', config ? robotsTag(decision.role, config) : 'noindex, nofollow');
  for (const [k, v] of Object.entries(extra)) res.headers.set(k, v);
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

function rewriteHtml(req: NextRequest, to: string, locale: string, decision: Decision, config: Config, extra: Record<string, string> = {}): NextResponse {
  const nonce = newNonce();
  const csp = decision.role === 'pages' ? pagesCsp(nonce, config.dev) : htmlCsp(nonce, config.dev, formTargets(decision));
  const requestHeaders = new Headers(req.headers);
  // Next.js reads the nonce from the request's policy and stamps it on the scripts it renders.
  requestHeaders.set('Content-Security-Policy', csp);
  requestHeaders.set('x-cv-locale', locale);
  // Which surface is rendering (the shared 404 page links home on its own host).
  requestHeaders.set('x-cv-role', decision.role ?? '');
  const res = NextResponse.rewrite(internal(req, to), { request: { headers: requestHeaders } });
  return finish(res, decision, config, csp, extra);
}

function text(status: number, body: string, extra: Record<string, string> = {}): NextResponse {
  return new NextResponse(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...extra } });
}

/** W6-A: an honest 429 for a client over its read budget (server/read-limit.ts); no database work was done. */
function tooMany(surface: ReadSurface, retryAfter: number, decision: Decision, config: Config): NextResponse {
  const extra: Record<string, string> = { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' };
  if (decision.kind === 'user-page' && decision.share === 'link') extra['Referrer-Policy'] = 'no-referrer';
  const res = surface === 'public-api' ? NextResponse.json({ error: 'rate_limited', retryAfter }, { status: 429 }) : text(429, tooManyText(retryAfter));
  // Through `finish`'s extra headers, applied after the baseline (a link page's no-referrer must win over it).
  return finish(res, decision, config, LOCKED_CSP, extra);
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
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
    const res = probe ? NextResponse.next() : text(500, 'Service misconfigured\n');
    return finish(res, { kind: 'probe', role: null }, null, LOCKED_CSP);
  }

  const decision = decide(req.headers.get('host'), path, config);
  // Unauthenticated reads (the pages host, cv-api's public reads) are counted per client BEFORE any lookup.
  const surface = readSurface(decision);
  if (surface) {
    const wait = checkRead(surface, req.headers, config.readLimit);
    if (wait > 0) return tooMany(surface, wait, decision, config);
  }
  switch (decision.kind) {
    case 'probe':
    case 'pass':
    case 'asset':
      return finish(NextResponse.next(), decision, config, LOCKED_CSP);
    case 'rewrite':
      if (decision.html) return rewriteHtml(req, decision.to, decision.locale ?? 'es', decision, config);
      return finish(NextResponse.rewrite(internal(req, decision.to)), decision, config, LOCKED_CSP);
    case 'user-page': {
      const gate = await gateUserPage(decision.share, decision.key);
      if (gate.status === 'unavailable') {
        return finish(text(503, 'Service unavailable\n', { 'Retry-After': '30', 'Cache-Control': 'no-store' }), decision, config, LOCKED_CSP);
      }
      if (gate.status === 'missing') {
        const extra: Record<string, string> = decision.share === 'link' ? { 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' } : { 'Cache-Control': 'no-store' };
        return rewriteHtml(req, NOT_FOUND_ROUTE, 'es', decision, config, extra);
      }
      return rewriteHtml(req, decision.to, gate.locale, decision, config, userPageHeaders(decision.share, gate.indexable));
    }
    case 'not-found':
      if (decision.format === 'html') return rewriteHtml(req, NOT_FOUND_ROUTE, 'es', decision, config);
      if (decision.format === 'json') {
        return finish(NextResponse.json({ error: 'not_found' }, { status: 404 }), decision, config, LOCKED_CSP);
      }
      return finish(text(404, 'Not Found\n'), decision, config, LOCKED_CSP);
  }
}
