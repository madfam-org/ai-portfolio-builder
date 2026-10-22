import type { Metadata } from 'next';
import { AppFrame } from '@/components/app/AppFrame';
import { appMetadata, pageLocale, type LocaleParams } from '@/components/app/page-helpers';
import { LinkCards, PageHeader } from '@/components/ui/Layout';
import { appPath } from '@/lib/app-routes';
import { APP_COPY } from '@/lib/copy/app';

export function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  return appMetadata(params, 'home');
}

/** cv-app.madfam.io `/` and `/en`: the app's home. Signed in, it points to the three parts of the core journey. */
export default async function AppHome({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  const a = APP_COPY[locale];
  return (
    <AppFrame locale={locale} route="home">
      {() => (
        <>
          <PageHeader title={a.routes.home} description={a.homeIntro} />
          <LinkCards cards={a.homeCards.map((c) => ({ href: appPath[c.name](locale), title: a.routes[c.name], body: c.body }))} />
        </>
      )}
    </AppFrame>
  );
}
