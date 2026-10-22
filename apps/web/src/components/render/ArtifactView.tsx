import type { ReactNode } from 'react';
import { APP_COPY, type ItemKind } from '@/lib/copy/app';
import { RENDER_COPY } from '@/lib/copy/render';
import type { Locale } from '@/lib/routing';
import type { PublicArtifact } from '@/server/db/repository';
import type { ArtifactContent } from '@/server/api/validation';

/**
 * MINIMAL renderer (W3-1), shared by the pages host and, later, the cv-app preview. W3-4 replaces it with the
 * per-kind templates (cv/base, portfolio/base, presentation/base, cover_letter/base) and owns this directory.
 *
 * Content safety (lane X §4), kept by every renderer: React text only (no raw HTML), no style attribute, no images,
 * every user link http(s) with rel="ugc nofollow noopener noreferrer" and its host shown, nothing invented: an
 * absent field renders nothing.
 */
type Rec = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);

/** Plain text: blank lines split paragraphs, single newlines become line breaks. */
export function Paragraphs({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <>
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i}>
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

/** A user link: http(s) only (anything else renders as plain text), the destination host visible. */
/** The host of an http(s) URL, or null for anything else (javascript:, data:, malformed, ...). */
export function httpHost(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.host : null;
  } catch {
    return null;
  }
}

export function UserLink({ url, label }: { url: string; label?: string | null }) {
  const host = httpHost(url);
  if (!host) return <span>{label ?? url}</span>;
  return (
    <a href={url} rel="ugc nofollow noopener noreferrer">
      {label ?? host}
      {label ? <span className="muted"> ({host})</span> : null}
    </a>
  );
}

const TITLE_KEYS: Record<ItemKind, readonly string[]> = {
  experience: ['role', 'organization'],
  education: ['institution', 'degree'],
  skill: ['name'],
  project: ['name', 'role'],
  certification: ['name', 'issuer'],
  achievement: ['title'],
  language: ['name', 'level'],
  publication: ['title', 'publisher'],
  volunteering: ['role', 'organization'],
  award: ['title', 'issuer'],
  link: ['label'],
};

function dates(c: Rec, present: string): string | null {
  const start = str(c.startDate) ?? str(c.date);
  const end = c.current === true ? present : str(c.endDate) ?? str(c.expiresOn);
  if (!start && !end) return null;
  return [start, end].filter(Boolean).join(' – ');
}

function Item({ kind, content, override, locale }: { kind: ItemKind; content: Rec; override?: ArtifactContent['items'][number]['override']; locale: Locale }) {
  const title = override?.title ?? TITLE_KEYS[kind].map((k) => str(content[k])).filter(Boolean).join(' · ');
  const when = dates(content, RENDER_COPY[locale].present);
  const highlights = override?.highlights ?? list(content.highlights);
  const url = str(content.url);
  const links = Array.isArray(content.links) ? (content.links as Rec[]) : [];
  return (
    <li>
      {title ? <h3>{title}</h3> : null}
      {when ? <p className="muted small">{when}</p> : null}
      <Paragraphs text={override?.summary ?? str(content.summary)} />
      {highlights.length ? (
        <ul>
          {highlights.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      ) : null}
      {url ? (
        <p>
          <UserLink url={url} />
        </p>
      ) : null}
      {links.map((l, i) => (str(l.url) ? <p key={i}><UserLink url={str(l.url)!} label={str(l.label)} /></p> : null))}
    </li>
  );
}

export function ArtifactView({ data, locale }: { data: PublicArtifact; locale: Locale }) {
  const kinds = APP_COPY[locale].itemKinds;
  const content = data.artifact.content as ArtifactContent;
  const byId = new Map(data.items.map((i) => [i.id, i]));
  // Sections in the order of each kind's first appearance in the owner's selection.
  const sections = new Map<ItemKind, ReactNode[]>();
  for (const ref of content.items ?? []) {
    const item = byId.get(ref.itemId);
    if (!item) continue;
    const kind = item.kind as ItemKind;
    if (!(kind in kinds)) continue;
    const rows = sections.get(kind) ?? [];
    rows.push(<Item key={ref.itemId} kind={kind} content={(item.content ?? {}) as Rec} override={ref.override} locale={locale} />);
    sections.set(kind, rows);
  }
  const contact = (data.profile.contact ?? null) as Rec | null;
  const email = contact ? str(contact.email) : null;
  return (
    <article className="doc">
      <header>
        <h1>{data.profile.displayName || data.artifact.title}</h1>
        {data.profile.headline ? <p className="lead">{data.profile.headline}</p> : null}
        {contact ? (
          <p className="muted">
            {[str(contact.location), str(contact.phone)].filter(Boolean).join(' · ')}
            {email ? (
              <>
                {' '}
                <a href={`mailto:${email}`}>{email}</a>
              </>
            ) : null}
          </p>
        ) : null}
      </header>
      <Paragraphs text={str(content.summary) ?? str(data.profile.summary)} />
      {[...sections.entries()].map(([kind, rows]) => (
        <section key={kind}>
          <h2>{kinds[kind]}</h2>
          <ul className="doc-items">{rows}</ul>
        </section>
      ))}
      {(content.blocks ?? []).map((b, i) => (
        <section key={`b${i}`}>
          {b.heading ? <h2>{b.heading}</h2> : null}
          <Paragraphs text={b.body} />
        </section>
      ))}
    </article>
  );
}
