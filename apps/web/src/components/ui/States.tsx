import type { ReactNode } from 'react';
import s from './ui.module.css';

export type Tone = 'info' | 'success' | 'warning' | 'danger';

/** A boxed message. `danger` and `warning` are announced (role=alert); the others are polite (role=status). */
export function Notice({ tone = 'info', title, children }: { tone?: Tone; title?: ReactNode; children: ReactNode }) {
  const toneClass = tone === 'danger' ? s['danger-notice'] : s[tone];
  return (
    <div className={`${s.notice} ${toneClass}`} role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}>
      {title ? <strong>{title}</strong> : null}
      <p>{children}</p>
    </div>
  );
}

/** Nothing here yet: says so plainly, with at most one next step. Never sample data. */
export function EmptyState({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={s.empty}>
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
      {action ? <div className={s.cluster}>{action}</div> : null}
    </div>
  );
}

/** A failed load or action, with an optional retry control. */
export function ErrorState({ message, action }: { message: ReactNode; action?: ReactNode }) {
  return (
    <div className={`${s.notice} ${s['danger-notice']}`} role="alert">
      <p>{message}</p>
      {action ? <div className={s.cluster}>{action}</div> : null}
    </div>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className={s.badge}>{children}</span>;
}
