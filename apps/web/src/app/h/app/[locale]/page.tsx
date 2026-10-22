import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LangSwitch, SiteFooter, waitlistHref } from '@/components/SiteFooter';
import { PRODUCT_LABEL } from '@/lib/brand';
import { getConfig } from '@/lib/config';
import { COPY, fill, isLocale } from '@/lib/copy';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: fill(COPY[locale].meta.appTitle, PRODUCT_LABEL), robots: { index: false, follow: false } };
}

/** cv-app.madfam.io: the pre-launch app shell. Janua sign-in is the next wave; nothing is stored here. */
export default async function AppShell({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = COPY[locale];
  const landing = `https://${getConfig().hosts.landing}${locale === 'en' ? '/en' : '/'}`;
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="wordmark">{PRODUCT_LABEL}</span>
          <LangSwitch locale={locale} />
        </div>
      </header>
      <main className="shell" id="main">
        <p className="badge">{t.app.badge}</p>
        <h1 className="shell-title">{t.app.headline}</h1>
        <p className="lead">{fill(t.app.body, PRODUCT_LABEL)}</p>
        <div className="actions">
          <a className="button" href={waitlistHref(locale)}>
            {t.cta}
          </a>
          <a className="button button-secondary" href={landing}>
            {t.app.back}
          </a>
        </div>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
