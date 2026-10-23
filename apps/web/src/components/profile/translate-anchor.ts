/**
 * W7 (B4): the profile editor's deep links for a missing translation, shared by the flag (preview, tailoring) and the
 * editor that opens the field in the other language: `/perfil#traducir-encabezado`, `/perfil#traducir-<item id>`.
 */
export const HEADER_ANCHOR = 'traducir-encabezado';

export function translateAnchor(itemId: string | null): string {
  return itemId ? `traducir-${itemId}` : HEADER_ANCHOR;
}

/** The item id (or 'header') a hash points at, or null. */
export function anchorTarget(hash: string): string | 'header' | null {
  const h = hash.replace(/^#/, '');
  if (h === HEADER_ANCHOR) return 'header';
  const m = /^traducir-([0-9a-f-]{36})$/.exec(h);
  return m ? m[1]! : null;
}
