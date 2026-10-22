/** Spec helpers: sessions for the two owners, and direct API calls (seeding) with a Host header. */
import { request } from 'node:http';
import type { BrowserContext, Page } from '@playwright/test';
import { E2E_MINT_PORT, E2E_PORT, HOSTS } from './env.ts';

interface Person {
  sub: string;
  name: string;
  email: string;
}

async function mint(path: 'token' | 'session', who: Person): Promise<{ accessToken: string; cookie?: { name: string; value: string } }> {
  const q = new URLSearchParams({ sub: who.sub, name: who.name, email: who.email });
  const res = await fetch(`http://127.0.0.1:${E2E_MINT_PORT}/${path}?${q}`);
  if (!res.ok) throw new Error(`mint ${path} failed: ${res.status}`);
  return (await res.json()) as { accessToken: string; cookie?: { name: string; value: string } };
}

/** Signs the browser context in as `who` on the app host (the host-only cookie Auth.js sets after Janua). */
export async function signIn(context: BrowserContext, who: Person): Promise<void> {
  const { cookie } = await mint('session', who);
  if (!cookie) throw new Error('mint returned no cookie');
  await context.addCookies([{ ...cookie, domain: HOSTS.app, path: '/', httpOnly: true, sameSite: 'Lax', secure: false }]);
}

export interface Raw {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/** A raw HTTP request to the standalone server with an explicit Host (Node does not resolve *.localhost itself). */
export function raw(host: keyof typeof HOSTS, method: string, path: string, opts: { headers?: Record<string, string>; body?: unknown } = {}): Promise<Raw> {
  const payload = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  return new Promise((resolve, reject) => {
    const req = request(
      { host: 'localhost', port: E2E_PORT, path, method, headers: { Host: `${HOSTS[host]}:${E2E_PORT}`, ...(payload ? { 'Content-Type': 'application/json' } : {}), ...opts.headers } },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

// Test-only: specs walk nested JSON response bodies.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = Record<string, any>;

/** cv-api.localhost as `who` (a real RS256 token from the local issuer). Returns status and parsed JSON. */
export async function apiAs(who: Person, method: string, path: string, body?: unknown): Promise<{ status: number; json: Json | null }> {
  const { accessToken } = await mint('token', who);
  const res = await raw('api', method, path, { headers: { Authorization: `Bearer ${accessToken}` }, body });
  return { status: res.status, json: res.body ? (JSON.parse(res.body) as Json) : null };
}

/** Collects CSP violations the page reports in its console (a blocked inline style or script fails the spec). */
export function cspViolations(page: Page): string[] {
  const seen: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to (apply|execute|load)/i.test(m.text())) seen.push(m.text());
  });
  return seen;
}
