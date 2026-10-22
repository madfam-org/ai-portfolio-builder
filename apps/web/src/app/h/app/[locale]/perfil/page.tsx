import type { Metadata } from 'next';
import { AppFrame } from '@/components/app/AppFrame';
import { UnderConstruction } from '@/components/app/UnderConstruction';
import { appMetadata, pageLocale, type LocaleParams } from '@/components/app/page-helpers';

export function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  return appMetadata(params, 'profile');
}

/** `/perfil`: the core profile editor. Placeholder declared by W3-1; owner: W3-2 (src/app/h/app/[locale]/perfil/**). */
export default async function Page({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  return <AppFrame locale={locale} route="profile">{() => <UnderConstruction locale={locale} route="profile" />}</AppFrame>;
}
