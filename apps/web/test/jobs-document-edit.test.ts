/**
 * Editing a document in place (components/jobs/document-edit.ts): stored content ⇄ draft, every result valid for
 * W2's own zod per kind, the parts the editor does not show kept as they were, a letter's defaults, and the limits.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contentFromDraft, draftChanged, draftFromContent } from '../src/components/jobs/document-edit.ts';
import { LIMITS } from '../src/components/jobs/tailoring.ts';
import { ARTIFACT_CONTENT } from '../src/server/api/validation.ts';

const I1 = '11111111-1111-4111-8111-111111111111';
const I2 = '22222222-2222-4222-8222-222222222222';
const I3 = '33333333-3333-4333-8333-333333333333';
const LETTER = { company: 'Clara', locale: 'en' as const };

test('stored content → draft → content round-trips, and an untouched draft is «no change»', () => {
  const stored = {
    summary: 'Resumen',
    items: [{ itemId: I1, override: { title: 'Título', highlights: ['a', 'b'] } }, { itemId: I2 }],
    blocks: [{ heading: 'Nota', body: 'Texto propio' }],
    showContact: true,
  };
  const draft = draftFromContent(stored);
  assert.deepEqual(draft.selection, [
    { itemId: I1, override: { title: 'Título', summary: '', highlights: 'a\nb' } },
    { itemId: I2, override: { title: '', summary: '', highlights: '' } },
  ]);
  assert.equal(draftChanged(stored, draft), false);
  const out = contentFromDraft('cv', stored, draft, LETTER);
  assert.ok(out.ok);
  assert.deepEqual(ARTIFACT_CONTENT.cv.parse(out.content), stored);
});

test('edits replace the selection, its text and the summary; blocks, slides, intro and contact are kept', () => {
  const stored = { items: [{ itemId: I1 }], blocks: [{ body: 'B' }], showContact: true, slides: [{ title: 'Mía', itemIds: [I1] }] };
  const draft = draftFromContent(stored);
  draft.selection = [{ itemId: I3, override: { title: '', summary: ' Solo aquí ', highlights: ' x \n\n y ' } }, ...draft.selection];
  draft.summary = '  Nuevo resumen ';
  const out = contentFromDraft('presentation', stored, draft, LETTER);
  assert.ok(out.ok);
  const parsed = ARTIFACT_CONTENT.presentation.parse(out.content) as Record<string, unknown>;
  assert.deepEqual(parsed.items, [{ itemId: I3, override: { summary: 'Solo aquí', highlights: ['x', 'y'] } }, { itemId: I1 }]);
  assert.equal(parsed.summary, 'Nuevo resumen');
  assert.deepEqual(parsed.blocks, [{ body: 'B' }]);
  assert.deepEqual(parsed.slides, [{ title: 'Mía', itemIds: [I1] }], 'hand-made slides untouched');
  assert.equal(parsed.showContact, true);
  const portfolio = contentFromDraft('portfolio', { items: [], blocks: [], showContact: false, intro: 'Hola' }, { selection: [], summary: '', greeting: '', closing: '' }, LETTER);
  assert.ok(portfolio.ok);
  assert.equal(ARTIFACT_CONTENT.portfolio.parse(portfolio.content).intro, 'Hola');
  assert.equal('summary' in portfolio.content, false, 'an emptied summary is removed (the profile summary applies)');
});

test('a cover letter keeps its lines, and an emptied greeting or closing gets the default shown as placeholder', () => {
  const stored = { items: [{ itemId: I1 }], blocks: [], showContact: false, greeting: 'Hola equipo:', closing: 'Saludos,' };
  const draft = draftFromContent(stored);
  assert.deepEqual([draft.greeting, draft.closing], ['Hola equipo:', 'Saludos,']);
  draft.closing = '   ';
  const out = contentFromDraft('cover_letter', stored, draft, LETTER);
  assert.ok(out.ok);
  const parsed = ARTIFACT_CONTENT.cover_letter.parse(out.content) as Record<string, unknown>;
  assert.deepEqual([parsed.greeting, parsed.closing], ['Hola equipo:', 'Sincerely,']);
  const cv = contentFromDraft('cv', stored, draft, LETTER);
  assert.ok(cv.ok && !('greeting' in cv.content) && !('closing' in cv.content), 'only a letter carries them');
});

test('limits: the tailoring ones, reported per field and per item; nothing is built when any is broken', () => {
  const stored = { items: [], blocks: [], showContact: false };
  const long = (n: number) => 'x'.repeat(n);
  const bad = contentFromDraft(
    'cover_letter',
    stored,
    {
      selection: [
        { itemId: I1, override: { title: long(LIMITS.overrideTitle + 1), summary: '', highlights: '' } },
        { itemId: I2, override: { title: '', summary: long(LIMITS.overrideSummary + 1), highlights: Array.from({ length: LIMITS.highlightCount + 1 }, () => 'h').join('\n') } },
        { itemId: I3, override: { title: '', summary: '', highlights: long(LIMITS.highlightLength + 1) } },
      ],
      summary: long(LIMITS.summary + 1),
      greeting: long(LIMITS.greeting + 1),
      closing: long(LIMITS.closing + 1),
    },
    LETTER,
  );
  assert.ok(!bad.ok);
  assert.deepEqual(
    bad.problems.map((p) => (p.scope === 'form' ? `form:${p.field}:${p.code}` : `${p.itemId.slice(0, 1)}:${p.field}:${p.code}`)),
    ['form:summary:tooLong', 'form:greeting:tooLong', 'form:closing:tooLong', '1:title:tooLong', '2:summary:tooLong', '2:highlights:tooMany', '3:highlights:tooLong'],
  );
  const atLimit = contentFromDraft('cover_letter', stored, { selection: [], summary: long(LIMITS.summary), greeting: long(LIMITS.greeting), closing: long(LIMITS.closing) }, LETTER);
  assert.ok(atLimit.ok && ARTIFACT_CONTENT.cover_letter.safeParse(atLimit.content).success);
});
