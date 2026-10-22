import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppFrame } from '@/components/app/AppFrame';
import { appMetadata, pageLocaleAndId, type IdParams } from '@/components/app/page-helpers';
import { ArtifactView } from '@/components/render/ArtifactView';
import { appPath } from '@/lib/app-routes';
import { letterFolds, paperStocks } from '@/lib/pliego/paper';
import { loadOwnerDocument } from '../../load';
import { DocumentState } from '../../ui/DocumentState';
import { PrintView } from '../../ui/PrintView';

export function generateMetadata({ params }: IdParams): Promise<Metadata> {
  return appMetadata(params, 'artifactPrint');
}

/**
 * `/documentos/:id/imprimir`: the renderer alone on a sheet, with a paper toggle (Carta / A4) and «Imprimir o guardar
 * como PDF» = the browser's print dialog (its «Guardar como PDF» keeps a real text layer, which is what ATS parsing
 * needs; lane X §5 PDF decision). In print media the app frame and the controls disappear. Owner: W3-4.
 * W5-P: Pliego's paper data (stock cards; the letter fold for a cover letter) is read HERE, on the server, and only
 * the small views reach the client controls.
 */
export default async function Page({ params }: IdParams) {
  const { locale, id } = await pageLocaleAndId(params);
  const loaded = await loadOwnerDocument(id);
  if (loaded.status === 'missing') notFound();
  return (
    <AppFrame locale={locale} route="artifactPrint" id={id}>
      {() => (
        <DocumentState locale={locale} loaded={loaded}>
          {({ artifact, data }) => (
            <PrintView
              locale={locale}
              slides={artifact.kind === 'presentation'}
              backHref={appPath.artifact(locale, artifact.id)}
              stocks={paperStocks()}
              folds={artifact.kind === 'cover_letter' ? letterFolds() : null}
            >
              <ArtifactView data={data} />
            </PrintView>
          )}
        </DocumentState>
      )}
    </AppFrame>
  );
}
