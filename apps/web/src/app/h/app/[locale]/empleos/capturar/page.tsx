import type { Metadata } from 'next';
import { AppFrame } from '@/components/app/AppFrame';
import { appMetadata, pageLocale, type LocaleParams } from '@/components/app/page-helpers';
import { CaptureReceiver, CaptureStash } from '@/components/jobs/intake/CaptureReceiver';
import { PageHeader } from '@/components/ui/Layout';
import { INGEST_COPY } from '@/lib/copy/ingest';

export function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  return appMetadata(params, 'jobCapture');
}

/**
 * `/empleos/capturar` (W5-J): the tab the «Capturar vacante» bookmark opens, with the capture in the URL fragment.
 * CaptureStash sits outside the frame so a capture survives signing in first.
 */
export default async function Page({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  const t = INGEST_COPY[locale];
  return (
    <>
      <CaptureStash />
      <AppFrame locale={locale} route="jobCapture">
        {() => (
          <>
            <PageHeader title={t.receiver.title} />
            <CaptureReceiver locale={locale} />
          </>
        )}
      </AppFrame>
    </>
  );
}
