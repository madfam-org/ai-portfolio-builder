import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { SiteFooter, waitlistHref } from '@/components/SiteFooter';
import { ButtonLink } from '@/components/ui/Button';
import { NavLinks } from '@/components/ui/Layout';
import { ToastProvider } from '@/components/ui/Toast';
import { APP_NAV, appPath, appPathFor, navSection, type AppRouteName } from '@/lib/app-routes';
import { isSignInConfigured } from '@/lib/auth-env';
import { PRODUCT_LABEL } from '@/lib/brand';
import { getConfig } from '@/lib/config';
import { APP_COPY } from '@/lib/copy/app';
import { COPY, fill } from '@/lib/copy/landing';
import type { Locale } from '@/lib/routing';
import { readSessionForDisplay } from '@/server/server-session';

export interface SignedInPerson {
  sub: string;
  name: string | null;
  email: string | null;
}

/**
 * The frame of every app page (cv-app.madfam.io). Three honest states, decided on the server:
 * - sign-in not configured (the dormant default): the pre-launch notice, «aún no disponible»; nothing is stored;
 * - configured, signed out: «Iniciar sesión», which returns to THIS page after Janua (redirect_to = its path);
 * - signed in: the section nav, who is signed in, «Cambiar de cuenta» / «Entrar como otra persona» / «Cerrar sesión»
 *   (R44), and the page (`children` receives the person).
 * Every control is a plain link or form POST (no script needed). Pages own their content; this file is W3-1's.
 */
export async function AppFrame({
  locale,
  route,
  id = null,
  children,
}: {
  locale: Locale;
  route: AppRouteName;
  id?: string | null;
  children: (person: SignedInPerson) => ReactNode;
}) {
  const t = COPY[locale];
  const a = APP_COPY[locale];
  const here = appPathFor(route, locale, id);
  const other: Locale = locale === 'es' ? 'en' : 'es';
  const configured = isSignInConfigured(process.env);
  const person = configured ? await readSessionForDisplay(await headers()) : null;
  const landing = `https://${getConfig().hosts.landing}${locale === 'en' ? '/en' : '/'}`;
  const section = navSection(route);

  const signInForm = (label: string, prompt?: 'select_account' | 'login', variant: 'primary' | 'secondary' = 'primary') => (
    <form className="inline-form" method="post" action="/auth/entrar">
      {prompt ? <input type="hidden" name="prompt" value={prompt} /> : null}
      <input type="hidden" name="redirect_to" value={here} />
      <button className={variant === 'primary' ? 'button' : 'button button-secondary'} type="submit">
        {label}
      </button>
    </form>
  );

  return (
    <>
      <a className="skip" href="#main">
        {a.skip}
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="wordmark" href={appPath.home(locale)}>
            {PRODUCT_LABEL}
          </a>
          {person ? (
            <NavLinks
              label={a.navLabel}
              links={APP_NAV.map((name) => ({ href: appPath[name](locale), label: a.routes[name], current: name === section }))}
            />
          ) : null}
          <a className="lang" href={appPathFor(route, other, id)} hrefLang={COPY[other].htmlLang} lang={COPY[other].htmlLang}>
            <span className="visually-hidden">{t.footer.switchLabel}: </span>
            {t.footer.switchTo}
          </a>
        </div>
      </header>
      <main className="shell" id="main">
        {!configured ? (
          <>
            <p className="badge">{t.app.badge}</p>
            <h1 className="shell-title">{t.app.headline}</h1>
            <p className="lead">{fill(t.app.body, PRODUCT_LABEL)}</p>
            <div className="actions">
              <ButtonLink href={waitlistHref(locale)}>{t.cta}</ButtonLink>
              <ButtonLink variant="secondary" href={landing}>
                {t.app.back}
              </ButtonLink>
            </div>
          </>
        ) : !person ? (
          <>
            <p className="badge">{t.app.badge}</p>
            <h1 className="shell-title">{a.signedOutTitle}</h1>
            <p className="lead">{a.signedOutBody}</p>
            <div className="actions">
              {signInForm(a.signIn)}
              <ButtonLink variant="secondary" href={landing}>
                {t.app.back}
              </ButtonLink>
            </div>
          </>
        ) : (
          <ToastProvider dismissLabel={a.states.dismiss}>
            <section aria-label={a.accountLabel} className="account">
              <p className="muted small">
                {a.signedInAs} <strong>{person.name ?? person.email ?? person.sub}</strong>
              </p>
              <div className="actions">
                {signInForm(a.switchAccount, 'select_account', 'secondary')}
                {signInForm(a.otherPerson, 'login', 'secondary')}
                <form className="inline-form" method="post" action="/auth/salir">
                  <button className="button button-secondary" type="submit">
                    {a.signOut}
                  </button>
                </form>
              </div>
            </section>
            {children(person)}
          </ToastProvider>
        )}
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
