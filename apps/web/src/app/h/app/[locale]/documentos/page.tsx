import type { Metadata } from 'next';
import { AppFrame } from '@/components/app/AppFrame';
import { UnderConstruction } from '@/components/app/UnderConstruction';
import { appMetadata, pageLocale, type LocaleParams } from '@/components/app/page-helpers';
import { ArtifactQuickList } from './ArtifactQuickList';

export function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  return appMetadata(params, 'artifacts');
}

/**
 * `/documentos`: the person's artifacts. Until W3-4 lands, the «en construcción» notice plus W2's minimal list and
 * create form (real, owner-scoped data through the client data layer; no sample rows). Owner: W3-4.
 */
export default async function Page({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  return (
    <AppFrame locale={locale} route="artifacts">
      {() => (
        <>
          <UnderConstruction locale={locale} route="artifacts" />
          <ArtifactQuickList locale={locale} />
        </>
      )}
    </AppFrame>
  );
}
