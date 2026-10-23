/**
 * W5-J: job boards whose robots.txt or terms forbid cv's server from fetching a job page, even once on a person's
 * request. For these, cv never connects: the intake answers `capture_only` and offers the person's OWN browser
 * («Capturar desde tu navegador»: the bookmarklet reads the page they already have open), a paste or a file.
 *
 * Evidence, checked 2026-10-22 (the W5-J report has the quotes):
 * - LinkedIn: robots.txt `User-agent: *` / `Disallow: /`; User Agreement §8.2 bans scripts, robots and scraping.
 * - Indeed: robots.txt disallows /viewjob, /m/viewjob, /rc/; the terms ban bots and scrapers without permission.
 * - Google (search, including Google Jobs): robots.txt disallows /search; the terms ban automated access.
 * - Glassdoor: robots.txt disallows the job-listing detail patterns and blocks AI agents entirely.
 * - Talent.com: the terms ban automated or non-automated scraping.
 * - Computrabajo: robots.txt and the terms answer 403 to non-browser clients; unverifiable, so treated as forbidding.
 * - LVMH (lvmh.com, the group site that lists the maisons' postings), W7 (B3), checked 2026-10-22: robots.txt allows
 *   the job pages, but the legal terms (https://www.lvmh.com/en/legal-terms) allow reproduction only for personal and
 *   private use and expressly prohibit extracting the content for other purposes. The person's own browser reads it.
 * Boards whose robots.txt allows the job page and whose terms we found no ban in (OCC Mundial, Bumeran) go through the
 * normal path: robots.txt is checked live, and a 403 from bot protection is reported honestly, never retried or evaded.
 */

export interface BoardRule {
  id: string;
  name: string;
  match: RegExp;
}

export const CAPTURE_ONLY_BOARDS: readonly BoardRule[] = [
  { id: 'linkedin', name: 'LinkedIn', match: /(^|\.)(linkedin\.com|lnkd\.in)$/ },
  { id: 'indeed', name: 'Indeed', match: /(^|\.)indeed\.(com|com\.mx|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/ },
  { id: 'google', name: 'Google', match: /(^|\.)google\.(com|com\.mx|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/ },
  { id: 'glassdoor', name: 'Glassdoor', match: /(^|\.)glassdoor\.(com|com\.mx|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/ },
  { id: 'talent', name: 'Talent.com', match: /(^|\.)talent\.com$/ },
  { id: 'lvmh', name: 'LVMH', match: /(^|\.)lvmh\.com$/ },
  { id: 'computrabajo', name: 'Computrabajo', match: /(^|\.)computrabajo\.(com|com\.mx|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/ },
];

/** The board when cv must not fetch this host; null otherwise. */
export function captureOnlyBoard(hostname: string): BoardRule | null {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  return CAPTURE_ONLY_BOARDS.find((b) => b.match.test(h)) ?? null;
}
