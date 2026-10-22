import type { Metadata } from 'next';
import { AppFrame } from '@/components/app/AppFrame';
import { appMetadata, pageLocale, type LocaleParams } from '@/components/app/page-helpers';
import { PageHeader } from '@/components/ui/Layout';
import { APP_COPY } from '@/lib/copy/app';
import { DocumentList } from './ui/DocumentList';

export function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  return appMetadata(params, 'artifacts');
}

/** `/documentos`: the person's artifacts (filter by job, kind and status), each with preview and print. Owner: W3-4. */
export default async function Page({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  return (
    <AppFrame locale={locale} route="artifacts">
      {() => (
        <>
          <PageHeader title={APP_COPY[locale].routes.artifacts} />
          <DocumentList locale={locale} />
        </>
      )}
    </AppFrame>
  );
}
