import { PRODUCT_LABEL } from '@/lib/brand';
import { getConfig } from '@/lib/config';
import { PAGES_COPY, reportHref } from '@/lib/copy/pages';
import { fill } from '@/lib/copy/landing';
import type { Locale } from '@/lib/routing';

/**
 * The footer of every user page: the abuse report (legal@madfam.io, R61) and the product line linking to the landing.
 * A link-shared page never puts its token in the report subject.
 */
export function PagesFooter({ locale, page }: { locale: Locale; page: { share: 'public'; slug: string } | { share: 'link' } }) {
  const t = PAGES_COPY[locale];
  const config = getConfig();
  const href = page.share === 'public' ? reportHref(locale, { ...page, host: config.hosts.pages ?? '' }) : reportHref(locale, page);
  return (
    <footer className="footer">
      <div className="footer-inner">
        {/* One quiet line under the person's document: the document is the page, the product only signs it. */}
        <p className="small muted pages-credit">
          <a href={`https://${config.hosts.landing}${locale === 'en' ? '/en' : '/'}`}>{fill(t.madeWith, PRODUCT_LABEL)}</a>
          <span aria-hidden="true"> · </span>
          <a href={href}>{t.report}</a>
        </p>
      </div>
    </footer>
  );
}
