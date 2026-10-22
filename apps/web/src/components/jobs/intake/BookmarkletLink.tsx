'use client';

import { useEffect, useRef, useState } from 'react';
import { TextAreaField } from '@/components/ui/Field';
import { appPath } from '@/lib/app-routes';
import { INGEST_COPY } from '@/lib/copy/ingest';
import type { Locale } from '@/lib/routing';
import { bookmarkletCode, bookmarkletHref } from './bookmarklet';
import s from './intake.module.css';

const FAIL: Record<Locale, string> = {
  es: 'No se pudo capturar esta página. Copia el texto de la vacante y pégalo en cv-app.',
  en: 'This page could not be captured. Copy the posting text and paste it into cv-app.',
};

/**
 * The draggable «Capturar vacante» bookmark. React refuses `javascript:` hrefs, so the href is set on the element after
 * mount (the code is built from this page's own origin: cv-app in production, the local host in tests). Clicking it
 * here does nothing (cv-app's CSP blocks `javascript:` navigation anyway); dragging it saves it as a bookmark.
 */
export function BookmarkletLink({ locale }: { locale: Locale }) {
  const t = INGEST_COPY[locale].capture;
  const ref = useRef<HTMLAnchorElement>(null);
  const [code, setCode] = useState('');

  useEffect(() => {
    const target = `${window.location.origin}${appPath.jobCapture(locale)}`;
    ref.current?.setAttribute('href', bookmarkletHref(target, FAIL[locale]));
    // The code is known only in the browser (it carries this page's origin).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCode(bookmarkletCode(target, FAIL[locale]));
  }, [locale]);

  return (
    <>
      <p>
        <a ref={ref} className={s.bookmarklet} data-testid="bookmarklet" onClick={(e) => e.preventDefault()} draggable>
          {t.linkLabel}
        </a>
      </p>
      <p className="muted small">{t.drag}</p>
      <details>
        <summary>{t.copyLabel}</summary>
        <TextAreaField id="bookmarklet-code" label={t.copyLabel} hint={t.copyHint} value={code} readOnly onFocus={(e) => e.currentTarget.select()} />
      </details>
    </>
  );
}
