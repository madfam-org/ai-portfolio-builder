import type { Metadata } from 'next';
import { AppFrame } from '@/components/app/AppFrame';
import { UnderConstruction } from '@/components/app/UnderConstruction';
import { appMetadata, pageLocaleAndId, type IdParams } from '@/components/app/page-helpers';

export function generateMetadata({ params }: IdParams): Promise<Metadata> {
  return appMetadata(params, 'artifactPreview');
}

/** `/documentos/:id/vista-previa`: the preview, through the same renderer as the pages host. Placeholder declared by W3-1; owner: W3-4. */
export default async function Page({ params }: IdParams) {
  const { locale, id } = await pageLocaleAndId(params);
  return <AppFrame locale={locale} route="artifactPreview" id={id}>{() => <UnderConstruction locale={locale} route="artifactPreview" />}</AppFrame>;
}
