'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import s from './ui.module.css';

interface ToastItem {
  id: number;
  message: string;
  tone: 'info' | 'danger';
}

type Push = (message: string, tone?: ToastItem['tone']) => void;

const ToastContext = createContext<Push | null>(null);

/**
 * Short confirmations («Guardado») and failures, announced in one live region. Ids are a counter (never random);
 * each toast closes itself after 6 s or with its close button.
 */
export function ToastProvider({ dismissLabel, children }: { dismissLabel: string; children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const close = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);
  const push = useCallback<Push>((message, tone = 'info') => {
    const id = next.current;
    next.current += 1;
    setItems((all) => [...all.slice(-3), { id, message, tone }]);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className={s.toasts} role="status" aria-live="polite">
        {items.map((t) => (
          <ToastRow key={t.id} item={t} onClose={close} dismissLabel={dismissLabel} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastRow({ item, onClose, dismissLabel }: { item: ToastItem; onClose: (id: number) => void; dismissLabel: string }) {
  useEffect(() => {
    const timer = setTimeout(() => onClose(item.id), 6000);
    return () => clearTimeout(timer);
  }, [item.id, onClose]);
  return (
    <div className={s.toast} data-tone={item.tone}>
      <span>{item.message}</span>
      <button type="button" className={s.toastClose} onClick={() => onClose(item.id)} aria-label={dismissLabel}>
        ×
      </button>
    </div>
  );
}

/** `const toast = useToast(); toast('Guardado')`. Outside a provider it throws (fail visible). */
export function useToast(): Push {
  const push = useContext(ToastContext);
  if (!push) throw new Error('useToast() needs a <ToastProvider> above it');
  return push;
}
