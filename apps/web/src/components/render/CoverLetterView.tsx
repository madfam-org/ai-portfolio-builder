import type { DocModel } from './model.ts';
import { ContactLine, EntryView, Paragraphs } from './parts.tsx';
import { RENDER_COPY } from '../../lib/copy/render.ts';
import s from './render.module.css';

/**
 * `cover_letter/base`: a letter. The sender (name, headline, the contact line only when shown), the greeting, the
 * opening (the artifact's summary), the text blocks, the selected items as a short «relevant experience» list, the
 * closing and the name as the signature. Nothing is added: no date, no recipient, no stock phrase.
 */
export function CoverLetterView({ model }: { model: DocModel }) {
  const t = RENDER_COPY[model.locale];
  const entries = model.sections.flatMap((sec) => sec.entries);
  return (
    <article className={`${s.doc} ${s.letter}`} lang={model.locale === 'en' ? 'en' : 'es-MX'} data-kind="cover_letter">
      <header className={s.header}>
        <h1 className={s.name}>{model.name ?? model.title}</h1>
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
