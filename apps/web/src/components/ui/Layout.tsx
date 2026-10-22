import type { ReactNode } from 'react';
import s from './ui.module.css';

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={s.pageHeader}>
      <div>
        {eyebrow}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className={s.cluster}>{actions}</div> : null}
    </div>
  );
}

export function Stack({ children, as: Tag = 'div' }: { children: ReactNode; as?: 'div' | 'section' | 'ul' }) {
  return <Tag className={s.stack}>{children}</Tag>;
}

export function Cluster({ children }: { children: ReactNode }) {
  return <div className={s.cluster}>{children}</div>;
}

/** A grid of link cards (each card is one link). */
export function LinkCards({ cards }: { cards: readonly { href: string; title: ReactNode; body: ReactNode }[] }) {
  return (
    <div className={s.cards}>
      {cards.map((c) => (
        <a key={c.href} className={s.card} href={c.href}>
          <h2>{c.title}</h2>
          <p>{c.body}</p>
        </a>
      ))}
    </div>
  );
}

/** The app's section navigation: plain links; the current section carries aria-current="page". */
export function NavLinks({ label, links }: { label: string; links: readonly { href: string; label: ReactNode; current: boolean }[] }) {
  return (
    <nav aria-label={label} className={s.nav}>
      {links.map((l) => (
        <a key={l.href} className={s.navLink} href={l.href} aria-current={l.current ? 'page' : undefined}>
          {l.label}
        </a>
      ))}
    </nav>
  );
}
