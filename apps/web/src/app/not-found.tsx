import { headers } from 'next/headers';
import { PRODUCT_LABEL } from '@/lib/brand';
import { getConfig } from '@/lib/config';
import { COPY } from '@/lib/copy/landing';
import { PAGES_COPY } from '@/lib/copy/pages';

export default async function NotFound() {
  const h = await headers();
  const locale = h.get('x-cv-locale') === 'en' ? 'en' : 'es';
  // The pages host has no home of its own: its 404 says what may have happened and links to the landing.
  if (h.get('x-cv-role') === 'pages') {
    const p = PAGES_COPY[locale];
    return (
      <main className="shell" id="main">
        <p className="badge">404</p>
        <h1 className="shell-title">{p.notFoundTitle}</h1>
        <p className="lead">{p.notFoundBody}</p>
        <p className="muted small">
          <a href={`https://${getConfig().hosts.landing}/`}>{PRODUCT_LABEL}</a>
        </p>
      </main>
    );
  }
  const t = COPY[locale].notFound;
  return (
    <main className="shell" id="main">
      <p className="badge">404</p>
      <h1 className="shell-title">{t.title}</h1>
      <p className="lead">{t.body}</p>
      <p>
        <a className="button button-secondary" href="/">
          {t.home}
        </a>
      </p>
      <p className="muted small">{PRODUCT_LABEL}</p>
    </main>
  );
}
