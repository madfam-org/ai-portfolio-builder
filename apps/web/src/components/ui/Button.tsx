import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';
import s from './ui.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

function classes(variant: ButtonVariant, size: 'normal' | 'small', extra?: string): string {
  return [s.button, variant === 'primary' ? '' : s[variant], size === 'small' ? s.small : '', extra ?? ''].filter(Boolean).join(' ');
}

interface Common {
  variant?: ButtonVariant;
  size?: 'normal' | 'small';
}

/** A real <button> (type="button" unless said otherwise, so it never submits a form by accident). No style prop. */
export function Button({ variant = 'primary', size = 'normal', className, type = 'button', ...rest }: Common & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'>) {
  return <button type={type} className={classes(variant, size, className)} {...rest} />;
}

/** A link that looks like a button (navigation is always a link, never a button with a handler). */
export function ButtonLink({ variant = 'primary', size = 'normal', className, ...rest }: Common & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'style'> & { href: string }) {
  return <a className={classes(variant, size, className)} {...rest} />;
}
