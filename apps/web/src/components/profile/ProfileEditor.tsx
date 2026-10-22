'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { PageHeader } from '@/components/ui/Layout';
import { Badge, EmptyState, ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { api, apiErrorMessage, type ApiError } from '@/lib/client/api';
import type { ContentLocale, ItemKind, ProfileDto } from '@/lib/client/types';
import { APP_COPY } from '@/lib/copy/app';
import { PROFILE_COPY } from '@/lib/copy/profile';
import type { Locale } from '@/lib/routing';
import { ITEM_FIELDS, ITEM_KIND_ORDER, contentToForm, issuesToErrors, itemHeading } from './fields';
import { HeaderForm } from './HeaderForm';
import { ItemForm, type ItemDraft } from './ItemForm';
import { KindSection, addId, controlId, sectionId } from './KindSection';
import { globalOrder, itemsOfKind, moveWithinKind, nextPosition, placeOf, removeItem, replaceItem, tempId, type EditorItem } from './items-state';
import s from './profile.module.css';

interface Editing {
  kind: ItemKind;
  /** null: a new item. */
  id: string | null;
  draft: ItemDraft;
  /** Remounts the form when it reopens (fresh state from `draft`). */
  key: number;
}

type Load = { state: 'loading' } | { state: 'error'; error: ApiError } | { state: 'ready' };

const emptyDraft = (kind: ItemKind): ItemDraft => ({ values: contentToForm(ITEM_FIELDS[kind], {}), tags: [], draft: '', errors: {} });

/**
 * `/perfil`: the core profile every tailored document draws from. The header (the person) and the 11 item kinds, each
 * with its own form. Changes show at once (optimistic) and are sent through the same-origin data layer; when the API
 * refuses one, the list goes back to how it was and the form reopens with what was typed and the errors.
 * Honest states: loading, «no configurado» (dormant), session ended, unavailable with «Reintentar». No AI, no import.
 */
export function ProfileEditor({ locale, nameHint }: { locale: Locale; nameHint: string | null }) {
  const copy = PROFILE_COPY[locale];
  const appCopy = APP_COPY[locale];
  const contentLocale: ContentLocale = locale === 'en' ? 'en' : 'es-MX';
  const toast = useToast();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [profile, setProfile] = useState<ProfileDto | null>(null);
  const [items, setItems] = useState<EditorItem[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [toDelete, setToDelete] = useState<EditorItem | null>(null);
  const [reordering, setReordering] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const focusAfter = useRef<string[] | null>(null);
  const counter = useRef(1);

  const fetchProfile = useCallback(async () => {
    setLoad({ state: 'loading' });
    const res = await api.getProfile();
    if (!res.ok) {
      setLoad({ state: 'error', error: res.error });
      return;
    }
    setProfile(res.data.profile);
    setItems(res.data.items);
    setLoad({ state: 'ready' });
  }, []);

  useEffect(() => {
    // Loads once on mount; the state updates happen after the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchProfile();
  }, [fetchProfile]);

  // Focus moves after the DOM it targets exists: the first listed control that is present and enabled wins, else the
  // first present one (a disabled-looking «Subir» keeps the focus while a move is in flight; it stays focusable).
  useEffect(() => {
    const ids = focusAfter.current;
    if (!ids) return;
    focusAfter.current = null;
    const present = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    (present.find((el) => el.getAttribute('aria-disabled') !== 'true') ?? present[0])?.focus();
  });

  const fail = (error: ApiError) => toast(`${apiErrorMessage(error, appCopy.states)} ${copy.announce.rolledBack}`, 'danger');
  const nextKey = () => counter.current++;

  function openNew(kind: ItemKind) {
    setEditing({ kind, id: null, draft: emptyDraft(kind), key: nextKey() });
  }
  function openEdit(item: EditorItem) {
    setEditing({ kind: item.kind, id: item.id, draft: { values: contentToForm(ITEM_FIELDS[item.kind], item.content), tags: [...item.tags], draft: '', errors: {} }, key: nextKey() });
  }
  function closeForm() {
    if (editing) focusAfter.current = editing.id ? [controlId(editing.id, 'edit')] : [addId(editing.kind)];
    setEditing(null);
  }

  async function save(target: Editing, result: { content: Record<string, unknown>; tags: string[]; draft: ItemDraft }) {
    const { kind, id } = target;
    const known = ITEM_FIELDS[kind].map((f) => f.name);
    const reopen = (error: ApiError) => setEditing({ kind, id, draft: { ...result.draft, errors: issuesToErrors(error.issues, known) }, key: nextKey() });
    setEditing(null);
    if (id === null) {
      const temp = tempId(nextKey());
      const now = new Date().toISOString();
      const position = nextPosition(items);
      setItems((all) => [...all, { id: temp, profileId: profile?.id ?? '', kind, position, content: result.content, tags: result.tags, createdAt: now, updatedAt: now, pending: true }]);
      focusAfter.current = [addId(kind)];
      const res = await api.createItem({ kind, position, content: result.content, tags: result.tags });
      if (!res.ok) {
        setItems((all) => removeItem(all, temp));
        fail(res.error);
        reopen(res.error);
        return;
      }
      setItems((all) => replaceItem(all, temp, res.data.item));
      setAnnouncement(copy.announce.created);
      return;
    }
    const before = items.find((i) => i.id === id);
    if (!before) return;
    setItems((all) => replaceItem(all, id, { ...before, content: result.content, tags: result.tags, pending: true }));
    focusAfter.current = [controlId(id, 'edit')];
    const res = await api.updateItem(id, { content: result.content, tags: result.tags });
    if (!res.ok) {
      if (res.error.kind === 'not_found') {
        setItems((all) => removeItem(all, id));
        toast(apiErrorMessage(res.error, appCopy.states), 'danger');
        return;
      }
      setItems((all) => replaceItem(all, id, before));
      fail(res.error);
      reopen(res.error);
      return;
    }
    setItems((all) => replaceItem(all, id, res.data.item));
    setAnnouncement(copy.announce.updated);
  }

  async function confirmDelete() {
    const item = toDelete;
    setToDelete(null);
    if (!item) return;
    const index = items.findIndex((i) => i.id === item.id);
    setItems((all) => removeItem(all, item.id));
    focusAfter.current = [addId(item.kind)];
    const res = await api.deleteItem(item.id);
    if (!res.ok && res.error.kind !== 'not_found') {
      setItems((all) => (all.some((i) => i.id === item.id) ? all : [...all.slice(0, index), item, ...all.slice(index)]));
      fail(res.error);
      return;
    }
    setAnnouncement(copy.announce.deleted);
  }

  async function move(item: EditorItem, delta: -1 | 1) {
    if (reordering || items.some((i) => i.pending)) return;
    const next = moveWithinKind(items, item.id, delta);
    if (!next) return;
    const before = new Map(items.map((i) => [i.id, i.position]));
    setItems(next);
    setReordering(true);
    focusAfter.current = [controlId(item.id, delta < 0 ? 'up' : 'down'), controlId(item.id, delta < 0 ? 'down' : 'up')];
    const res = await api.reorderItems(globalOrder(next));
    setReordering(false);
    focusAfter.current = [controlId(item.id, delta < 0 ? 'up' : 'down'), controlId(item.id, delta < 0 ? 'down' : 'up')];
    if (!res.ok) {
      setItems((all) => all.map((i) => (before.has(i.id) ? { ...i, position: before.get(i.id)! } : i)));
      fail(res.error);
      return;
    }
    setItems(res.data.items);
    const place = placeOf(res.data.items, item.id);
    if (place) setAnnouncement(copy.announce.moved(itemHeading(item.kind, item.content).title, place.place, place.of));
  }

  if (load.state === 'loading') return <p className="muted">{copy.loading}</p>;
  if (load.state === 'error') {
    return (
      <>
        <PageHeader title={appCopy.routes.profile} description={copy.intro} />
        <ErrorState
          message={apiErrorMessage(load.error, appCopy.states)}
          action={
            load.error.kind === 'not_configured' ? null : (
              <Button variant="secondary" size="small" onClick={() => void fetchProfile()}>
                {appCopy.states.retry}
              </Button>
            )
          }
        />
      </>
    );
  }

  const form = (kind: ItemKind) => {
    if (!editing || editing.kind !== kind) return null;
    const isNew = editing.id === null;
    const k = copy.kinds[kind];
    return (
      <ItemForm
        key={editing.key}
        kind={kind}
        formId={`form-${kind}-${editing.id ?? 'nuevo'}`}
        title={isNew ? k.newTitle : k.editTitle}
        submitLabel={isNew ? copy.actions.saveNew : copy.actions.save}
        initial={editing.draft}
        copy={copy}
        onSubmit={(result) => void save(editing, result)}
        onCancel={closeForm}
      />
    );
  };

  return (
    <div className={s.editor}>
      <PageHeader title={appCopy.routes.profile} description={copy.intro} />
      {items.length === 0 ? (
        <EmptyState title={copy.empty.title}>
          {copy.empty.body}
          <ul className={s.points}>
            {copy.empty.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </EmptyState>
      ) : null}
      <HeaderForm profile={profile} nameHint={nameHint} uiLocale={contentLocale} copy={copy} appCopy={appCopy} onSaved={setProfile} />
      <section className={s.panel} aria-labelledby="perfil-trayectoria">
        <h2 id="perfil-trayectoria">{copy.itemsTitle}</h2>
        <p>{copy.itemsIntro}</p>
        <nav aria-label={copy.contents}>
          <ul className={s.toc}>
            {ITEM_KIND_ORDER.map((kind) => (
              <li key={kind}>
                <a href={`#${sectionId(kind)}`}>{appCopy.itemKinds[kind]}</a> <span className={s.count}>({itemsOfKind(items, kind).length})</span>
              </li>
            ))}
          </ul>
        </nav>
      </section>
      {ITEM_KIND_ORDER.map((kind) => (
        <KindSection
          key={kind}
          kind={kind}
          title={appCopy.itemKinds[kind]}
          items={itemsOfKind(items, kind)}
          copy={copy}
          editingId={editing?.kind === kind ? editing.id : null}
          adding={editing?.kind === kind && editing.id === null}
          reordering={reordering}
          form={form(kind)}
          onAdd={() => openNew(kind)}
          onEdit={openEdit}
          onMove={(item, delta) => void move(item, delta)}
          onDelete={setToDelete}
        />
      ))}
      <section className={s.panel} aria-labelledby="perfil-importar">
        <h2 id="perfil-importar">
          {copy.importSeam.title} <Badge>{copy.importSeam.badge}</Badge>
        </h2>
        <p>{copy.importSeam.body}</p>
        <p>{copy.importSeam.never}</p>
      </section>
      <p className="visually-hidden" role="status" aria-live="polite" data-testid="profile-announce">
        {announcement}
      </p>
      <ConfirmDialog
        id="confirmar-eliminar"
        open={toDelete !== null}
        title={copy.actions.confirmTitle}
        confirmLabel={copy.actions.confirm}
        cancelLabel={copy.actions.cancel}
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      >
        {toDelete ? (
          <p>
            <strong>{itemHeading(toDelete.kind, toDelete.content).title}</strong> — {copy.actions.confirmBody}
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
