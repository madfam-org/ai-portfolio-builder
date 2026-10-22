import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HeroArt } from '@/components/HeroArt';
import { LangSwitch, SiteFooter, waitlistHref } from '@/components/SiteFooter';
import { PRODUCT_LABEL, SOURCE_URL } from '@/lib/brand';
import { getConfig } from '@/lib/config';
import { COPY, fill, isLocale } from '@/lib/copy/landing';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const config = getConfig();
  const t = COPY[locale];
  const base = `https://${config.hosts.landing}`;
  return {
    title: fill(t.meta.title, PRODUCT_LABEL),
    description: fill(t.meta.description, PRODUCT_LABEL),
    metadataBase: new URL(base),
    alternates: { canonical: locale === 'en' ? '/en' : '/', languages: { 'es-MX': '/', en: '/en' } },
    robots: config.indexable ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      title: fill(t.meta.title, PRODUCT_LABEL),
      description: fill(t.meta.description, PRODUCT_LABEL),
      locale: locale === 'en' ? 'en_US' : 'es_MX',
      type: 'website',
    },
  };
}

export default async function Landing({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = COPY[locale];
  const name = PRODUCT_LABEL;
  return (
    <>
      <a className="skip" href="#main">
        {t.skip}
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="wordmark">{name}</span>
          <LangSwitch locale={locale} />
        </div>
      </header>
      <main id="main">
        <section className="hero" aria-labelledby="headline">
          <div className="hero-copy">
            <p className="badge">{t.badge}</p>
            <h1 id="headline">{t.headline}</h1>
            <p className="lead">{fill(t.lead, name)}</p>
            <div className="actions">
              <a className="button" href={waitlistHref(locale)}>
                {t.cta}
              </a>
              <a className="button button-secondary" href={SOURCE_URL} rel="noopener">
                {t.source}
              </a>
            </div>
            <p className="muted small">{t.ctaNote}</p>
          </div>
          <HeroArt />
        </section>

        <section className="band" aria-labelledby="building">
          <h2 id="building">{t.buildingTitle}</h2>
          <p className="muted">{t.buildingIntro}</p>
          <ul className="cards">
            {t.building.map((item) => (
              <li key={item.title} className="card">
                <span className="tag">{item.tag}</span>
                <h3>{item.title}</h3>
                <p>{fill(item.body, name)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="band" aria-labelledby="ecosystem">
          <h2 id="ecosystem">{t.ecosystemTitle}</h2>
          <p className="muted">{fill(t.ecosystemIntro, name)}</p>
          <ul className="cards cards-3">
            {t.ecosystem.map((item) => (
              <li key={item.title} className="card">
                <span className={item.live ? 'tag tag-live' : 'tag'}>{item.tag}</span>
                <h3>{item.title}</h3>
                <p>{fill(item.body, name)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="band status" aria-labelledby="status">
          <h2 id="status">{t.statusTitle}</h2>
          <p>{t.status}</p>
          <p>
            <a className="button" href={waitlistHref(locale)}>
              {t.cta}
            </a>
          </p>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
