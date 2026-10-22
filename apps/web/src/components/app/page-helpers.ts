/**
 * Shared bits of every app page under src/app/h/app/[locale]/: the locale and id params, validated (a bad value is
 * the HTML 404, never a cast error), and the page metadata (always noindex on the app host).
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { UUID } from '@/lib/api-routes';
import type { AppRouteName } from '@/lib/app-routes';
import { PRODUCT_LABEL } from '@/lib/brand';
import { APP_COPY } from '@/lib/copy/app';
import { isLocale } from '@/lib/copy/landing';
import type { Locale } from '@/lib/routing';

export type LocaleParams = { params: Promise<{ locale: string }> };
export type IdParams = { params: Promise<{ locale: string; id: string }> };

export async function pageLocale(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return locale;
}

export async function pageLocaleAndId(params: Promise<{ locale: string; id: string }>): Promise<{ locale: Locale; id: string }> {
  const { locale, id } = await params;
  if (!isLocale(locale) || !UUID.test(id)) notFound();
  return { locale, id };
}

export async function appMetadata(params: Promise<{ locale: string }>, route: AppRouteName): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: `${APP_COPY[locale].routes[route]} · ${PRODUCT_LABEL}`, robots: { index: false, follow: false } };
}
