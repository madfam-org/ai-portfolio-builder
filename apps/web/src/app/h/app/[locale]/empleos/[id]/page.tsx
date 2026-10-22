import type { Metadata } from 'next';
import { AppFrame } from '@/components/app/AppFrame';
import { UnderConstruction } from '@/components/app/UnderConstruction';
import { appMetadata, pageLocaleAndId, type IdParams } from '@/components/app/page-helpers';

export function generateMetadata({ params }: IdParams): Promise<Metadata> {
  return appMetadata(params, 'job');
}

/** `/empleos/:id`: one job. Placeholder declared by W3-1; owner: W3-3. */
export default async function Page({ params }: IdParams) {
  const { locale, id } = await pageLocaleAndId(params);
  return <AppFrame locale={locale} route="job" id={id}>{() => <UnderConstruction locale={locale} route="job" />}</AppFrame>;
}
