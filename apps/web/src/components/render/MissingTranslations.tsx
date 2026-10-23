import { appPath } from '../../lib/app-routes.ts';
import { APP_COPY } from '../../lib/copy/app.ts';
import { BILINGUAL_COPY } from '../../lib/copy/bilingual.ts';
import { PROFILE_COPY, fieldLabel } from '../../lib/copy/profile.ts';
import type { ContentLocale } from '../../lib/profile-text.ts';
import type { Locale } from '../../lib/routing.ts';
import { translateAnchor } from '../profile/translate-anchor.ts';
import { missingCount, type MissingText } from './localize.ts';
import css from './bilingual.module.css';

/**
 * W7 (B4): «Faltan N textos en inglés», above a document's preview and in the tailoring workspace (never in print, nor
 * on the pages host): which fields of which items fall back to the primary language, each a link to the profile
 * editor opened on that item in the other language. Nothing when the document is complete in its language.
 */
export function MissingTranslations({
  locale,
  missing,
  target,
  primary,
  id,
  heading = 'h2',
}: {
  locale: Locale;
  missing: readonly MissingText[];
  target: ContentLocale;
  primary: ContentLocale;
  id: string;
  heading?: 'h2' | 'h3';
}) {
  if (missing.length === 0) return null;
  const b = BILINGUAL_COPY[locale];
  const p = PROFILE_COPY[locale];
  const kinds = APP_COPY[locale].itemKinds;
  const n = missingCount(missing);
  const Heading = heading;
  const fieldName = (m: MissingText, f: string) =>
    m.kind === 'header' ? p.header[f as 'headline' | 'summary' | 'location'] : f === 'code' ? b.flag.pickLanguage : fieldLabel(p, m.kind, f);
  return (
    <section className={css.flag} aria-labelledby={`${id}-title`} data-testid="missing-translations" data-count={n}>
      <Heading className={css.title} id={`${id}-title`}>
        {b.flag.title(n, b.inLanguage[target])}
      </Heading>
      <p>{b.flag.body(b.inLanguage[target], b.inLanguage[primary])}</p>
      <ul className={css.list}>
        {missing.map((m) => (
          <li key={m.itemId ?? 'header'}>
            <a href={`${appPath.profile(locale)}#${translateAnchor(m.itemId)}`}>{m.kind === 'header' ? b.flag.header : `${m.title || kinds[m.kind]} (${kinds[m.kind]})`}</a>
            {': '}
            {m.fields.map((f) => fieldName(m, f).toLowerCase()).join(', ')}
          </li>
        ))}
      </ul>
      <p className={css.note}>{b.flag.notPrinted}</p>
    </section>
  );
}
