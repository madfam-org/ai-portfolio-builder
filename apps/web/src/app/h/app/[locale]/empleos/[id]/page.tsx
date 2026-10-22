import type { Metadata } from 'next';
import { AppFrame } from '@/components/app/AppFrame';
import { appMetadata, pageLocaleAndId, type IdParams } from '@/components/app/page-helpers';
import { JobDetail } from '@/components/jobs/JobDetail';

export function generateMetadata({ params }: IdParams): Promise<Metadata> {
  return appMetadata(params, 'job');
}

/**
 * `/empleos/:id`: one job, its keyword match and its documents (W3-3). The data is read in the browser through the
 * same-origin API proxy (the API's bearer check is the only access rule); another person's id renders the honest
 * «no encontramos este empleo» state from the API's 404.
 */
export default async function Page({ params }: IdParams) {
  const { locale, id } = await pageLocaleAndId(params);
  return (
    <AppFrame locale={locale} route="job" id={id}>
      {() => <JobDetail locale={locale} jobId={id} />}
    </AppFrame>
  );
}
