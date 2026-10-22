'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { Notice } from '@/components/ui/States';
import { appPath } from '@/lib/app-routes';
import type { IntakeDraft } from '@/lib/client/types';
import { INGEST_COPY } from '@/lib/copy/ingest';
import type { Locale } from '@/lib/routing';
import { CaptureError, decodeFragment, fitCapture } from './capture';
import { postIntake } from './client';
import { IntakePreview } from './IntakePreview';
import { intakeFailureMessage } from './messages';

const KEY = 'cv-intake-capture';

/** Moves a capture from the URL fragment into this tab's sessionStorage and clears the address bar. */
function stashFragment(): void {
  const hash = window.location.hash;
  if (hash.length < 3) return;
  try {
    window.sessionStorage.setItem(KEY, hash);
  } catch {
    return; // storage blocked: the fragment stays, and the receiver reads it directly
  }
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

function takeStashed(): string {
  const hash = window.location.hash;
  if (hash.length >= 3) return hash;
  try {
    return window.sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

function forget(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
  if (window.location.hash) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

/**
 * Rendered OUTSIDE the signed-in frame of `/empleos/capturar`: when the person is not signed in yet, the capture would
 * be lost on the way through Janua (a fragment does not survive the sign-in redirects), so it waits in this tab's
 * sessionStorage (never sent anywhere) and the address bar is cleaned at once.
 */
export function CaptureStash() {
  useEffect(() => stashFragment(), []);
  return null;
}

/**
 * `/empleos/capturar` (W5-J): reads the capture the «Capturar vacante» bookmark put in the URL fragment (or the one
 * stashed before sign-in), sends it to the same-origin intake for parsing (no network beyond cv), and shows the same
 * preview as `/empleos/nuevo`. Untrusted input: any page could open this URL with any fragment, which is no more than
 * a paste; nothing is stored until the person saves.
 */
export function CaptureReceiver({ locale }: { locale: Locale }) {
  const t = INGEST_COPY[locale];
  const router = useRouter();
  const [state, setState] = useState<{ step: 'reading' } | { step: 'none' } | { step: 'error'; message: string } | { step: 'preview'; draft: IntakeDraft }>({ step: 'reading' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const fragment = takeStashed();
      if (!fragment) {
        if (!cancelled) setState({ step: 'none' });
        return;
      }
      stashFragment();
      let body;
      try {
        body = { source: 'capture' as const, kind: 'capture' as const, capture: fitCapture(await decodeFragment(fragment)) };
      } catch (err) {
        forget();
        if (!cancelled) setState(err instanceof CaptureError && err.code === 'empty' ? { step: 'none' } : { step: 'error', message: t.failures.unreadable });
        return;
      }
      const out = await postIntake(body);
      if (cancelled) return;
      if (out.ok) setState({ step: 'preview', draft: out.draft });
      else {
        if (out.reason === 'unreadable') forget();
        setState({ step: 'error', message: intakeFailureMessage(locale, out) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locale, t]);

  if (state.step === 'reading') {
    return (
      <p className="muted" role="status">
        {t.receiver.waiting}
      </p>
    );
  }
  if (state.step === 'preview') {
    let host = '';
    try {
      host = state.draft.sourceUrl ? new URL(state.draft.sourceUrl).hostname : '';
    } catch {
      host = '';
    }
    return (
      <>
        {host ? <p className="muted small">{t.receiver.fromPage(host)}</p> : null}
        <IntakePreview
          locale={locale}
          draft={state.draft}
          onSaved={(job) => {
            forget();
            router.push(appPath.job(locale, job.id));
          }}
          onDiscard={() => {
            forget();
            router.push(appPath.jobNew(locale));
          }}
        />
      </>
    );
  }
  return (
    <>
      <Notice tone={state.step === 'error' ? 'danger' : 'info'}>{state.step === 'error' ? state.message : t.receiver.none}</Notice>
      <p>
        <ButtonLink variant="secondary" href={appPath.jobNew(locale)}>
          {t.title}
        </ButtonLink>
      </p>
    </>
  );
}
