/**
 * Pure list operations behind the editor's optimistic UI: every change is applied to a copy first (shown at once),
 * then sent; when the API refuses it, the snapshot taken before the change is put back. No React here, so
 * test/profile-state.test.ts covers the rules directly.
 *
 * Positions: the API orders a person's items by `position` across every kind. The editor shows them grouped by kind,
 * in `ITEM_KIND_ORDER`, and a move only swaps neighbours of the same kind; `globalOrder` is then sent to
 * `POST /profile/items/reorder`, which stores positions 0..n-1 in that order (one transaction).
 */
import type { ItemDto, ItemKind } from '../../lib/client/types.ts';
import { ITEM_KIND_ORDER } from './fields.ts';

/** An item as the editor holds it: `pending` while its create/update/delete is in flight. */
export type EditorItem = ItemDto & { pending?: boolean };

const TEMP_PREFIX = 'tmp-';
export const isTempId = (id: string) => id.startsWith(TEMP_PREFIX);
export const tempId = (n: number) => `${TEMP_PREFIX}${n}`;

/** Items of one kind, in display order (position, then creation time, then id: stable). */
export function itemsOfKind(items: readonly EditorItem[], kind: ItemKind): EditorItem[] {
  return items
    .filter((i) => i.kind === kind)
    .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** Every item id grouped by kind (ITEM_KIND_ORDER), each group in display order: the order sent to reorder. */
export function globalOrder(items: readonly EditorItem[]): string[] {
  return ITEM_KIND_ORDER.flatMap((kind) => itemsOfKind(items, kind).map((i) => i.id));
}

/** The position a new item takes so it lands last in its kind (and last overall). */
export function nextPosition(items: readonly EditorItem[]): number {
  return items.reduce((max, i) => Math.max(max, i.position + 1), 0);
}

/**
 * Moves `id` one place up (-1) or down (+1) among the items of its kind. Returns the new list with positions 0..n-1 in
 * global order, or null when the move is not possible (first item up, last item down, unknown id).
 */
export function moveWithinKind(items: readonly EditorItem[], id: string, delta: -1 | 1): EditorItem[] | null {
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  const group = itemsOfKind(items, item.kind);
  const from = group.findIndex((i) => i.id === id);
  const to = from + delta;
  if (to < 0 || to >= group.length) return null;
  const swapped = [...group];
  [swapped[from], swapped[to]] = [swapped[to]!, swapped[from]!];
  const byKind = new Map<ItemKind, EditorItem[]>(ITEM_KIND_ORDER.map((k) => [k, k === item.kind ? swapped : itemsOfKind(items, k)]));
  let position = 0;
  const out: EditorItem[] = [];
  for (const kind of ITEM_KIND_ORDER) for (const i of byKind.get(kind) ?? []) out.push({ ...i, position: position++ });
  return out;
}

/** 1-based place of `id` within its kind, and the size of the kind (for «movido a la posición 2 de 3»). */
export function placeOf(items: readonly EditorItem[], id: string): { place: number; of: number } | null {
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  const group = itemsOfKind(items, item.kind);
  return { place: group.findIndex((i) => i.id === id) + 1, of: group.length };
}

export function replaceItem(items: readonly EditorItem[], id: string, next: EditorItem): EditorItem[] {
  return items.map((i) => (i.id === id ? next : i));
}

export function removeItem(items: readonly EditorItem[], id: string): EditorItem[] {
  return items.filter((i) => i.id !== id);
}
