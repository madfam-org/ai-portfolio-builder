import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
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
    { media: '(prefers-color-scheme: light)', color: '#f6f4ee' },
    { media: '(prefers-color-scheme: dark)', color: '#121614' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // proxy.ts sets x-cv-locale on every page it routes; anything else is Spanish, the default.
  const locale = (await headers()).get('x-cv-locale') === 'en' ? 'en' : 'es';
  return (
    <html lang={COPY[locale].htmlLang}>
      <body>{children}</body>
    </html>
  );
}
