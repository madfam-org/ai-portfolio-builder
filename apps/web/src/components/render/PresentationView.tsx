import type { DocModel } from './model.ts';
import { CompactList, ContactLine, EntryView, Paragraphs } from './parts.tsx';
import { SlideDeck } from './SlideDeck.tsx';
import { RENDER_COPY, slidePosition } from '../../lib/copy/render.ts';
import s from './render.module.css';

/**
 * `presentation/base`: HTML slides, one <section> per slide. The title slide (the artifact's title, the person), then
 * the artifact's own slides (title, body, referenced items) or, without any, one slide per section of the selection
 * and per text block; a contact slide only when the contact is shown. Print: one 13.333 × 7.5 in slide per page.
 */
export function PresentationView({ model }: { model: DocModel }) {
  const t = RENDER_COPY[model.locale];
  const slides = [
    <section key="title" className={`${s.slide} ${s.titleSlide}`} aria-label={model.title}>
      <h1 className={s.slideTitle}>{model.title}</h1>
      {model.name ? <p className={s.slideLead}>{model.name}</p> : null}
      {model.headline ? <p className={s.headline}>{model.headline}</p> : null}
    </section>,
    ...model.slides.map((slide, i) => (
      <section key={`s${i}`} className={s.slide} aria-label={slide.title ?? slidePosition(model.locale, i + 2, model.slides.length + 1)}>
        {slide.title ? <h2 className={s.slideTitle}>{slide.title}</h2> : null}
        <Paragraphs text={slide.body} />
        {slide.entries.length && slide.entries.every((e) => e.kind === 'skill' || e.kind === 'language' || e.kind === 'link') ? (
          <CompactList entries={slide.entries} />
        ) : (
          slide.entries.map((e) => <EntryView key={e.id} entry={e} />)
        )}
      </section>
    )),
  ];
  if (model.contact) {
    slides.push(
      <section key="contact" className={s.slide} aria-label={t.contact}>
        <h2 className={s.slideTitle}>{t.contact}</h2>
        <ContactLine contact={model.contact} />
      </section>,
    );
  }
  const positions = slides.map((_, i) => slidePosition(model.locale, i + 1, slides.length));
  return (
    <article className={`${s.doc} ${s.presentation}`} lang={model.locale === 'en' ? 'en' : 'es-MX'} data-kind="presentation">
      <SlideDeck label={t.deckLabel} previous={t.previous} next={t.next} positions={positions} hint={t.keyboardHint}>
        {slides}
      </SlideDeck>
    </article>
  );
}
