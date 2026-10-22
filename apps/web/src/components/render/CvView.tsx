import type { DocModel } from './model.ts';
import { BlocksView, ContactLine, Paragraphs, SectionView } from './parts.tsx';
import { RENDER_COPY } from '../../lib/copy/render.ts';
import s from './render.module.css';

/**
 * `cv/base`: ATS-friendly. One column, semantic h1–h3, standard section names, real text (dates as words, links as
 * visible addresses), no tables, no icons that carry meaning, system fonts. Print: A4 or Letter (render.module.css),
 * an entry never splits across pages and a heading never ends a page.
 */
export function CvView({ model }: { model: DocModel }) {
  const t = RENDER_COPY[model.locale];
  return (
    <article className={`${s.doc} ${s.cv}`} lang={model.locale === 'en' ? 'en' : 'es-MX'} data-kind="cv">
      <header className={s.header}>
        <h1 className={s.name}>{model.name ?? model.title}</h1>
        {model.headline ? <p className={s.headline} data-part="headline">{model.headline}</p> : null}
        {model.contact ? <ContactLine contact={model.contact} /> : null}
      </header>
      {model.summary ? (
        <section className={s.section} aria-label={t.summary} data-section="summary">
          <h2 className={s.sectionTitle}>{t.summary}</h2>
          <Paragraphs text={model.summary} />
        </section>
      ) : null}
      {model.sections.map((section) => (
        <SectionView key={section.kind} section={section} />
      ))}
      <BlocksView blocks={model.blocks} />
    </article>
  );
}
