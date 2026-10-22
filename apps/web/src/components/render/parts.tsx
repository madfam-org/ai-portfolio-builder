/**
 * The building blocks every renderer shares. React text only (no raw HTML), no style attribute, no images; every
 * user link carries rel="ugc nofollow noopener noreferrer" (lane X §4.2), on every surface, so a preview is exactly
 * the public page.
 */
import type { ReactNode } from 'react';
import type { DocLink, DocModel, Entry, Section } from './model.ts';
import s from './render.module.css';

export const USER_LINK_REL = 'ugc nofollow noopener noreferrer';

/** Plain text: blank lines split paragraphs, single newlines become line breaks. */
export function Paragraphs({ text, className }: { text: string | null | undefined; className?: string }) {
  if (!text) return null;
  return (
    <>
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className={className}>
          {para.split('\n').map((line, j) => (
            <span key={j}>
              {j > 0 ? <br /> : null}
              {line}
            </span>
          ))}
        </p>
      ))}
    </>
  );
}

/** A user link (http(s), mailto: or tel: built by the model; never anything else). */
export function UserLink({ link }: { link: DocLink }) {
  return (
    <a href={link.href} rel={USER_LINK_REL}>
      {link.text}
      {link.host ? <span className={s.host}> ({link.host})</span> : null}
    </a>
  );
}

export function LinkList({ links }: { links: DocLink[] }) {
  if (!links.length) return null;
  return (
    <ul className={s.links} data-part="links">
      {links.map((l, i) => (
        <li key={i}>
          <UserLink link={l} />
        </li>
      ))}
    </ul>
  );
}

/** One entry: h3 title, the organisation line, dates, summary, highlights, links. */
export function EntryView({ entry, Heading = 'h3' }: { entry: Entry; Heading?: 'h3' | 'h4' }) {
  const line = [entry.subtitle, ...entry.meta].filter(Boolean).join(' · ');
  return (
    <article className={s.entry} data-item-id={entry.id}>
      <div className={s.entryHead} data-part="entry-head">
        {entry.title ? <Heading className={s.entryTitle}>{entry.title}</Heading> : null}
        {entry.dates ? <p className={s.dates} data-part="dates">{entry.dates}</p> : null}
      </div>
      {line ? <p className={s.entryLine} data-part="entry-line">{line}</p> : null}
      <Paragraphs text={entry.summary} />
      {entry.highlights.length ? (
        <ul className={s.highlights} data-part="highlights">
          {entry.highlights.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      ) : null}
      <LinkList links={entry.links} />
    </article>
  );
}

/** Skills, languages and links: one compact list («Python — Avanzado, 5 años»). */
export function CompactList({ entries }: { entries: Entry[] }) {
  return (
    <ul className={s.compact} data-part="compact">
      {entries.map((e) => (
        <li key={e.id} data-item-id={e.id}>
          {e.kind === 'link' && e.links[0] ? (
            <UserLink link={e.links[0]} />
          ) : (
            <>
              <span className={s.compactName}>{e.title}</span>
              {e.meta.length ? <span> — {e.meta.join(', ')}</span> : null}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

/** A section of entries under an h2 (`id` anchors for the presentation and the e2e). */
export function SectionView({ section, Heading = 'h2', className }: { section: Section; Heading?: 'h2' | 'h3'; className?: string }) {
  return (
    <section className={className ?? s.section} aria-label={section.heading} data-section={section.kind}>
      <Heading className={s.sectionTitle}>{section.heading}</Heading>
      {section.compact ? <CompactList entries={section.entries} /> : section.entries.map((e) => <EntryView key={e.id} entry={e} Heading={Heading === 'h2' ? 'h3' : 'h4'} />)}
    </section>
  );
}

/** The contact line (only present when the owner chose to show it). */
export function ContactLine({ contact }: { contact: NonNullable<DocModel['contact']> }) {
  const parts: ReactNode[] = [];
  if (contact.location) parts.push(<span key="loc">{contact.location}</span>);
  if (contact.email) parts.push(<UserLink key="mail" link={contact.email} />);
  if (contact.phone) parts.push(contact.phone.href ? <a key="tel" href={contact.phone.href} rel={USER_LINK_REL}>{contact.phone.text}</a> : <span key="tel">{contact.phone.text}</span>);
  contact.links.forEach((l, i) => parts.push(<UserLink key={`l${i}`} link={l} />));
  return (
    <ul className={s.contact} data-part="contact">
      {parts.map((p, i) => (
        <li key={i}>{p}</li>
      ))}
    </ul>
  );
}

/** The free text blocks (a heading only when the owner gave one). */
export function BlocksView({ blocks, Heading = 'h2' }: { blocks: DocModel['blocks']; Heading?: 'h2' | 'h3' }) {
  return (
    <>
      {blocks.map((b, i) => (
        <section key={`b${i}`} className={s.section} data-block={i}>
          {b.heading ? <Heading className={s.sectionTitle}>{b.heading}</Heading> : null}
          <Paragraphs text={b.body} />
        </section>
      ))}
    </>
  );
}
