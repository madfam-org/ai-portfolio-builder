import type { ReactNode } from 'react';
import type { ArtifactKind } from '../../lib/copy/app.ts';
import { TEMPLATE_PICKER_COPY } from '../../lib/copy/render.ts';
import type { Locale } from '../../lib/routing.ts';
import { TEMPLATE_REGISTRY } from '../../lib/templates.ts';
import s from './picker.module.css';

/**
 * One kind's template choice (W4-T): a radio group where each option shows its name, its trade-off and, for CVs and
 * letters, its ATS line, all from the registry (`lib/templates.ts`). Controlled; no hooks, so a client parent
 * (the tailoring workspace, the document settings form) owns the state. Native radios: arrow keys move within the
 * group, Tab leaves it; the legend names the group and each description is tied to its radio.
 *
 * A stored template the kind no longer offers (`current`, from before the allowlist) stays listed as «(anterior)»
 * with a note, so opening and saving the form never changes it silently.
 */
export function TemplatePicker({
  id,
  kind,
  locale,
  value,
  onChange,
  legend,
  hint,
  current,
}: {
  id: string;
  kind: ArtifactKind;
  locale: Locale;
  value: string;
  onChange: (template: string) => void;
  legend?: string;
  hint?: ReactNode;
  /** The artifact's stored template, when editing one. */
  current?: string;
}) {
  const c = TEMPLATE_PICKER_COPY[locale];
  const options = TEMPLATE_REGISTRY[kind];
  const legacy = current !== undefined && !options.some((o) => o.id === current) ? current : null;
  return (
    <fieldset className={s.picker} id={id} data-kind={kind} aria-describedby={hint ? `${id}-hint` : undefined}>
      <legend className={s.legend}>{legend ?? c.legend}</legend>
      {hint ? (
        <p className={s.hint} id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      <ul className={s.options}>
        {options.map((o) => {
          const optionId = `${id}-${o.id}`;
          return (
            <li key={o.id} className={s.option}>
              <input
                type="radio"
                id={optionId}
                name={id}
                value={o.id}
                checked={value === o.id}
                onChange={() => onChange(o.id)}
                aria-describedby={`${optionId}-desc`}
              />
              <label htmlFor={optionId} className={s.optionText}>
                <span className={s.name}>{o.label[locale]}</span>
                <span className={s.description} id={`${optionId}-desc`}>
                  {o.description[locale]}
                  {o.ats ? <span className={s.ats}> {o.ats[locale]}</span> : null}
                </span>
              </label>
            </li>
          );
        })}
        {legacy ? (
          <li className={s.option}>
            <input
              type="radio"
              id={`${id}-legacy`}
              name={id}
              value={legacy}
              checked={value === legacy}
              onChange={() => onChange(legacy)}
              aria-describedby={`${id}-legacy-desc`}
            />
            <label htmlFor={`${id}-legacy`} className={s.optionText}>
              <span className={s.name}>{c.legacy(legacy)}</span>
              <span className={s.description} id={`${id}-legacy-desc`}>
                {c.legacyNote}
              </span>
            </label>
          </li>
        ) : null}
      </ul>
    </fieldset>
  );
}
