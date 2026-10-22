'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './Button';
import s from './ui.module.css';

/**
 * A confirmation on the native <dialog> (focus trap, Escape and the backdrop come from the browser; no library).
 * Controlled: `open` shows it with showModal(); closing by any means calls `onCancel`.
 */
export function ConfirmDialog({
  id,
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  /** Unique on the page (labels the dialog). */
  id: string;
  open: boolean;
  title: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog id={id} ref={ref} className={s.dialog} onClose={onCancel} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      {children ? <div>{children}</div> : null}
      <div className={s.cluster}>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </dialog>
  );
}
