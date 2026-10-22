import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { MyArtifacts } from '@/components/MyArtifacts';
import { LangSwitch, SiteFooter, waitlistHref } from '@/components/SiteFooter';
import { APP_COPY } from '@/lib/app-copy';
import { isSignInConfigured } from '@/lib/auth-env';
import { PRODUCT_LABEL } from '@/lib/brand';
import { getConfig } from '@/lib/config';
import { COPY, fill, isLocale } from '@/lib/copy';
import { readSessionForDisplay } from '@/server/server-session';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: fill(COPY[locale].meta.appTitle, PRODUCT_LABEL), robots: { index: false, follow: false } };
}

/**
 * cv-app.madfam.io. Three honest states:
 * - sign-in not configured (the dormant default): the pre-launch shell, «aún no disponible», nothing stored;
 * - configured, signed out: «Iniciar sesión»;
 * - signed in: who, «Cambiar de cuenta», «Entrar como otra persona», «Cerrar sesión», and «Mis portafolios».
 * Every button is a plain form POST (no script needed), to /auth/entrar or /auth/salir.
 */
export default async function AppShell({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = COPY[locale];
  const a = APP_COPY[locale];
  const landing = `https://${getConfig().hosts.landing}${locale === 'en' ? '/en' : '/'}`;
  const configured = isSignInConfigured(process.env);
  const person = configured ? await readSessionForDisplay(await headers()) : null;
  const back = locale === 'en' ? '/en' : '/';
  const switchForm = (prompt: 'select_account' | 'login', label: string) => (
    <form className="inline-form" method="post" action="/auth/entrar">
      <input type="hidden" name="prompt" value={prompt} />
      <input type="hidden" name="redirect_to" value={back} />
      <button className="button button-secondary" type="submit">
        {label}
      </button>
    </form>
  );
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="wordmark">{PRODUCT_LABEL}</span>
          <LangSwitch locale={locale} />
        </div>
      </header>
      <main className="shell" id="main">
        {!configured ? (
          <>
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
          </>
        ) : !person ? (
          <>
            <p className="badge">{t.app.badge}</p>
            <h1 className="shell-title">{a.signedOutTitle}</h1>
            <p className="lead">{a.signedOutBody}</p>
            <div className="actions">
              <form className="inline-form" method="post" action="/auth/entrar">
                <input type="hidden" name="redirect_to" value={back} />
                <button className="button" type="submit">
                  {a.signIn}
                </button>
              </form>
              <a className="button button-secondary" href={landing}>
                {t.app.back}
              </a>
            </div>
          </>
        ) : (
          <>
            <p className="muted">
              {a.signedInAs} <strong>{person.name ?? person.email ?? person.sub}</strong>
            </p>
            <div className="actions">
              {switchForm('select_account', a.switchAccount)}
              {switchForm('login', a.otherPerson)}
              <form className="inline-form" method="post" action="/auth/salir">
                <button className="button button-secondary" type="submit">
                  {a.signOut}
                </button>
              </form>
            </div>
            <MyArtifacts t={a} locale={locale === 'en' ? 'en' : 'es-MX'} />
          </>
        )}
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
