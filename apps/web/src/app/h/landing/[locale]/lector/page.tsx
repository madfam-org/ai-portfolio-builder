/**
 * W6-A: the job-link reader page (`/lector`, `/en/lector` on the landing host). It tells a site operator what cv's
 * one-shot fetcher (server/ingest) reads, when, within which limits, what it never does and how to opt out. The
 * User-Agent and the robots token are rendered from the code's own constants, so the page and the reader never drift.
 * Indexing follows the landing (noindex until CV_INDEXABLE).
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LangSwitch, SiteFooter } from '@/components/SiteFooter';
import { PRODUCT_LABEL } from '@/lib/brand';
import { getConfig } from '@/lib/config';
import { COPY, fill, isLocale } from '@/lib/copy/landing';
import { READER_COPY, readerPath } from '@/lib/copy/reader';
import { INTAKE_USER_AGENT, ROBOTS_TOKEN } from '@/server/ingest/fetcher';
import styles from './reader.module.css';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const config = getConfig();
  const t = READER_COPY[locale];
  return {
    title: fill(t.meta.title, PRODUCT_LABEL),
    description: fill(t.meta.description, PRODUCT_LABEL),
    metadataBase: new URL(`https://${config.hosts.landing}`),
    alternates: { canonical: readerPath(locale), languages: { 'es-MX': readerPath('es'), en: readerPath('en') } },
    robots: config.indexable ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export default async function ReaderPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = READER_COPY[locale];
  const other = locale === 'es' ? 'en' : 'es';
  return (
    <>
      <a className="skip" href="#main">
        {COPY[locale].skip}
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="wordmark" href={locale === 'en' ? '/en' : '/'}>
            {PRODUCT_LABEL}
          </a>
          <LangSwitch locale={locale} href={readerPath(other)} />
        </div>
      </header>
      <main id="main" className={styles.page}>
        <p className="badge">{t.badge}</p>
        <h1>{fill(t.headline, PRODUCT_LABEL)}</h1>
        <p className="lead">{fill(t.lead, PRODUCT_LABEL)}</p>

        <section className={styles.section} aria-labelledby="identity">
          <h2 id="identity">{t.identity.title}</h2>
          <dl className={styles.facts}>
            <dt>{t.identity.uaLabel}</dt>
            <dd>
              <code data-testid="reader-ua">{INTAKE_USER_AGENT}</code>
            </dd>
            <dt>{t.identity.tokenLabel}</dt>
            <dd>
              <code>{ROBOTS_TOKEN}</code>
            </dd>
          </dl>
          <p className="muted small">{t.identity.note}</p>
        </section>

        {t.sections.map((s) => (
          <section key={s.id} className={styles.section} aria-labelledby={s.id}>
            <h2 id={s.id}>{s.title}</h2>
            {s.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
            {s.list ? (
              <ul className={styles.list}>
                {s.list.map((li) => (
                  <li key={li}>{li}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}

        <section className={styles.section} aria-labelledby="opt-out">
          <h2 id="opt-out">{t.optOut.title}</h2>
          <p>{t.optOut.body}</p>
          <pre className={styles.code} data-testid="reader-robots">
            {t.optOut.example}
          </pre>
          <p>{t.optOut.partial}</p>
          <h3>{t.optOut.contactTitle}</h3>
          <p>
            {t.optOut.contact.split('support@madfam.io')[0]}
            <a href="mailto:support@madfam.io">support@madfam.io</a>
            {t.optOut.contact.split('support@madfam.io')[1]}
          </p>
          <p>
            <a href={locale === 'en' ? '/en' : '/'}>{fill(t.home, PRODUCT_LABEL)}</a>
          </p>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
