import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppFrame } from '@/components/app/AppFrame';
import { appMetadata, pageLocaleAndId, type IdParams } from '@/components/app/page-helpers';
import { PaperSheet } from '@/components/paper/PaperSheet';
import paperCss from '@/components/paper/paper.module.css';
import { ArtifactView } from '@/components/render/ArtifactView';
import { ButtonLink } from '@/components/ui/Button';
import { Notice } from '@/components/ui/States';
import { appPath } from '@/lib/app-routes';
import { PAPER_COPY } from '@/lib/copy/paper';
import { DOCUMENTS_COPY } from '@/lib/copy/render';
import { DEFAULT_STOCK, paperStock } from '@/lib/pliego/paper';
import { loadOwnerDocument } from '../../load';
import { DocumentState } from '../../ui/DocumentState';
import css from '../../ui/documents.module.css';

export function generateMetadata({ params }: IdParams): Promise<Metadata> {
  return appMetadata(params, 'artifactPreview');
}

/**
 * `/documentos/:id/vista-previa`: the document through the SAME renderer and data shape as the pages host (drafts
 * included: this page is owner-only, behind the session and the owner-scoped repository). Owner: W3-4.
 * W5-P: a document that prints on paper is shown on a sheet of bond 80 (Pliego's stock card), on screen only; slides
 * keep their plain frame.
 */
export default async function Page({ params }: IdParams) {
  const { locale, id } = await pageLocaleAndId(params);
  const loaded = await loadOwnerDocument(id);
  if (loaded.status === 'missing') notFound();
  const d = DOCUMENTS_COPY[locale];
  const bond = paperStock(DEFAULT_STOCK);
  return (
    <AppFrame locale={locale} route="artifactPreview" id={id}>
      {() => (
        <DocumentState locale={locale} loaded={loaded}>
          {({ artifact, data }) => (
            <>
              <div className={css.toolbar}>
                <ButtonLink variant="secondary" size="small" href={appPath.artifact(locale, artifact.id)}>
                  {d.back}
                </ButtonLink>
                <ButtonLink variant="secondary" size="small" href={appPath.artifactPrint(locale, artifact.id)}>
                  {d.print}
                </ButtonLink>
              </div>
              <Notice>
                {d.previewNote} {artifact.visibility === 'private' ? d.previewPrivate : `${d.visibility[artifact.visibility]}.`}
              </Notice>
              {artifact.kind === 'presentation' ? (
                <div className={`${css.frame} ${css.sheet}`}>
                  <ArtifactView data={data} />
                </div>
              ) : (
                <>
                  <PaperSheet className={`${css.frame} ${css.sheet}`} look={bond.look} stock={bond.id}>
                    <ArtifactView data={data} />
                  </PaperSheet>
                  <p className={paperCss.previewNote}>{PAPER_COPY[locale].previewOn(bond.name[locale])}</p>
                </>
              )}
            </>
          )}
        </DocumentState>
      )}
    </AppFrame>
  );
}
