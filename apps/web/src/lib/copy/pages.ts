/**
 * Strings of the public pages host (user content: public and link-shared artifacts), es-MX source and en. The page
 * chrome is minimal on purpose: the person's document is the page. Abuse reports go to legal@madfam.io (R61; lane X
 * §4.8 recommends legal@ over support@, owner to confirm).
 *
 * Owner: W3-4 (renderers and publish) after W3-1; append only.
 */
import type { Locale } from '../routing.ts';

export const ABUSE_MAILBOX = 'legal@madfam.io';

export interface PagesCopy {
  report: string;
  reportSubject: string;
  madeWith: string;
  notFoundTitle: string;
  notFoundBody: string;
}

export const PAGES_COPY: Record<Locale, PagesCopy> = {
  es: {
    report: '¿Contenido indebido? Repórtalo',
    reportSubject: 'Reporte de contenido',
    madeWith: 'Hecho con {name}',
    notFoundTitle: 'Página no encontrada',
    notFoundBody: 'Esta página no existe, ya no está publicada o el enlace cambió.',
  },
  en: {
    report: 'Inappropriate content? Report it',
    reportSubject: 'Content report',
    madeWith: 'Made with {name}',
    notFoundTitle: 'Page not found',
    notFoundBody: 'This page does not exist, is no longer published or its link changed.',
  },
};

/**
 * The report link. A public page names its own address in the subject; a link-shared page never does (its token is
 * the secret that grants access, so it must not travel in an email subject).
 */
export function reportHref(locale: Locale, page: { share: 'public'; slug: string; host: string } | { share: 'link' }): string {
  const t = PAGES_COPY[locale];
  const subject = page.share === 'public' ? `${t.reportSubject}: https://${page.host}/${page.slug}` : `${t.reportSubject} (${locale === 'es' ? 'página con enlace' : 'link-shared page'})`;
  return `mailto:${ABUSE_MAILBOX}?subject=${encodeURIComponent(subject)}`;
}
