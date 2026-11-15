/**
 * cv's privacy notice (`/privacidad`, `/en/privacidad` on the landing host): the full notice, with the simplified one
 * («En breve») first. Text, version and status come from lib/copy/privacy.ts; while the status is `draft` the page
 * says so and lists what is pending. Indexing follows the landing (noindex until CV_INDEXABLE).
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LangSwitch, SiteFooter } from '@/components/SiteFooter';
import { PRODUCT_LABEL } from '@/lib/brand';
import { getConfig } from '@/lib/config';
import { COPY, fill, isLocale } from '@/lib/copy/landing';
import { PRIVACY_COPY, PRIVACY_NOTICE, privacyPath } from '@/lib/copy/privacy';
import styles from '../lector/reader.module.css';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const config = getConfig();
  const t = PRIVACY_COPY[locale];
  return {
    title: fill(t.meta.title, PRODUCT_LABEL),
    description: fill(t.meta.description, PRODUCT_LABEL),
    metadataBase: new URL(`https://${config.hosts.landing}`),
    alternates: { canonical: privacyPath(locale), languages: { 'es-MX': privacyPath('es'), en: privacyPath('en') } },
    robots: config.indexable ? { index: true, follow: true } : { index: false, follow: false },
  };
}

/** The mailbox as a link wherever a paragraph names it. */
function WithMailbox({ text }: { text: string }) {
  const [before, ...rest] = text.split(PRIVACY_NOTICE.mailbox);
  if (rest.length === 0) return <>{text}</>;
  return (
    <>
      {before}
      <a href={`mailto:${PRIVACY_NOTICE.mailbox}`}>{PRIVACY_NOTICE.mailbox}</a>
      {rest.join(PRIVACY_NOTICE.mailbox)}
    </>
  );
}

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = PRIVACY_COPY[locale];
  const other = locale === 'es' ? 'en' : 'es';
  const draft = PRIVACY_NOTICE.status === 'draft';
  const version = t.versionLabel.replace('{version}', PRIVACY_NOTICE.version).replace('{date}', PRIVACY_NOTICE.updated);
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
          <LangSwitch locale={locale} href={privacyPath(other)} />
        </div>
      </header>
      <main id="main" className={styles.page}>
        <p className="badge" data-testid="privacy-status">
          {draft ? t.draftBadge : t.badge}
        </p>
        <h1>{fill(t.headline, PRODUCT_LABEL)}</h1>
        <p className="lead">{fill(t.lead, PRODUCT_LABEL)}</p>
        <p className="muted small" data-testid="privacy-version">
          {version} {locale === 'en' ? t.languageNote : null}
        </p>

        <section className={styles.section} aria-labelledby="en-breve">
          <h2 id="en-breve">{t.summaryTitle}</h2>
          <ul className={styles.list}>
            {t.summary.map((line) => (
              <li key={line}>
                <WithMailbox text={line} />
              </li>
            ))}
          </ul>
        </section>

        {draft && PRIVACY_NOTICE.pending.length > 0 ? (
          <section className={styles.section} aria-labelledby="pendiente" data-testid="privacy-pending">
            <h2 id="pendiente">{t.pendingTitle}</h2>
            <ul className={styles.list}>
              {PRIVACY_NOTICE.pending.map((key) => (
                <li key={key}>{t.pending[key]}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {t.sections.map((s) => (
          <section key={s.id} className={styles.section} aria-labelledby={s.id}>
            <h2 id={s.id}>{s.title}</h2>
            {s.body.map((p) => (
              <p key={p}>
                <WithMailbox text={fill(p, PRODUCT_LABEL)} />
              </p>
            ))}
            {s.list ? (
              <ul className={styles.list}>
                {s.list.map((li) => (
                  <li key={li}>
                    <WithMailbox text={fill(li, PRODUCT_LABEL)} />
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}

        <p className={styles.section}>
          <a href={locale === 'en' ? '/en' : '/'}>{fill(t.home, PRODUCT_LABEL)}</a>
        </p>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
