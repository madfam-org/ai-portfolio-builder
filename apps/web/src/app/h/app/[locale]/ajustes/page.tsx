import type { Metadata } from 'next';
import { AppFrame } from '@/components/app/AppFrame';
import { UnderConstruction } from '@/components/app/UnderConstruction';
import { appMetadata, pageLocale, type LocaleParams } from '@/components/app/page-helpers';

export function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  return appMetadata(params, 'settings');
}

/** `/ajustes`: account and data settings. Placeholder declared by W3-1; owner: W3-1 until a later PR claims it. */
export default async function Page({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  return <AppFrame locale={locale} route="settings">{() => <UnderConstruction locale={locale} route="settings" />}</AppFrame>;
}
