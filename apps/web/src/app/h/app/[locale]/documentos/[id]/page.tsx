import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppFrame } from '@/components/app/AppFrame';
import { appMetadata, pageLocaleAndId, type IdParams } from '@/components/app/page-helpers';
import { templatesFor } from '@/components/render/ArtifactView';
import { readContent } from '@/components/render/model';
import { ButtonLink } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/Layout';
import { Badge } from '@/components/ui/States';
import { appPath } from '@/lib/app-routes';
import { getConfig } from '@/lib/config';
import { APP_COPY } from '@/lib/copy/app';
import { DOCUMENTS_COPY } from '@/lib/copy/render';
import { loadOwnerDocument } from '../load';
import { DocumentSettings } from '../ui/DocumentSettings';
import { DocumentState } from '../ui/DocumentState';
import { PublishPanel } from '../ui/PublishPanel';
import css from '../ui/documents.module.css';

export function generateMetadata({ params }: IdParams): Promise<Metadata> {
  return appMetadata(params, 'artifact');
}

/**
 * `/documentos/:id`: one document — title, language, template and status; what it contains; preview and print; and
 * sharing (publish by link or publicly, unpublish). Another person's id is the same 404 as a missing one. Owner: W3-4.
 */
export default async function Page({ params }: IdParams) {
  const { locale, id } = await pageLocaleAndId(params);
  const loaded = await loadOwnerDocument(id);
  if (loaded.status === 'missing') notFound();
  const a = APP_COPY[locale];
  const d = DOCUMENTS_COPY[locale];
  return (
    <AppFrame locale={locale} route="artifact" id={id}>
      {() => (
        <DocumentState locale={locale} loaded={loaded}>
          {({ artifact, job }) => {
            const content = readContent(artifact.content);
            return (
              <>
                <PageHeader
                  eyebrow={
                    <p className={css.rowMeta}>
                      <span>{a.kinds[artifact.kind]}</span>
                      <Badge>{a.statuses[artifact.status]}</Badge>
                      <Badge>{d.visibility[artifact.visibility]}</Badge>
                      {artifact.suspendedAt ? <Badge>{d.suspended}</Badge> : null}
                    </p>
                  }
                  title={artifact.title}
                  description={
                    job ? (
                      <>
                        {d.forJob}: <a href={appPath.job(locale, job.id)}>{job.company ? `${job.title} · ${job.company}` : job.title}</a>
                      </>
                    ) : undefined
                  }
                  actions={
                    <>
                      <ButtonLink variant="secondary" href={appPath.artifactPreview(locale, artifact.id)}>
                        {d.preview}
                      </ButtonLink>
                      <ButtonLink variant="secondary" href={appPath.artifactPrint(locale, artifact.id)}>
                        {d.print}
                      </ButtonLink>
                    </>
                  }
                />
                <DocumentSettings locale={locale} artifact={artifact} templates={templatesFor(artifact.kind)} />
                <section className={css.panel} aria-labelledby="doc-content">
                  <h2 id="doc-content">{d.contentTitle}</h2>
                  <p>{d.contentSummary(content.items.length, content.blocks.length)}</p>
                  <p className="muted">
                    {job ? <a href={appPath.jobTailor(locale, job.id)}>{d.contentWhereJob}</a> : <a href={appPath.profile(locale)}>{d.contentWhereProfile}</a>}
                  </p>
                </section>
                <PublishPanel locale={locale} artifact={artifact} pagesHost={getConfig().hosts.pages} />
              </>
            );
          }}
        </DocumentState>
      )}
    </AppFrame>
  );
}
