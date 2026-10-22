import { PageHeader } from '@/components/ui/Layout';
import { Badge, Notice } from '@/components/ui/States';
import type { AppRouteName } from '@/lib/app-routes';
import { APP_COPY } from '@/lib/copy/app';
import type { Locale } from '@/lib/routing';

/**
 * The honest placeholder of a page whose PR has not landed: its title, «En construcción», and what the page will do.
 * No sample data, no fake controls.
 */
export function UnderConstruction({ locale, route }: { locale: Locale; route: AppRouteName }) {
  const a = APP_COPY[locale];
  return (
    <>
      <PageHeader eyebrow={<Badge>{a.construction.badge}</Badge>} title={a.routes[route]} description={a.construction.next[route]} />
      <Notice>{a.construction.body}</Notice>
    </>
  );
}
