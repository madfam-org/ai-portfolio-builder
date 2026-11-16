'use client';

import { useEffect } from 'react';

/**
 * While `dirty`, leaving the page (reload, closing the tab, a full navigation) asks first with the browser's own
 * «¿Salir del sitio?» dialog, so typed work is not lost by a stray click. Nothing is shown while the form is clean or
 * once its changes are saved.
 */
export function useUnsavedGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const ask = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older engines read the return value instead of `preventDefault()`.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [dirty]);
}
