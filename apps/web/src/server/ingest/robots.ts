/**
 * W5-J: robots.txt (RFC 9309) before any page fetch of a host cv has no documented public API for. cv fetches ONE page
 * per explicit person request, never crawls, and still honours the site's rules for its token (`madfam-cv`) or `*`.
 *
 * - The group whose user-agent line matches `madfam-cv` (case-insensitive) wins; else the `*` group; else allowed.
 * - Longest matching rule wins; on a tie, Allow wins (RFC 9309 §2.2.2). `*` and a trailing `$` are supported.
 * - 2xx: parsed (first 500 KiB). 4xx: no rules, access allowed (§2.3.1.3). 5xx, a network failure or a timeout:
 *   treated as complete disallow (§2.3.1.4). Results are cached per host for an hour (at most 500 hosts).
 */
import { FetchError, ROBOTS_TOKEN, decodeBody, safeFetch, type FetchOptions } from './fetcher.ts';

interface Rule {
  allow: boolean;
  path: string;
}
interface Group {
  agents: string[];
  rules: Rule[];
}

export function parseRobots(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === 'allow' || key === 'disallow') {
      lastWasAgent = false;
      if (!current) continue;
      // An empty Disallow allows everything: it adds no rule.
      if (value === '') continue;
      current.rules.push({ allow: key === 'allow', path: value });
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function ruleMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp(`^${body.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}${anchored ? '$' : ''}`);
  return re.test(path);
}

/** Percent-encoding is normalised on both sides so `/empleo%C3%B3` and `/empleoó` compare equal. */
function normalisePath(p: string): string {
  try {
    return decodeURI(p);
  } catch {
    return p;
  }
}

/** Whether `pathWithQuery` may be fetched by `token` under these groups. */
export function robotsAllows(groups: readonly Group[], pathWithQuery: string, token: string = ROBOTS_TOKEN): boolean {
  const t = token.toLowerCase();
  const group = groups.find((g) => g.agents.some((a) => a !== '*' && (a === t || t.startsWith(a) || a.startsWith(t)))) ?? groups.find((g) => g.agents.includes('*'));
  if (!group) return true;
  const path = normalisePath(pathWithQuery);
  let best: Rule | null = null;
  for (const r of group.rules) {
    const pattern = normalisePath(r.path);
    if (!ruleMatches(pattern, path)) continue;
    const len = pattern.replace(/\$$/, '').length;
    const bestLen = best ? normalisePath(best.path).replace(/\$$/, '').length : -1;
    if (len > bestLen || (len === bestLen && r.allow && !best!.allow)) best = r;
  }
  return best ? best.allow : true;
}

export type RobotsVerdict = 'allowed' | 'disallowed' | 'unreachable';

const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; groups: Group[] | 'unreachable' }>();

/** For tests. */
export function clearRobotsCache(): void {
  cache.clear();
}

async function loadGroups(origin: URL, opts: Omit<FetchOptions, 'accept'>): Promise<Group[] | 'unreachable'> {
  const hit = cache.get(origin.host);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.groups;
  let groups: Group[] | 'unreachable';
  try {
    const doc = await safeFetch(new URL('/robots.txt', origin), { ...opts, accept: ['*'], maxBytes: 500 * 1024 });
    groups = parseRobots(decodeBody(doc));
  } catch (err) {
    const status = err instanceof FetchError ? err.status : null;
    if (err instanceof FetchError && err.code === 'too_large') groups = 'unreachable';
    else if (status !== null && status >= 400 && status < 500 && status !== 429) groups = [];
    else groups = 'unreachable';
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(origin.host, { at: Date.now(), groups });
  return groups;
}

/** The verdict for one page URL (already validated by `checkUrl`). */
export async function robotsVerdict(url: URL, opts: Omit<FetchOptions, 'accept'> = {}): Promise<RobotsVerdict> {
  const groups = await loadGroups(url, opts);
  if (groups === 'unreachable') return 'unreachable';
  return robotsAllows(groups, `${url.pathname}${url.search}`) ? 'allowed' : 'disallowed';
}
