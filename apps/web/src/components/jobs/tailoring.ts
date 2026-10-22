/**
 * The tailoring workspace as pure data (W3-3): which profile items go into this job's documents, in which order, with
 * which per-job text overrides, mapped onto ONE `POST /api/v1/artifacts/batch` body (all drafts or none).
 *
 * Rules:
 * - Overrides live only in the artifact's `content.items[].override` (W2 `ARTIFACT_CONTENT`). Nothing here writes a
 *   profile item: the core profile never changes because of one job (a unit and an e2e test re-read it).
 * - The pre-selection is the API's keyword match (`keyword-overlap-v1`): items that scored above zero, in its rank
 *   order. No score is invented here; the person adds, removes and reorders.
 * - The limits mirror W2's zod (`server/api/validation.ts`); the unit test validates the output against it.
 * No React and no server import (relative `.ts` imports only), so the unit tests run it directly.
 */
import type { ArtifactKind, ItemKind } from '../../lib/copy/app.ts';
import type { ArtifactSetInput, ContentLocale } from '../../lib/client/types.ts';

/** Every artifact kind, in the order the workspace offers them. */
export const TAILOR_KINDS: readonly ArtifactKind[] = ['cv', 'portfolio', 'presentation', 'cover_letter'];
/** Checked by default: the three documents of the core journey; the cover letter is opt-in. */
export const DEFAULT_KINDS: readonly ArtifactKind[] = ['cv', 'portfolio', 'presentation'];
/** W3 ships one honest template per kind (lane X §2.3); W3-4's renderer registry adds more later. */
export const TEMPLATES = ['base'] as const;

export const LIMITS = {
  artifactTitle: 200,
  summary: 5_000,
  greeting: 200,
  closing: 500,
  overrideTitle: 300,
  overrideSummary: 3_000,
  highlightCount: 30,
  highlightLength: 500,
  items: 200,
} as const;

export interface OverrideDraft {
  title: string;
  summary: string;
  /** One highlight per line. */
  highlights: string;
}

export interface SelectionEntry {
  itemId: string;
  override: OverrideDraft;
}

export const EMPTY_OVERRIDE: OverrideDraft = { title: '', summary: '', highlights: '' };

/** Items that matched (score above zero) and still exist in the profile, in the match's rank order. */
export function initialSelection(match: { items: readonly { itemId: string; score: number }[] } | null, profileItemIds: ReadonlySet<string>): SelectionEntry[] {
  if (!match) return [];
  return match.items.filter((m) => m.score > 0 && profileItemIds.has(m.itemId)).map((m) => ({ itemId: m.itemId, override: { ...EMPTY_OVERRIDE } }));
}

export function addEntry(selection: readonly SelectionEntry[], itemId: string): SelectionEntry[] {
  if (selection.some((e) => e.itemId === itemId)) return [...selection];
  return [...selection, { itemId, override: { ...EMPTY_OVERRIDE } }];
}

export function removeEntry(selection: readonly SelectionEntry[], itemId: string): SelectionEntry[] {
  return selection.filter((e) => e.itemId !== itemId);
}

/** «Subir» (-1) / «Bajar» (+1); out of range is a no-op. */
export function moveEntry(selection: readonly SelectionEntry[], index: number, delta: -1 | 1): SelectionEntry[] {
  const target = index + delta;
  if (index < 0 || index >= selection.length || target < 0 || target >= selection.length) return [...selection];
  const next = [...selection];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved!);
  return next;
}

export function setOverride(selection: readonly SelectionEntry[], itemId: string, patch: Partial<OverrideDraft>): SelectionEntry[] {
  return selection.map((e) => (e.itemId === itemId ? { ...e, override: { ...e.override, ...patch } } : e));
}

export function highlightLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
}

/** The stored override: trimmed, empty fields dropped; undefined when nothing is overridden. */
export function cleanOverride(draft: OverrideDraft): { title?: string; summary?: string; highlights?: string[] } | undefined {
  const out: { title?: string; summary?: string; highlights?: string[] } = {};
  if (draft.title.trim() !== '') out.title = draft.title.trim();
  if (draft.summary.trim() !== '') out.summary = draft.summary.trim();
  const lines = highlightLines(draft.highlights);
  if (lines.length > 0) out.highlights = lines;
  return Object.keys(out).length > 0 ? out : undefined;
}

export type TailorProblem =
  | { scope: 'form'; field: 'kinds' | 'items' | 'summary' | 'greeting' | 'closing'; code: 'required' | 'tooLong' | 'tooMany' }
  | { scope: 'item'; itemId: string; field: 'title' | 'summary' | 'highlights'; code: 'tooLong' | 'tooMany' };

export interface TailorInput {
  jobId: string;
  jobTitle: string;
  company: string;
  kinds: readonly ArtifactKind[];
  template: string;
  locale: ContentLocale;
  selection: readonly SelectionEntry[];
  /** «Resumen para este empleo» (optional). */
  summary: string;
  showContact: boolean;
  /** Cover letter only. */
  greeting: string;
  closing: string;
  kindLabels: Readonly<Record<ArtifactKind, string>>;
}

/** «CV · Desarrolladora backend · Empresa», capped at the artifact title limit. */
export function artifactTitle(kindLabel: string, jobTitle: string, company: string): string {
  const parts = [kindLabel, jobTitle.trim(), company.trim()].filter((p) => p !== '');
  return parts.join(' · ').slice(0, LIMITS.artifactTitle).trim();
}

function checkInput(input: TailorInput): TailorProblem[] {
  const problems: TailorProblem[] = [];
  if (input.kinds.length === 0) problems.push({ scope: 'form', field: 'kinds', code: 'required' });
  if (input.selection.length === 0) problems.push({ scope: 'form', field: 'items', code: 'required' });
  if (input.selection.length > LIMITS.items) problems.push({ scope: 'form', field: 'items', code: 'tooMany' });
  if (input.summary.trim().length > LIMITS.summary) problems.push({ scope: 'form', field: 'summary', code: 'tooLong' });
  if (input.kinds.includes('cover_letter')) {
    if (input.greeting.trim().length > LIMITS.greeting) problems.push({ scope: 'form', field: 'greeting', code: 'tooLong' });
    if (input.closing.trim().length > LIMITS.closing) problems.push({ scope: 'form', field: 'closing', code: 'tooLong' });
  }
  for (const e of input.selection) {
    const o = e.override;
    if (o.title.trim().length > LIMITS.overrideTitle) problems.push({ scope: 'item', itemId: e.itemId, field: 'title', code: 'tooLong' });
    if (o.summary.trim().length > LIMITS.overrideSummary) problems.push({ scope: 'item', itemId: e.itemId, field: 'summary', code: 'tooLong' });
    const lines = highlightLines(o.highlights);
    if (lines.length > LIMITS.highlightCount) problems.push({ scope: 'item', itemId: e.itemId, field: 'highlights', code: 'tooMany' });
    else if (lines.some((l) => l.length > LIMITS.highlightLength)) problems.push({ scope: 'item', itemId: e.itemId, field: 'highlights', code: 'tooLong' });
  }
  return problems;
}

/**
 * The batch body: one draft per chosen kind, all with the same ordered selection and overrides, `jobId` set and
 * the chosen template and locale. Problems instead when a limit is broken (nothing is sent then).
 */
export function buildArtifactSet(input: TailorInput): { ok: true; body: ArtifactSetInput } | { ok: false; problems: TailorProblem[] } {
  const problems = checkInput(input);
  if (problems.length > 0) return { ok: false, problems };
  const items = input.selection.map((e) => {
    const override = cleanOverride(e.override);
    return override ? { itemId: e.itemId, override } : { itemId: e.itemId };
  });
  const summary = input.summary.trim();
  const base = { ...(summary ? { summary } : {}), items, blocks: [], showContact: input.showContact };
  const kinds = TAILOR_KINDS.filter((k) => input.kinds.includes(k));
  const artifacts = kinds.map((kind) => {
    let content: Record<string, unknown> = base;
    if (kind === 'presentation') content = { ...base, slides: [] };
    if (kind === 'cover_letter') {
      const greeting = input.greeting.trim();
      const closing = input.closing.trim();
      content = { ...base, ...(greeting ? { greeting } : {}), ...(closing ? { closing } : {}) };
    }
    return { kind, title: artifactTitle(input.kindLabels[kind], input.jobTitle, input.company), content };
  });
  return { ok: true, body: { jobId: input.jobId, locale: input.locale, template: input.template, artifacts } };
}

/** The strings an item contributes, by kind, for its label and for override placeholders. */
export function itemLabel(item: { kind: ItemKind; content: Record<string, unknown> }, fallback: string): string {
  const c = item.content;
  const s = (k: string) => (typeof c[k] === 'string' ? (c[k] as string).trim() : '');
  const join = (...parts: string[]) => parts.filter((p) => p !== '').join(' · ');
  let label = '';
  switch (item.kind) {
    case 'experience':
    case 'volunteering':
      label = join(s('role'), s('organization'));
      break;
    case 'education':
      label = join(s('degree') || s('field'), s('institution'));
      break;
    case 'achievement':
    case 'award':
    case 'publication':
      label = s('title');
      break;
    case 'language':
      label = join(s('name'), s('level'));
      break;
    case 'link':
      label = s('label');
      break;
    default:
      label = s('name');
  }
  return label || fallback;
}

/** The item's own summary and highlights (shown as placeholders: the override starts empty and falls back to them). */
export function itemOriginal(item: { content: Record<string, unknown> }): { summary: string; highlights: string[] } {
  const c = item.content;
  const summary = typeof c.summary === 'string' ? c.summary : '';
  const highlights = Array.isArray(c.highlights) ? c.highlights.filter((h): h is string => typeof h === 'string') : [];
  return { summary, highlights };
}

/** A job's existing documents by kind, oldest first, numbered as versions (several per kind are allowed). */
export function versionsByKind<A extends { kind: ArtifactKind; createdAt: string }>(artifacts: readonly A[]): { kind: ArtifactKind; versions: (A & { version: number })[] }[] {
  return TAILOR_KINDS.map((kind) => ({
    kind,
    versions: artifacts
      .filter((a) => a.kind === kind)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((a, i) => ({ ...a, version: i + 1 })),
  })).filter((g) => g.versions.length > 0);
}
