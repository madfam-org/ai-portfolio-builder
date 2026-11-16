import type { DocModel } from './model.ts';
import { ContactLine, EntryView, Paragraphs } from './parts.tsx';
import { RENDER_COPY } from '../../lib/copy/render.ts';
import s from './render.module.css';

/**
 * `cover_letter/base`: a letter. The sender (name, headline, the contact line only when shown), the greeting, the
 * opening (the artifact's summary), the text blocks, a SHORT «relevant experience» list (the first roles or projects
 * of the selection, at most `LETTER_ENTRIES`, each as role, organisation and dates: the CV carries the details;
 * skills, languages and recommendations stay in the CV), the closing and the name as the signature. Nothing is added
 * unseen: no date, no recipient; the greeting and closing the person left empty were shown as the fields'
 * placeholders before the letter was created (components/jobs/tailoring.ts `letterDefaults`).
 */
export const LETTER_ENTRIES = 3;
const LETTER_KINDS = new Set(['experience', 'project']);

export function CoverLetterView({ model }: { model: DocModel }) {
  const t = RENDER_COPY[model.locale];
  const entries = model.sections
    .flatMap((sec) => sec.entries)
    .filter((e) => LETTER_KINDS.has(e.kind))
    .slice(0, LETTER_ENTRIES)
    .map((e) => ({ ...e, summary: null, highlights: [], links: [] }));
  return (
    <article className={`${s.doc} ${s.letter}`} lang={model.locale === 'en' ? 'en' : 'es-MX'} data-kind="cover_letter">
      <header className={s.header}>
        <h1 className={s.name}>{model.heading}</h1>
        {model.headline ? <p className={s.headline} data-part="headline">{model.headline}</p> : null}
        {model.contact ? <ContactLine contact={model.contact} /> : null}
      </header>
      <div className={s.letterBody} data-part="letter-body">
        {model.greeting ? <p className={s.greeting}>{model.greeting}</p> : null}
        <Paragraphs text={model.summary} />
        {model.blocks.map((b, i) => (
          <section key={`b${i}`} className={s.letterBlock} data-block={i}>
            {b.heading ? <h2 className={s.sectionTitle}>{b.heading}</h2> : null}
            <Paragraphs text={b.body} />
          </section>
        ))}
        {entries.length ? (
          <section className={s.section} aria-label={t.relevant} data-section="relevant">
            <h2 className={s.sectionTitle}>{t.relevant}</h2>
            {entries.map((e) => (
              <EntryView key={e.id} entry={e} />
            ))}
          </section>
        ) : null}
        {model.closing ? <Paragraphs text={model.closing} className={s.closing} /> : null}
        {model.name ? <p data-part="signature" className={s.signature}>{model.name}</p> : null}
      </div>
    </article>
  );
}
