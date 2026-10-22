import { getConfig } from '@/lib/config';
import { sitemapXml } from '@/lib/robots';

export const dynamic = 'force-dynamic';

/** The landing's sitemap; proxy.ts routes /sitemap.xml here only while CV_INDEXABLE=true. */
export function GET(): Response {
  const config = getConfig();
  if (!config.indexable) return new Response('Not Found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  return new Response(sitemapXml(config), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
