'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { ItemKind } from '@/lib/client/types';
import type { ProfileCopy } from '@/lib/copy/profile';
import { itemHeading, itemPeriod } from './fields';
import type { EditorItem } from './items-state';
import s from './profile.module.css';

export const sectionId = (kind: ItemKind) => `seccion-${kind}`;
export const controlId = (itemId: string, control: 'edit' | 'up' | 'down' | 'delete') => `item-${itemId}-${control}`;
export const addId = (kind: ItemKind) => `agregar-${kind}`;

/**
 * One item kind: its items in order, each with «Editar», «Subir», «Bajar» and «Eliminar» (real buttons, so the whole
 * list works from the keyboard; no drag and drop), and «Agregar …». The form of the item being edited takes its row's
 * place; a new item's form opens under the list. Every control's accessible name says which item it acts on.
 */
export function KindSection({
  kind,
  title,
  items,
  copy,
  editingId,
  adding,
  reordering,
  form,
  onAdd,
  onEdit,
  onMove,
  onDelete,
}: {
  kind: ItemKind;
  title: string;
  items: EditorItem[];
  copy: ProfileCopy;
  /** The id of the item whose form is open in this section, if any. */
  editingId: string | null;
  adding: boolean;
  reordering: boolean;
  form: ReactNode;
  onAdd: () => void;
  onEdit: (item: EditorItem) => void;
  onMove: (item: EditorItem, delta: -1 | 1) => void;
  onDelete: (item: EditorItem) => void;
}) {
  const k = copy.kinds[kind];
  const a = copy.actions;
  return (
    <section className={s.section} id={sectionId(kind)} aria-labelledby={`${sectionId(kind)}-title`} data-testid={`section-${kind}`}>
      <div className={s.sectionHead}>
        <h3 id={`${sectionId(kind)}-title`}>{title}</h3>
        <span className={s.count}>{copy.countLabel(items.length)}</span>
      </div>
      <p className={s.sectionHint}>{k.hint}</p>
      {items.length === 0 && !adding ? <p className={s.hint}>{k.empty}</p> : null}
      {items.length > 0 ? (
        <ol className={s.list}>
          {items.map((item, index) => {
            if (item.id === editingId) return <li key={item.id}>{form}</li>;
            const { title: name, detail } = itemHeading(kind, item.content);
            const period = itemPeriod(item.content, a.present);
            const locked = item.pending === true;
            const upDisabled = locked || reordering || index === 0;
            const downDisabled = locked || reordering || index === items.length - 1;
            const named = (label: string) => (
              <>
                {label}
                <span className="visually-hidden"> «{name}»</span>
              </>
            );
            return (
              <li key={item.id} className={locked ? `${s.row} ${s.rowPending}` : s.row} data-testid="profile-item" aria-busy={locked || undefined}>
                <div>
                  <p className={s.rowTitle}>
                    {name}
                    {detail ? <span className={s.count}> · {detail}</span> : null}
                  </p>
                  {period ? <p className={s.rowMeta}>{period}</p> : null}
                  {locked ? <p className={s.rowMeta}>{a.pending}</p> : null}
                </div>
                {item.tags.length > 0 ? (
                  <ul className={s.chips} aria-label={copy.tags.label}>
                    {item.tags.map((t) => (
                      <li key={t} className={`${s.chip} ${s.chipStatic}`}>
                        {t}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className={s.rowActions}>
                  <Button id={controlId(item.id, 'edit')} variant="secondary" size="small" aria-disabled={locked || undefined} onClick={() => !locked && onEdit(item)}>
                    {named(a.edit)}
                  </Button>
                  <Button id={controlId(item.id, 'up')} variant="ghost" size="small" aria-disabled={upDisabled || undefined} onClick={() => !upDisabled && onMove(item, -1)}>
                    <Icon name="up" />
                    {named(a.up)}
                  </Button>
                  <Button id={controlId(item.id, 'down')} variant="ghost" size="small" aria-disabled={downDisabled || undefined} onClick={() => !downDisabled && onMove(item, 1)}>
                    <Icon name="down" />
                    {named(a.down)}
                  </Button>
                  <Button id={controlId(item.id, 'delete')} variant="danger" size="small" aria-disabled={locked || undefined} onClick={() => !locked && onDelete(item)}>
                    <Icon name="trash" />
                    {named(a.delete)}
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
      {adding ? form : (
        <div>
          <Button id={addId(kind)} variant="secondary" onClick={onAdd}>
            <Icon name="plus" />
            {k.add}
          </Button>
        </div>
      )}
    </section>
  );
}
