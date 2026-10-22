import { headers } from 'next/headers';
import { PRODUCT_LABEL } from '@/lib/brand';
import { COPY } from '@/lib/copy';

export default async function NotFound() {
  const locale = (await headers()).get('x-cv-locale') === 'en' ? 'en' : 'es';
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
