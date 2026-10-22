import type { Metadata } from 'next';
import { AppFrame } from '@/components/app/AppFrame';
import { appMetadata, pageLocale, type LocaleParams } from '@/components/app/page-helpers';
import { JobsBoard } from '@/components/jobs/JobsBoard';
import { PageHeader } from '@/components/ui/Layout';
import { APP_COPY } from '@/lib/copy/app';
import { JOBS_COPY } from '@/lib/copy/jobs';

export function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  return appMetadata(params, 'jobs');
}

/** `/empleos`: job intake and the application pipeline (W3-3). */
export default async function Page({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  return (
    <AppFrame locale={locale} route="jobs">
      {() => (
        <>
          <PageHeader title={APP_COPY[locale].routes.jobs} description={JOBS_COPY[locale].intro} />
          <JobsBoard locale={locale} />
        </>
      )}
    </AppFrame>
  );
}
