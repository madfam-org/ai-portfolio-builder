import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArtifactView } from '@/components/render/ArtifactView';
import { PagesFooter } from '@/components/render/PagesFooter';
import { loadLink, pageLocale, pageTitle } from '../../load';

type Props = { params: Promise<{ token: string }> };

/** Never indexed (the proxy also sends noindex, no-store and no-referrer). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await loadLink((await params).token);
  return { title: data ? pageTitle(data) : undefined, robots: { index: false, follow: false } };
}

/** `https://<pages host>/l/<token>`: a link-shared artifact (whoever has the link). Owner: W3-4. */
export default async function LinkPage({ params }: Props) {
  const data = await loadLink((await params).token);
  if (!data) notFound();
  const locale = pageLocale(data);
  return (
    <>
      <main className="shell doc-shell" id="main">
        <ArtifactView data={data} locale={locale} />
      </main>
      <PagesFooter locale={locale} page={{ share: 'link' }} />
    </>
  );
}
