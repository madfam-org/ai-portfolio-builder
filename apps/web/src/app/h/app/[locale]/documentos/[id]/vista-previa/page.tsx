import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppFrame } from '@/components/app/AppFrame';
import { appMetadata, pageLocaleAndId, type IdParams } from '@/components/app/page-helpers';
import { ArtifactView } from '@/components/render/ArtifactView';
import { ButtonLink } from '@/components/ui/Button';
import { Notice } from '@/components/ui/States';
import { appPath } from '@/lib/app-routes';
import { DOCUMENTS_COPY } from '@/lib/copy/render';
import { loadOwnerDocument } from '../../load';
import { DocumentState } from '../../ui/DocumentState';
import css from '../../ui/documents.module.css';

export function generateMetadata({ params }: IdParams): Promise<Metadata> {
  return appMetadata(params, 'artifactPreview');
}

/**
 * `/documentos/:id/vista-previa`: the document through the SAME renderer and data shape as the pages host (drafts
 * included: this page is owner-only, behind the session and the owner-scoped repository). Owner: W3-4.
 */
export default async function Page({ params }: IdParams) {
  const { locale, id } = await pageLocaleAndId(params);
  const loaded = await loadOwnerDocument(id);
  if (loaded.status === 'missing') notFound();
  const d = DOCUMENTS_COPY[locale];
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
              <div className={`${css.frame} ${css.sheet}`}>
                <ArtifactView data={data} />
              </div>
            </>
          )}
        </DocumentState>
      )}
    </AppFrame>
  );
}
