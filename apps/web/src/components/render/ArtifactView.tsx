import type { ReactNode } from 'react';
import { CoverLetterView } from './CoverLetterView.tsx';
import { CvView } from './CvView.tsx';
import { buildDocModel, type DocModel, type RenderData } from './model.ts';
import { PortfolioView } from './PortfolioView.tsx';
import { PresentationView } from './PresentationView.tsx';
import type { ArtifactKind } from '../../lib/copy/app.ts';
import type { Paper } from '../../lib/copy/render.ts';
import { templateIds } from '../../lib/templates.ts';
import s from './render.module.css';
import tpl from './templates.module.css';

/**
 * The renderer registry: (kind, template) → component + the template's class, shared by the cv-app preview and print
 * view and by the pages host. The template ids, labels and trade-offs live in ONE place, `lib/templates.ts` (also the
 * API's allowlist); this table only maps each id to how it renders, and a unit test keeps the two in step. An unknown
 * template (a row stored before the allowlist) falls back to that kind's `base` and is logged (never silently another
 * kind). Driven ONLY by the artifact's content resolved against the owner's profile (components/render/model.ts).
 *
 * W4-T templates restyle the SAME semantic markup (templates.module.css); none changes the structure, so every CV
 * template stays one column of real text under h1–h3 (ATS-safe), and print rules (A4 / Letter named pages, no split
 * entries) apply to all of them.
 *
 * Content safety (lane X §4), kept by every renderer: React text only (no raw HTML), no style attribute, no images,
 * user links http(s) (or mailto:/tel: from the shown contact) with rel="ugc nofollow noopener noreferrer", nothing
 * invented: an absent field renders nothing.
 */
type View = (props: { model: DocModel }) => ReactNode;
interface Renderer {
  View: View;
  /** The template's class on the sheet ('' for `base`). */
  className: string;
}

const RENDERERS: Record<ArtifactKind, Record<string, Renderer>> = {
  cv: { base: { View: CvView, className: '' }, compacto: { View: CvView, className: tpl.cvCompacto! }, clasico: { View: CvView, className: tpl.cvClasico! } },
  portfolio: { base: { View: PortfolioView, className: '' }, lista: { View: PortfolioView, className: tpl.portfolioLista! } },
  presentation: { base: { View: PresentationView, className: '' }, contraste: { View: PresentationView, className: tpl.presentationContraste! } },
  cover_letter: { base: { View: CoverLetterView, className: '' }, formal: { View: CoverLetterView, className: tpl.letterFormal! } },
};

/** The templates a kind offers (the pickers), in the registry's order. */
export function templatesFor(kind: ArtifactKind): string[] {
  return templateIds(kind);
}

/** The template ids this table can render (a unit test asserts they equal the registry's, kind by kind). */
export function renderableTemplates(kind: ArtifactKind): string[] {
  return Object.keys(RENDERERS[kind]);
}

export function ArtifactView({ data, paper }: { data: RenderData; paper?: Paper }) {
  const model = buildDocModel(data);
  const byTemplate = RENDERERS[model.kind];
  let template = model.template;
  if (!byTemplate[template]) {
    console.warn(`cv render: unknown template "${model.template.slice(0, 40)}" for ${model.kind}; using base`);
    template = 'base';
  }
  const { View, className } = byTemplate[template]!;
  const paperClass = model.kind === 'presentation' ? s.paperSlides : paper === 'a4' ? s.paperA4 : paper === 'letter' ? s.paperLetter : '';
  return (
    <div className={[s.sheet, paperClass, className].filter(Boolean).join(' ')} data-paper={model.kind === 'presentation' ? 'slides' : (paper ?? 'auto')} data-template={template}>
      <View model={model} />
    </div>
  );
}
