import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArtifactView } from '@/components/render/ArtifactView';
import { PagesFooter } from '@/components/render/PagesFooter';
import styles from '../../pages.module.css';
import { loadPublic, pageLocale, pageTitle } from '../../load';

type Props = { params: Promise<{ slug: string }> };

/** Robots in the page agree with the proxy's X-Robots-Tag: indexed only when the owner chose `indexable`. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await loadPublic((await params).slug);
  if (!data) return { robots: { index: false, follow: false } };
  const index = data.artifact.indexable;
  return { title: pageTitle(data), robots: { index, follow: index } };
}

/** `https://<pages host>/<slug>`: a public artifact. Owner: W3-4. */
export default async function PublicPage({ params }: Props) {
  const { slug } = await params;
  const data = await loadPublic(slug);
  if (!data) notFound();
  const locale = pageLocale(data);
  return (
    <>
      <main className={`shell ${styles.main}`} id="main">
        <ArtifactView data={data} />
      </main>
      <PagesFooter locale={locale} page={{ share: 'public', slug }} />
    </>
  );
}
