import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/States';
import { appPath } from '@/lib/app-routes';
import type { ArtifactDto } from '@/lib/client/types';
import { APP_COPY } from '@/lib/copy/app';
import { fmt, JOBS_COPY } from '@/lib/copy/jobs';
import type { Locale } from '@/lib/routing';
import { versionsByKind } from './tailoring';
import s from './jobs.module.css';

/**
 * The documents that exist for one job, by kind and numbered as versions (several per kind are allowed). Each links
 * to its page under /documentos (W3-4 owns rendering; this only links).
 */
export function JobDocuments({ locale, artifacts, headingId, children }: { locale: Locale; artifacts: readonly ArtifactDto[]; headingId: string; children?: ReactNode }) {
  const a = APP_COPY[locale];
  const t = JOBS_COPY[locale];
  const groups = versionsByKind(artifacts);
  return (
    <section className={s.section} aria-labelledby={headingId} data-testid="job-documents">
      <h2 id={headingId}>{t.docs.heading}</h2>
      {groups.length === 0 ? (
        <p className="muted">{t.docs.none}</p>
      ) : (
        <ul className={s.plain}>
          {groups.map((g) => (
            <li key={g.kind}>
              <h3>{a.kinds[g.kind]}</h3>
              <ul className={s.plain}>
                {g.versions.map((v) => (
                  <li key={v.id} data-testid="job-document">
                    <a href={appPath.artifact(locale, v.id)}>{v.title}</a> <span className="small muted">({fmt(t.docs.version, { n: v.version })})</span>{' '}
                    <Badge>{a.statuses[v.status]}</Badge>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <div className={s.links}>
        {children}
        <a href={appPath.artifacts(locale)}>{t.docs.viewAll}</a>
      </div>
    </section>
  );
}
