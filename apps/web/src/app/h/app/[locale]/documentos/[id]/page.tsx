import type { Metadata } from 'next';
import { AppFrame } from '@/components/app/AppFrame';
import { UnderConstruction } from '@/components/app/UnderConstruction';
import { appMetadata, pageLocaleAndId, type IdParams } from '@/components/app/page-helpers';

export function generateMetadata({ params }: IdParams): Promise<Metadata> {
  return appMetadata(params, 'artifact');
}

/** `/documentos/:id`: the artifact editor and publish dialog. Placeholder declared by W3-1; owner: W3-4 (src/app/h/app/[locale]/documentos/**). */
export default async function Page({ params }: IdParams) {
  const { locale, id } = await pageLocaleAndId(params);
  return <AppFrame locale={locale} route="artifact" id={id}>{() => <UnderConstruction locale={locale} route="artifact" />}</AppFrame>;
}
