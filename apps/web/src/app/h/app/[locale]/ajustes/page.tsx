import type { Metadata } from 'next';
import { AppFrame } from '@/components/app/AppFrame';
import { appMetadata, pageLocale, type LocaleParams } from '@/components/app/page-helpers';
import { PageHeader } from '@/components/ui/Layout';
import { januaIssuer } from '@/lib/auth-env';
import { APP_COPY } from '@/lib/copy/app';
import { DataRights } from './ui/DataRights';

export function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  return appMetadata(params, 'settings');
}

/** The Janua account's home (the issuer's origin): where the account itself is managed; this app never deletes it. */
function januaAccountUrl(): string | null {
  const issuer = januaIssuer(process.env);
  if (!issuer) return null;
  try {
    return new URL(issuer).origin;
  } catch {
    return null;
  }
}

/** `/ajustes`: the person's data rights (W4-I): download everything, export as JSON Resume, delete everything. */
export default async function Page({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  return (
    <AppFrame locale={locale} route="settings">
      {() => (
        <>
          <PageHeader title={APP_COPY[locale].routes.settings} />
          <DataRights locale={locale} accountUrl={januaAccountUrl()} />
        </>
      )}
    </AppFrame>
  );
}
