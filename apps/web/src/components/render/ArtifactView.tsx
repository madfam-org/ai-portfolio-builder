import type { ReactNode } from 'react';
import { CoverLetterView } from './CoverLetterView.tsx';
import { CvView } from './CvView.tsx';
import { buildDocModel, type DocModel, type RenderData } from './model.ts';
import { PortfolioView } from './PortfolioView.tsx';
import { PresentationView } from './PresentationView.tsx';
import type { ArtifactKind } from '../../lib/copy/app.ts';
import type { Paper } from '../../lib/copy/render.ts';
import s from './render.module.css';

/**
 * The renderer registry: (kind, template) → component, shared by the cv-app preview and print view and by the pages
 * host. W3 ships one honest template per kind, `base`; an unknown template falls back to that kind's `base` and is
 * logged (never silently another kind). Driven ONLY by the artifact's content resolved against the owner's profile
 * (components/render/model.ts).
 *
 * Content safety (lane X §4), kept by every renderer: React text only (no raw HTML), no style attribute, no images,
 * user links http(s) (or mailto:/tel: from the shown contact) with rel="ugc nofollow noopener noreferrer", nothing
 * invented: an absent field renders nothing.
 */
const TEMPLATES: Record<ArtifactKind, Record<string, (props: { model: DocModel }) => ReactNode>> = {
  cv: { base: CvView },
  portfolio: { base: PortfolioView },
  presentation: { base: PresentationView },
  cover_letter: { base: CoverLetterView },
};

/** The templates a kind offers (the editor's select). */
export function templatesFor(kind: ArtifactKind): string[] {
  return Object.keys(TEMPLATES[kind]);
}

export function ArtifactView({ data, paper }: { data: RenderData; paper?: Paper }) {
  const model = buildDocModel(data);
  const byTemplate = TEMPLATES[model.kind];
  let View = byTemplate[model.template];
  if (!View) {
    console.warn(`cv render: unknown template "${model.template.slice(0, 40)}" for ${model.kind}; using base`);
    View = byTemplate.base!;
  }
  const paperClass = model.kind === 'presentation' ? s.paperSlides : paper === 'a4' ? s.paperA4 : paper === 'letter' ? s.paperLetter : '';
  return (
    <div className={[s.sheet, paperClass].filter(Boolean).join(' ')} data-paper={model.kind === 'presentation' ? 'slides' : (paper ?? 'auto')}>
      <View model={model} />
    </div>
  );
}
