'use client';

import { useEffect, useState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { api } from '@/lib/client/api';
import { appPath } from '@/lib/app-routes';
import { ONBOARDING_COPY } from '@/lib/copy/onboarding';
import type { Locale } from '@/lib/routing';
import s from './onboarding.module.css';

/** The import panel's heading on /perfil (components/import/ImportPanel.tsx), the target of «Importar». */
const IMPORT_ANCHOR = 'perfil-importar';

/**
 * The first-run guide (B1): shown on the app home to a signed-in person whose profile is still empty (no header and
 * no items, read through the same-origin data layer). Two steps: build the profile (import, or by hand), then save the
 * first job (W5-J intake). Renders nothing while loading, on any error or once the profile has anything in it: the
 * home's own cards stay the way in. No new data: «empty» is read from the profile itself.
 */
export function FirstRunGuide({ locale }: { locale: Locale }) {
  const copy = ONBOARDING_COPY[locale];
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    let live = true;
    void api.getProfile().then((result) => {
      if (live) setEmpty(result.ok && result.data.profile === null && result.data.items.length === 0);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!empty) return null;
  return (
    <section className={s.guide} aria-labelledby="primeros-pasos" data-testid="first-run-guide">
      <h2 id="primeros-pasos">{copy.title}</h2>
      <p className={s.intro}>{copy.intro}</p>
      <ol className={s.steps}>
        <li>
          <h3>{copy.profileStep.title}</h3>
          <p>{copy.profileStep.body}</p>
          <div className={s.actions}>
            <ButtonLink size="small" href={`${appPath.profile(locale)}#${IMPORT_ANCHOR}`}>
              {copy.profileStep.importCta}
            </ButtonLink>
            <ButtonLink size="small" variant="secondary" href={appPath.profile(locale)}>
              {copy.profileStep.manualCta}
            </ButtonLink>
          </div>
        </li>
        <li>
          <h3>{copy.jobStep.title}</h3>
          <p>{copy.jobStep.body}</p>
          <div className={s.actions}>
            <ButtonLink size="small" variant="secondary" href={appPath.jobNew(locale)}>
              {copy.jobStep.cta}
            </ButtonLink>
          </div>
        </li>
      </ol>
      <p className={s.privacy}>{copy.privacy}</p>
    </section>
  );
}
