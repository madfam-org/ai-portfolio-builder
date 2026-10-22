import type { ReactNode } from 'react';
import { ErrorState, Notice } from '@/components/ui/States';
import { APP_COPY } from '@/lib/copy/app';
import type { Locale } from '@/lib/routing';
import type { DocumentLoad } from '../load';
import { SessionRefresh } from './SessionRefresh';

/** The honest state of a document read (load.ts), or the page itself when the read succeeded. */
export function DocumentState({ locale, loaded, children }: { locale: Locale; loaded: DocumentLoad; children: (ok: Extract<DocumentLoad, { status: 'ok' }>) => ReactNode }) {
  const states = APP_COPY[locale].states;
  switch (loaded.status) {
    case 'ok':
      return <>{children(loaded)}</>;
    case 'not_configured':
      return <Notice tone="warning">{states.notConfigured}</Notice>;
    case 'unavailable':
      return <ErrorState message={states.unavailable} />;
    case 'refresh':
      return <SessionRefresh locale={locale} />;
    default:
      return <Notice tone="warning">{states.notSignedIn}</Notice>;
  }
}
