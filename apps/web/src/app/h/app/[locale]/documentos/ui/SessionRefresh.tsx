'use client';

import { useEffect, useState } from 'react';
import { Notice } from '@/components/ui/States';
import { api } from '@/lib/client/api';
import { DOCUMENTS_COPY } from '@/lib/copy/render';
import type { Locale } from '@/lib/routing';

const KEY = 'cv.documents.refreshedAt';

/**
 * The page read found an expired access token (a page cannot rotate cookies). One call through the same-origin proxy
 * renews the session cookie (Auth.js refresh), then the page reloads once; a second miss within a minute, or a call
 * that answers «not signed in», shows the sign-in message instead of looping.
 */
export function SessionRefresh({ locale }: { locale: Locale }) {
  const d = DOCUMENTS_COPY[locale];
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let recent = false;
    try {
      recent = Date.now() - Number(window.sessionStorage.getItem(KEY) ?? 0) < 60_000;
    } catch {
      recent = false;
    }
    void api.me().then((res) => {
      if (!res.ok || recent) {
        setFailed(true);
        return;
      }
      try {
        window.sessionStorage.setItem(KEY, String(Date.now()));
      } catch {
        // Storage blocked: the reload still happens once per visit.
      }
      window.location.reload();
    });
  }, []);
  return failed ? <Notice tone="warning">{d.refreshFailed}</Notice> : <Notice>{d.refreshing}</Notice>;
}
