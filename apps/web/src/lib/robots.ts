/**
 * robots.txt per host.
 *
 * R40 (estate AI-crawler policy): the named AI crawlers are ALLOWED on public landing hosts and BLOCKED
 * on app, API and admin hosts.
 *
 * While the landing is noindex (CV_INDEXABLE unset or false) its robots.txt still allows crawling: a
 * crawler that is disallowed never fetches the page, never sees the `noindex` header, and may index the
 * bare URL from links. noindex is carried by the X-Robots-Tag header and the robots meta tag instead.
 * The sitemap line appears only when the landing is indexable (routing.ts serves /sitemap.xml only then).
 */
import type { Config, Role } from './config.ts';

export const R40_AI_CRAWLERS: readonly string[] = [
  'ClaudeBot',
  'anthropic-ai',
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'Google-Extended',
  'CCBot',
  'Applebot-Extended',
];

function group(agents: readonly string[], rule: string): string {
  return `${agents.map((a) => `User-agent: ${a}`).join('\n')}\n${rule}\n`;
}

export function robotsTxt(role: Role, config: Config): string {
  if (role === 'landing') {
    const parts = [
      '# Public landing host. AI crawlers are allowed here (MADFAM estate policy R40).',
      config.indexable
        ? '# Indexable: CV_INDEXABLE=true.'
        : '# Not indexed yet: every page answers X-Robots-Tag: noindex until the brand is ruled.',
      group(R40_AI_CRAWLERS, 'Allow: /'),
      group(['*'], 'Allow: /'),
    ];
    if (config.indexable) parts.push(`Sitemap: https://${config.hosts.landing}/sitemap.xml\n`);
    return parts.join('\n');
  }
  if (role === 'pages') {
    // Crawling is allowed so a crawler sees each page's own X-Robots-Tag: every page is noindex (and noai) unless
    // its owner chose to be indexed, which only a public page can be. No sitemap: listing people's pages is a
    // later, opt-in decision (lane X §3.3).
    return [
      '# User pages host: public and link-shared pages that people publish (MADFAM estate policy R40).',
      '# Every page is noindex, nofollow, noai, noimageai unless its owner chose to be indexed.',
      group(R40_AI_CRAWLERS, 'Allow: /'),
      group(['*'], 'Allow: /'),
    ].join('\n');
  }
  return [
    `# ${role === 'app' ? 'Application' : 'API'} host: nothing here is for crawlers (MADFAM estate policy R40).`,
    group(R40_AI_CRAWLERS, 'Disallow: /'),
    group(['*'], 'Disallow: /'),
  ].join('\n');
}

export function sitemapXml(config: Config): string {
  const base = `https://${config.hosts.landing}`;
  const url = (loc: string) =>
    [
      '  <url>',
      `    <loc>${loc}</loc>`,
      `    <xhtml:link rel="alternate" hreflang="es-MX" href="${base}/"/>`,
      `    <xhtml:link rel="alternate" hreflang="en" href="${base}/en"/>`,
      '  </url>',
    ].join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    url(`${base}/`),
    url(`${base}/en`),
    '</urlset>',
    '',
  ].join('\n');
}
