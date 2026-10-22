'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { SelectField, TextField } from '@/components/ui/Field';
import { Badge, EmptyState, ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { api, apiErrorMessage, type ApiError } from '@/lib/client/api';
import type { ArtifactDto, ArtifactKind } from '@/lib/client/types';
import { APP_COPY } from '@/lib/copy/app';
import type { Locale } from '@/lib/routing';

const KINDS: readonly ArtifactKind[] = ['cv', 'portfolio', 'presentation', 'cover_letter'];

/**
 * W2's «Mis documentos» on the client data layer: the signed-in person's artifacts and a create form. Dormant-aware:
 * a 503 not_configured (no database yet) shows the honest state, never an empty list that looks real.
 */
export function ArtifactQuickList({ locale }: { locale: Locale }) {
  const a = APP_COPY[locale];
  const toast = useToast();
  const [rows, setRows] = useState<ArtifactDto[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<ArtifactKind>('cv');

  const load = useCallback(async () => {
    const res = await api.listArtifacts();
    if (res.ok) {
      setRows(res.data.artifacts);
      setError(null);
    } else {
      setError(res.error);
    }
  }, []);

  useEffect(() => {
    // Loads once on mount; the state updates happen after the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const res = await api.createArtifact({ kind, title, locale: locale === 'en' ? 'en' : 'es-MX' });
    if (!res.ok) {
      toast(apiErrorMessage(res.error, a.states), 'danger');
      return;
    }
    setTitle('');
    toast(a.states.saved);
    await load();
  }

  return (
    <section className="band" aria-labelledby="mine">
      <h2 id="mine">{a.mine}</h2>
      <p className="muted">{a.mineIntro}</p>
      {error ? (
        <ErrorState
          message={apiErrorMessage(error, a.states)}
          action={
            error.kind === 'not_configured' ? null : (
              <Button variant="secondary" size="small" onClick={() => void load()}>
                {a.states.retry}
              </Button>
            )
          }
        />
      ) : rows === null ? (
        <p className="muted">{a.loading}</p>
      ) : rows.length === 0 ? (
        <EmptyState title={a.empty} />
      ) : (
        <ul className="list" data-testid="artifact-list">
          {rows.map((r) => (
            <li key={r.id}>
              <strong>{r.title}</strong> · {a.kinds[r.kind]} · <Badge>{a.statuses[r.status]}</Badge>
            </li>
          ))}
        </ul>
      )}
      {error?.kind === 'not_configured' ? null : (
        <form className="stack" onSubmit={create}>
          <h3>{a.createTitle}</h3>
          <TextField id="new-artifact-title" label={a.titleLabel} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
          <SelectField
            id="new-artifact-kind"
            label={a.kindLabel}
            value={kind}
            onChange={(e) => setKind(e.target.value as ArtifactKind)}
            options={KINDS.map((k) => ({ value: k, label: a.kinds[k] }))}
          />
          <Button type="submit">{a.create}</Button>
        </form>
      )}
    </section>
  );
}
