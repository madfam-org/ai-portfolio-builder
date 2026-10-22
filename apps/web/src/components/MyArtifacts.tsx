'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AppCopy } from '@/lib/app-copy';

interface ArtifactRow {
  id: string;
  kind: keyof AppCopy['kinds'];
  title: string;
  status: keyof AppCopy['statuses'];
}

/**
 * «Mis portafolios»: the signed-in list and a create form, through the same-origin proxy (/api/v1/* on cv-app).
 * Deliberately minimal: it proves the sign-in → owner-scoped data path; the real editor is the next wave.
 */
export function MyArtifacts({ t, locale }: { t: AppCopy; locale: 'es-MX' | 'en' }) {
  const [rows, setRows] = useState<ArtifactRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<ArtifactRow['kind']>('cv');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/artifacts', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      setRows(((await res.json()) as { artifacts: ArtifactRow[] }).artifacts);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    // Loads once on mount; the state updates happen after the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const res = await fetch('/api/v1/artifacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, title, locale }),
    });
    if (!res.ok) {
      setFailed(true);
      return;
    }
    setTitle('');
    await load();
  }

  return (
    <section className="band" aria-labelledby="mine">
      <h2 id="mine">{t.mine}</h2>
      <p className="muted">{t.mineIntro}</p>
      {failed ? <p role="alert">{t.failed}</p> : null}
      {rows === null ? (
        <p className="muted">{t.loading}</p>
      ) : rows.length === 0 ? (
        <p className="muted">{t.empty}</p>
      ) : (
        <ul className="list">
          {rows.map((r) => (
            <li key={r.id}>
              <strong>{r.title}</strong> · {t.kinds[r.kind]} · <span className="tag">{t.statuses[r.status]}</span>
            </li>
          ))}
        </ul>
      )}
      <form className="stack" onSubmit={create}>
        <h3>{t.createTitle}</h3>
        <label>
          {t.titleLabel}
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
        </label>
        <label>
          {t.kindLabel}
          <select value={kind} onChange={(e) => setKind(e.target.value as ArtifactRow['kind'])}>
            {(Object.keys(t.kinds) as ArtifactRow['kind'][]).map((k) => (
              <option key={k} value={k}>
                {t.kinds[k]}
              </option>
            ))}
          </select>
        </label>
        <button className="button" type="submit">
          {t.create}
        </button>
      </form>
    </section>
  );
}
