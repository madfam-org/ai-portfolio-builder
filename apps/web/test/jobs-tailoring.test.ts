/**
 * W3-3: the tailoring workspace's selection + overrides → `POST /api/v1/artifacts/batch` body. Every body it builds
 * must pass W2's own zod (`artifactSetBody` and `ARTIFACT_CONTENT` per kind); every limit it checks must be the zod
 * limit (the value at the limit passes both, one past it fails both); nothing it does writes to a profile item.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_KINDS,
  LIMITS,
  TAILOR_KINDS,
  addEntry,
  artifactTitle,
  buildArtifactSet,
  cleanOverride,
  initialSelection,
  itemLabel,
  itemOriginal,
  moveEntry,
  removeEntry,
  setOverride,
  versionsByKind,
  type SelectionEntry,
  type TailorInput,
} from '../src/components/jobs/tailoring.ts';
import { ARTIFACT_CONTENT, artifactSetBody } from '../src/server/api/validation.ts';
import { ARTIFACT_KINDS } from '../src/server/db/schema.ts';
import { ARTIFACT_SET_MAX } from '../src/server/db/repository.ts';
import { APP_COPY } from '../src/lib/copy/app.ts';

const JOB = '6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const I1 = '11111111-1111-4111-8111-111111111111';
const I2 = '22222222-2222-4222-8222-222222222222';
const I3 = '33333333-3333-4333-8333-333333333333';
const blank = { title: '', summary: '', highlights: '' };

function input(over: Partial<TailorInput> = {}): TailorInput {
  return {
    jobId: JOB,
    jobTitle: 'Desarrolladora backend',
    company: 'Ejemplo SA',
    kinds: DEFAULT_KINDS,
    template: 'base',
    locale: 'es-MX',
    selection: [
      { itemId: I2, override: { title: '  Backend en pagos ', summary: '', highlights: 'APIs en TypeScript\n\n  PostgreSQL  \n' } },
      { itemId: I1, override: { ...blank } },
    ],
    summary: '  Backend con foco en datos.  ',
    showContact: true,
    greeting: '',
    closing: '',
    kindLabels: APP_COPY.es.kinds,
    ...over,
  };
}

/** Deep-freezes a value so any mutation throws (strict mode). */
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) freeze(v);
    Object.freeze(value);
  }
  return value;
}

test('the workspace offers exactly W2\'s artifact kinds, and a full set fits one batch', () => {
  assert.deepEqual([...TAILOR_KINDS], [...ARTIFACT_KINDS]);
  assert.ok(TAILOR_KINDS.length <= ARTIFACT_SET_MAX);
  assert.deepEqual([...DEFAULT_KINDS], ['cv', 'portfolio', 'presentation']);
});

test('selection + overrides map to ONE batch body that passes artifactSetBody and ARTIFACT_CONTENT per kind', () => {
  const built = buildArtifactSet(freeze(input()));
  assert.ok(built.ok);
  const body = artifactSetBody.parse(built.body);
  assert.equal(body.jobId, JOB);
  assert.equal(body.template, 'base');
  assert.equal(body.locale, 'es-MX');
  assert.deepEqual(
    body.artifacts.map((a) => [a.kind, a.title]),
    [
      ['cv', 'CV · Desarrolladora backend · Ejemplo SA'],
      ['portfolio', 'Portafolio · Desarrolladora backend · Ejemplo SA'],
      ['presentation', 'Presentación · Desarrolladora backend · Ejemplo SA'],
    ],
  );
  for (const a of body.artifacts) {
    const content = ARTIFACT_CONTENT[a.kind].parse(a.content);
    // Same order and the same overrides in every document of the set.
    assert.deepEqual(content.items, [{ itemId: I2, override: { title: 'Backend en pagos', highlights: ['APIs en TypeScript', 'PostgreSQL'] } }, { itemId: I1 }]);
    assert.equal(content.summary, 'Backend con foco en datos.');
    assert.equal(content.showContact, true);
    assert.deepEqual(content.blocks, []);
  }
  assert.deepEqual((body.artifacts[2]!.content as { slides: unknown[] }).slides, []);
});

test('the cover letter is opt-in and carries its greeting and closing; empty ones are omitted', () => {
  const built = buildArtifactSet(input({ kinds: ['cover_letter', 'cv'], greeting: 'Estimado equipo:', closing: '' }));
  assert.ok(built.ok);
  const body = artifactSetBody.parse(built.body);
  assert.deepEqual(
    body.artifacts.map((a) => a.kind),
    ['cv', 'cover_letter'],
  );
  const letter = ARTIFACT_CONTENT.cover_letter.parse(body.artifacts[1]!.content) as { greeting?: string; closing?: string };
  assert.equal(letter.greeting, 'Estimado equipo:');
  assert.equal('closing' in letter, false);
  const noSummary = buildArtifactSet(input({ summary: '   ' }));
  assert.ok(noSummary.ok && !('summary' in (noSummary.body.artifacts[0]!.content as object)));
});

test('nothing is sent without a kind or an item; every broken limit is reported, never trimmed silently', () => {
  const none = buildArtifactSet(input({ kinds: [], selection: [] }));
  assert.equal(none.ok, false);
  assert.ok(!none.ok);
  assert.deepEqual(
    none.problems.map((p) => (p.scope === 'form' ? `${p.field}:${p.code}` : '')),
    ['kinds:required', 'items:required'],
  );

  const long: SelectionEntry[] = [
    { itemId: I1, override: { title: 'x'.repeat(LIMITS.overrideTitle + 1), summary: 'y'.repeat(LIMITS.overrideSummary + 1), highlights: '' } },
    { itemId: I2, override: { ...blank, highlights: Array.from({ length: LIMITS.highlightCount + 1 }, (_, i) => `punto ${i}`).join('\n') } },
    { itemId: I3, override: { ...blank, highlights: 'z'.repeat(LIMITS.highlightLength + 1) } },
  ];
  const r = buildArtifactSet(input({ selection: long, summary: 's'.repeat(LIMITS.summary + 1), kinds: ['cover_letter'], greeting: 'g'.repeat(LIMITS.greeting + 1), closing: 'c'.repeat(LIMITS.closing + 1) }));
  assert.ok(!r.ok);
  assert.deepEqual(
    r.problems.map((p) => (p.scope === 'form' ? `form:${p.field}:${p.code}` : `${p.itemId.slice(0, 1)}:${p.field}:${p.code}`)),
    ['form:summary:tooLong', 'form:greeting:tooLong', 'form:closing:tooLong', '1:title:tooLong', '1:summary:tooLong', '2:highlights:tooMany', '3:highlights:tooLong'],
  );
});

test('the limits ARE the zod limits: at the limit both accept, one past it zod rejects too', () => {
  const at: SelectionEntry[] = [
    {
      itemId: I1,
      override: {
        title: 'x'.repeat(LIMITS.overrideTitle),
        summary: 'y'.repeat(LIMITS.overrideSummary),
        highlights: Array.from({ length: LIMITS.highlightCount }, () => 'h'.repeat(LIMITS.highlightLength)).join('\n'),
      },
    },
  ];
  const ok = buildArtifactSet(input({ selection: at, summary: 's'.repeat(LIMITS.summary), kinds: TAILOR_KINDS, greeting: 'g'.repeat(LIMITS.greeting), closing: 'c'.repeat(LIMITS.closing) }));
  assert.ok(ok.ok);
  const body = artifactSetBody.parse(ok.body);
  for (const a of body.artifacts) assert.equal(ARTIFACT_CONTENT[a.kind].safeParse(a.content).success, true, a.kind);

  const past = (patch: Record<string, unknown>) => ARTIFACT_CONTENT.cover_letter.safeParse({ items: [{ itemId: I1, ...patch }] }).success;
  assert.equal(past({ override: { title: 'x'.repeat(LIMITS.overrideTitle + 1) } }), false);
  assert.equal(past({ override: { summary: 'y'.repeat(LIMITS.overrideSummary + 1) } }), false);
  assert.equal(past({ override: { highlights: Array.from({ length: LIMITS.highlightCount + 1 }, () => 'h') } }), false);
  assert.equal(past({ override: { highlights: ['h'.repeat(LIMITS.highlightLength + 1)] } }), false);
  assert.equal(ARTIFACT_CONTENT.cv.safeParse({ summary: 's'.repeat(LIMITS.summary + 1) }).success, false);
  assert.equal(ARTIFACT_CONTENT.cover_letter.safeParse({ greeting: 'g'.repeat(LIMITS.greeting + 1) }).success, false);
  assert.equal(ARTIFACT_CONTENT.cover_letter.safeParse({ closing: 'c'.repeat(LIMITS.closing + 1) }).success, false);
  assert.equal(artifactSetBody.safeParse({ artifacts: [{ kind: 'cv', title: 't'.repeat(LIMITS.artifactTitle + 1) }] }).success, false);
  assert.equal(artifactTitle('Carta de presentación', 'p'.repeat(400), 'Empresa').length, LIMITS.artifactTitle);
});

test('cleanOverride: trimmed, empty fields and blank lines dropped; nothing overridden → no override at all', () => {
  assert.equal(cleanOverride({ title: '  ', summary: '\n', highlights: '\n \n' }), undefined);
  assert.deepEqual(cleanOverride({ title: '', summary: ' Hice X. ', highlights: ' a \n\nb' }), { summary: 'Hice X.', highlights: ['a', 'b'] });
});

test('the pre-selection is the match: score above zero, in its rank order, only items still in the profile', () => {
  const match = { items: [{ itemId: I3, score: 7 }, { itemId: 'gone', score: 5 }, { itemId: I1, score: 1 }, { itemId: I2, score: 0 }] };
  assert.deepEqual(
    initialSelection(match, new Set([I1, I2, I3])).map((e) => e.itemId),
    [I3, I1],
  );
  assert.deepEqual(initialSelection(null, new Set([I1])), []);
});

test('add / remove / move / override return new arrays and never mutate what they were given', () => {
  const start = freeze<SelectionEntry[]>([
    { itemId: I1, override: { ...blank } },
    { itemId: I2, override: { ...blank } },
  ]);
  assert.deepEqual(addEntry(start, I3).map((e) => e.itemId), [I1, I2, I3]);
  assert.deepEqual(addEntry(start, I1).map((e) => e.itemId), [I1, I2]);
  assert.deepEqual(removeEntry(start, I1).map((e) => e.itemId), [I2]);
  assert.deepEqual(moveEntry(start, 1, -1).map((e) => e.itemId), [I2, I1]);
  assert.deepEqual(moveEntry(start, 0, -1).map((e) => e.itemId), [I1, I2]);
  assert.deepEqual(moveEntry(start, 1, 1).map((e) => e.itemId), [I1, I2]);
  const edited = setOverride(start, I2, { summary: 'Solo para este empleo' });
  assert.equal(edited[1]!.override.summary, 'Solo para este empleo');
  assert.equal(start[1]!.override.summary, '');
});

test('overrides never touch the profile: labels and originals read a frozen item, the body references it by id only', () => {
  const item = freeze({ id: I1, kind: 'experience' as const, content: { role: 'Backend', organization: 'Ejemplo', summary: 'Original', highlights: ['Uno'] }, tags: ['SQL'] });
  assert.equal(itemLabel(item, 'Experiencia'), 'Backend · Ejemplo');
  assert.deepEqual(itemOriginal(item), { summary: 'Original', highlights: ['Uno'] });
  const built = buildArtifactSet(input({ selection: [{ itemId: I1, override: { ...blank, summary: 'Reescrito para este empleo' } }] }));
  assert.ok(built.ok);
  const content = JSON.stringify(built.body);
  assert.ok(!content.includes('Original'), 'profile text is never copied into the artifact');
  assert.equal(item.content.summary, 'Original');
});

test('itemLabel per kind, with the kind name as the fallback', () => {
  const l = (kind: Parameters<typeof itemLabel>[0]['kind'], content: Record<string, unknown>) => itemLabel({ kind, content }, 'K');
  assert.equal(l('education', { institution: 'UNAM', degree: 'Ingeniería' }), 'Ingeniería · UNAM');
  assert.equal(l('skill', { name: 'PostgreSQL' }), 'PostgreSQL');
  assert.equal(l('language', { name: 'Inglés', level: 'C1' }), 'Inglés · C1');
  assert.equal(l('award', { title: 'Premio' }), 'Premio');
  assert.equal(l('link', { label: 'GitHub', url: 'https://example.test' }), 'GitHub');
  assert.equal(l('project', {}), 'K');
});

test('versionsByKind: several documents per kind, numbered oldest first', () => {
  const groups = versionsByKind([
    { id: 'b', kind: 'cv' as const, createdAt: '2026-10-22T10:00:00Z' },
    { id: 'c', kind: 'portfolio' as const, createdAt: '2026-10-22T09:00:00Z' },
    { id: 'a', kind: 'cv' as const, createdAt: '2026-10-22T08:00:00Z' },
  ]);
  assert.deepEqual(
    groups.map((g) => [g.kind, g.versions.map((v) => `${v.id}${v.version}`)]),
    [
      ['cv', ['a1', 'b2']],
      ['portfolio', ['c1']],
    ],
  );
});
