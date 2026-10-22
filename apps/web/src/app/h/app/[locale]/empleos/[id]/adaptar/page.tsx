import type { Metadata } from 'next';
import { AppFrame } from '@/components/app/AppFrame';
import { appMetadata, pageLocaleAndId, type IdParams } from '@/components/app/page-helpers';
import { TailorWorkspace } from '@/components/jobs/TailorWorkspace';

export function generateMetadata({ params }: IdParams): Promise<Metadata> {
  return appMetadata(params, 'jobTailor');
}

/** `/empleos/:id/adaptar`: the tailoring workspace (W3-3): selection, order, per-job overrides, one batch create. */
export default async function Page({ params }: IdParams) {
  const { locale, id } = await pageLocaleAndId(params);
  return (
    <AppFrame locale={locale} route="jobTailor" id={id}>
      {() => <TailorWorkspace locale={locale} jobId={id} />}
    </AppFrame>
  );
}
