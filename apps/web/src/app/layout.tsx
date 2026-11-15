import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { serif, sans } from '@/fonts';
import { COPY } from '@/lib/copy/landing';
import './globals.css';

// Every page renders per request: the CSP nonce is per request (R77), so nothing is prerendered.
export const dynamic = 'force-dynamic';

// The page-level metadata decides indexing; this default keeps anything unexpected out of indexes.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f4ec' },
    { media: '(prefers-color-scheme: dark)', color: '#121513' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // proxy.ts sets x-cv-locale on every page it routes; anything else is Spanish, the default.
  const locale = (await headers()).get('x-cv-locale') === 'en' ? 'en' : 'es';
  return (
    <html lang={COPY[locale].htmlLang} className={`${serif.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
