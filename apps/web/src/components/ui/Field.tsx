import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import s from './ui.module.css';

/**
 * Labelled form controls. `id` is required (server and client render the same markup; no generated ids), the hint
 * and the error are wired with aria-describedby, and an error sets aria-invalid. No style prop anywhere.
 */
interface FieldProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
}

function describedBy(id: string, hint: unknown, error: unknown): string | undefined {
  const ids = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

function Shell({ id, label, hint, error, children }: FieldProps & { children: ReactNode }) {
  return (
    <div className={s.field}>
      <label className={s.label} htmlFor={id}>
        {label}
      </label>
      {hint ? (
        <p className={s.hint} id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p className={s.error} id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({ id, label, hint, error, ...rest }: FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'style'>) {
  return (
    <Shell id={id} label={label} hint={hint} error={error}>
      <input id={id} className={s.input} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...rest} />
    </Shell>
  );
}

export function TextAreaField({ id, label, hint, error, ...rest }: FieldProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'style'>) {
  return (
    <Shell id={id} label={label} hint={hint} error={error}>
      <textarea id={id} className={s.input} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...rest} />
    </Shell>
  );
}

export function SelectField({
  id,
  label,
  hint,
  error,
  options,
  ...rest
}: FieldProps & { options: readonly { value: string; label: string }[] } & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'style' | 'children'>) {
  return (
    <Shell id={id} label={label} hint={hint} error={error}>
      <select id={id} className={s.input} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Shell>
  );
}

export function CheckboxField({ id, label, hint, error, ...rest }: FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'style' | 'type'>) {
  return (
    <div className={s.field}>
      <div className={s.check}>
        <input id={id} type="checkbox" aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...rest} />
        <label htmlFor={id}>{label}</label>
      </div>
      {hint ? (
        <p className={s.hint} id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className={s.error} id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
