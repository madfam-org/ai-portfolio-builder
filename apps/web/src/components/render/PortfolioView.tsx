import type { DocModel } from './model.ts';
import { BlocksView, CompactList, ContactLine, EntryView, Paragraphs } from './parts.tsx';
import { RENDER_COPY } from '../../lib/copy/render.ts';
import s from './render.module.css';

/**
 * `portfolio/base`: a single-page site. The intro, the selection as cards (projects and experience read as cards;
 * skills and languages as compact lists), the text blocks and, when shown, the contact. Responsive: one column on a
 * phone, two card columns from 44rem.
 */
export function PortfolioView({ model }: { model: DocModel }) {
  const t = RENDER_COPY[model.locale];
  return (
    <article className={`${s.doc} ${s.portfolio}`} lang={model.locale === 'en' ? 'en' : 'es-MX'} data-kind="portfolio">
      <header className={`${s.header} ${s.hero}`}>
        <h1 className={s.name}>{model.name ?? model.title}</h1>
        {model.headline ? <p className={s.headline}>{model.headline}</p> : null}
        <Paragraphs text={model.intro} className={s.lead} />
      </header>
      {model.sections.map((section) => (
        <section key={section.kind} className={s.section} aria-label={section.heading} data-section={section.kind}>
          <h2 className={s.sectionTitle}>{section.heading}</h2>
          {section.compact ? (
            <CompactList entries={section.entries} />
          ) : (
            <ul className={s.cards}>
              {section.entries.map((e) => (
                <li key={e.id} className={s.card}>
                  <EntryView entry={e} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <BlocksView blocks={model.blocks} />
      {model.contact ? (
        <section className={s.section} aria-label={t.contact} data-section="contact">
          <h2 className={s.sectionTitle}>{t.contact}</h2>
          <ContactLine contact={model.contact} />
        </section>
      ) : null}
    </article>
  );
}
