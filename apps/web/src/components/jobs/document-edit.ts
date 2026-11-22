/**
 * Editing a document in place (`/documentos/:id`, critique #7): its selection of profile items (which, in which order,
 * with which per-document text), its summary and, for a cover letter, its greeting and closing — the same choices
 * «Adaptar al empleo» makes when the document is created, now changeable afterwards without creating it again.
 *
 * Rules:
 * - Only what this editor shows is replaced; everything else in the stored content is kept as it is (text blocks, a
 *   presentation's own slides, `showContact`, a portfolio's `intro`), so editing never drops a part it does not show.
 * - The checks and limits are the tailoring ones (`tailoring.ts` LIMITS, `cleanOverride`), which mirror W2's zod; the
 *   unit test validates the result against `ARTIFACT_CONTENT` of each kind.
 * - A cover letter's empty greeting or closing gets the text shown as the field's placeholder (`letterDefaults`), the
 *   same rule as when it was created.
 * - Nothing here writes a profile item: per-document text lives only in the document.
 * - An entry (or a slide's item reference) whose profile item no longer exists cannot be shown, so it cannot be kept:
 *   given the ids of the person's current items (`known`), the draft leaves it out, the editor says so before saving
 *   (`missingItemIds`), the removal counts as an unsaved change, and the saved content no longer names it (the server
 *   refuses content that names an item that does not exist: 422 `unknown_item_ids`).
 * No React and no server import, so the unit tests run it directly.
 */
import type { ArtifactKind } from '../../lib/copy/app.ts';
import type { ContentLocale } from '../../lib/client/types.ts';
import { LIMITS, cleanOverride, letterDefaults, type OverrideDraft, type SelectionEntry } from './tailoring.ts';

/** What the editor holds: the selection with drafts of its per-document text, the summary, the letter's lines. */
export interface DocumentDraft {
  selection: SelectionEntry[];
  summary: string;
  greeting: string;
  closing: string;
}

export type DocumentEditProblem =
  | { scope: 'item'; itemId: string; field: keyof OverrideDraft; code: 'tooLong' | 'tooMany' }
  | { scope: 'form'; field: 'items' | 'summary' | 'greeting' | 'closing'; code: 'tooLong' | 'tooMany' };

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The ids of the person's current profile items: what a document may still name. */
export type KnownItems = ReadonlySet<string>;

const storedItemIds = (c: Record<string, unknown>): string[] =>
  (Array.isArray(c.items) ? c.items : []).map(rec).flatMap((i) => (typeof i.itemId === 'string' ? [i.itemId] : []));
const slideItemIds = (c: Record<string, unknown>): string[] =>
  (Array.isArray(c.slides) ? c.slides : []).map(rec).flatMap((sl) => (Array.isArray(sl.itemIds) ? sl.itemIds.filter((id): id is string => typeof id === 'string') : []));

/** The item ids the stored content names (its entries and a presentation's slides) that are no longer in the profile, once each. */
export function missingItemIds(raw: unknown, known: KnownItems): string[] {
  const c = rec(raw);
  return [...new Set([...storedItemIds(c), ...slideItemIds(c)])].filter((id) => !known.has(id));
}

/**
 * The stored content → the editor's draft (overrides as text, one highlight per line). With `known`, entries whose
 * item no longer exists are left out.
 */
export function draftFromContent(raw: unknown, known?: KnownItems): DocumentDraft {
  const c = rec(raw);
  const selection = (Array.isArray(c.items) ? c.items : [])
    .map(rec)
    .filter((i) => typeof i.itemId === 'string' && (!known || known.has(i.itemId)))
    .map((i) => {
      const o = rec(i.override);
      const highlights = Array.isArray(o.highlights) ? o.highlights.filter((h): h is string => typeof h === 'string') : [];
      return { itemId: i.itemId as string, override: { title: str(o.title), summary: str(o.summary), highlights: highlights.join('\n') } };
    });
  return { selection, summary: str(c.summary), greeting: str(c.greeting), closing: str(c.closing) };
}

/**
 * Whether saving would change what is stored (the save button and the «unsaved» note read it): the draft differs, or
 * (with `known`) the stored content names an item that no longer exists, which saving removes.
 */
export function draftChanged(raw: unknown, draft: DocumentDraft, known?: KnownItems): boolean {
  if (known && missingItemIds(raw, known).length > 0) return true;
  return JSON.stringify(draftFromContent(raw)) !== JSON.stringify(draft);
}

/**
 * The draft → the content to send, or the problems (in the order of the form). `company` and `locale` give a cover
 * letter's defaults. With `known`, entries and slide references to items that no longer exist are not sent.
 */
export function contentFromDraft(
  kind: ArtifactKind,
  raw: unknown,
  input: DocumentDraft,
  letter: { company: string; locale: ContentLocale },
  known?: KnownItems,
): { ok: true; content: Record<string, unknown> } | { ok: false; problems: DocumentEditProblem[] } {
  const draft = known ? { ...input, selection: input.selection.filter((e) => known.has(e.itemId)) } : input;
  const problems: DocumentEditProblem[] = [];
  if (draft.selection.length > LIMITS.items) problems.push({ scope: 'form', field: 'items', code: 'tooMany' });
  if (draft.summary.trim().length > LIMITS.summary) problems.push({ scope: 'form', field: 'summary', code: 'tooLong' });
  if (kind === 'cover_letter') {
    if (draft.greeting.trim().length > LIMITS.greeting) problems.push({ scope: 'form', field: 'greeting', code: 'tooLong' });
    if (draft.closing.trim().length > LIMITS.closing) problems.push({ scope: 'form', field: 'closing', code: 'tooLong' });
  }
  for (const e of draft.selection) {
    const o = cleanOverride(e.override);
    if (!o) continue;
    if ((o.title ?? '').length > LIMITS.overrideTitle) problems.push({ scope: 'item', itemId: e.itemId, field: 'title', code: 'tooLong' });
    if ((o.summary ?? '').length > LIMITS.overrideSummary) problems.push({ scope: 'item', itemId: e.itemId, field: 'summary', code: 'tooLong' });
    if ((o.highlights ?? []).length > LIMITS.highlightCount) problems.push({ scope: 'item', itemId: e.itemId, field: 'highlights', code: 'tooMany' });
    else if ((o.highlights ?? []).some((h) => h.length > LIMITS.highlightLength)) problems.push({ scope: 'item', itemId: e.itemId, field: 'highlights', code: 'tooLong' });
  }
  if (problems.length > 0) return { ok: false, problems };

  const { summary: _summary, greeting: _greeting, closing: _closing, items: _items, ...kept } = rec(raw);
  const items = draft.selection.map((e) => {
    const override = cleanOverride(e.override);
    return override ? { itemId: e.itemId, override } : { itemId: e.itemId };
  });
  const summary = draft.summary.trim();
  const content: Record<string, unknown> = {
    ...kept,
    ...(summary ? { summary } : {}),
    items,
    blocks: Array.isArray(kept.blocks) ? kept.blocks : [],
    showContact: kept.showContact === true,
  };
  // A presentation's own slides are kept as they are, except references to items that no longer exist.
  if (known && Array.isArray(kept.slides)) {
    content.slides = kept.slides.map((raw) => {
      const sl = rec(raw);
      return Array.isArray(sl.itemIds) ? { ...sl, itemIds: sl.itemIds.filter((id) => typeof id === 'string' && known.has(id)) } : raw;
    });
  }
  if (kind === 'cover_letter') {
    const fallback = letterDefaults(letter.company, letter.locale);
    content.greeting = draft.greeting.trim() || fallback.greeting;
    content.closing = draft.closing.trim() || fallback.closing;
  }
  return { ok: true, content };
}
