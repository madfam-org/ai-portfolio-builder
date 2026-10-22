import type { Metadata } from 'next';
import { AppFrame } from '@/components/app/AppFrame';
import { appMetadata, pageLocale, type LocaleParams } from '@/components/app/page-helpers';
import { IntakePanel } from '@/components/jobs/intake/IntakePanel';
import { PageHeader } from '@/components/ui/Layout';
import { INGEST_COPY } from '@/lib/copy/ingest';

export function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  return appMetadata(params, 'jobNew');
}

/** `/empleos/nuevo` (W5-J): add a job posting from a link, a paste, a file or the person's own browser. */
export default async function Page({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  const t = INGEST_COPY[locale];
  return (
    <AppFrame locale={locale} route="jobNew">
      {() => (
        <>
          <PageHeader title={t.title} description={t.intro} />
          <IntakePanel locale={locale} />
        </>
      )}
    </AppFrame>
  );
}
