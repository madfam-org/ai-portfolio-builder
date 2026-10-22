import { CONTACT_MAILBOX, LEGAL_ENTITY, MADFAM_SITE, PRODUCT_LABEL, SOURCE_URL } from '@/lib/brand';
import { getConfig } from '@/lib/config';
import { COPY } from '@/lib/copy/landing';
import { READER_COPY, readerPath } from '@/lib/copy/reader';
import type { Locale } from '@/lib/routing';

/**
 * The product footer (messaging house §10, §13): product name first, Innovaciones MADFAM endorses here
 * and only here; the legal line is the canon entity (R37/R47); legal links go to madfam.io until the
 * product has its own notices (R71). No social links, no phone, no newsletter.
 */
export function SiteFooter({ locale }: { locale: Locale }) {
  const t = COPY[locale].footer;
  const legal = `${MADFAM_SITE}/${locale}`;
  const year = new Date().getFullYear();
  return (
    <footer className="footer">
      <div className="footer-inner">
        <p className="footer-brand">
          <strong>{PRODUCT_LABEL}</strong> ·{' '}
          <a href={`${MADFAM_SITE}/${locale}`} rel="noopener">
            {t.builtBy}
          </a>
        </p>
        <nav aria-label="Legal" className="footer-links">
          <a href={`${legal}/privacy`} rel="noopener">
            {t.privacy}
          </a>
          <a href={`${legal}/terms`} rel="noopener">
            {t.terms}
          </a>
          <a href={`${legal}/cookies`} rel="noopener">
            {t.cookies}
          </a>
          <a href={SOURCE_URL} rel="noopener">
            {t.open}
          </a>
          {/* W6-A: the job-link reader page, on the landing host (its URL is in the reader's User-Agent). */}
          <a href={`https://${getConfig().hosts.landing}${readerPath(locale)}`}>{READER_COPY[locale].footerLink}</a>
        </nav>
        <p className="footer-legal">
          © {year} {LEGAL_ENTITY} · Cuernavaca, Morelos, {locale === 'es' ? 'México' : 'Mexico'}
        </p>
      </div>
    </footer>
  );
}

/** Language switch: a plain link (no client-side routing, no cookie). `href`: the same page in the other language (default: home). */
export function LangSwitch({ locale, href }: { locale: Locale; href?: string }) {
  const t = COPY[locale].footer;
  const other: Locale = locale === 'es' ? 'en' : 'es';
  return (
    <a className="lang" href={href ?? (other === 'en' ? '/en' : '/')} hrefLang={COPY[other].htmlLang} lang={COPY[other].htmlLang}>
      <span className="visually-hidden">{t.switchLabel}: </span>
      {t.switchTo}
    </a>
  );
}

export function waitlistHref(locale: Locale): string {
  const subject = COPY[locale].ctaSubject.split('{name}').join(PRODUCT_LABEL);
  return `mailto:${CONTACT_MAILBOX}?subject=${encodeURIComponent(subject)}`;
}
