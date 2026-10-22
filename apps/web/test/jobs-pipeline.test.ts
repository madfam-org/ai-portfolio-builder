/** W3-3: the pipeline's pure rules, kept equal to W2's schema and zod (no drift between the form and the API). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PIPELINE, POSTING_MAX, checkJobForm, issuesToFields, jobBody, linkHost, pipelineColumns, type JobFormValues } from '../src/components/jobs/pipeline.ts';
import { jobCreateBody } from '../src/server/api/validation.ts';
import { JOB_STATUSES, SOURCE_TEXT_MAX } from '../src/server/db/schema.ts';
import { JOBS_COPY, fmt } from '../src/lib/copy/jobs.ts';

const form = (over: Partial<JobFormValues> = {}): JobFormValues => ({
  title: 'Analista de datos',
  company: '',
  location: '',
  sourceUrl: '',
  sourceText: 'Buscamos SQL y Python.',
  notes: '',
  ...over,
});

test('the pipeline is W2\'s JOB_STATUSES, and the posting cap is W2\'s SOURCE_TEXT_MAX', () => {
  assert.deepEqual([...PIPELINE], [...JOB_STATUSES]);
  assert.equal(POSTING_MAX, SOURCE_TEXT_MAX);
});

test('columns: one per status in order, newest change first; archived hidden behind the toggle but counted', () => {
  const jobs = [
    { id: '1', status: 'saved' as const, updatedAt: '2026-10-20T00:00:00Z' },
    { id: '2', status: 'saved' as const, updatedAt: '2026-10-22T00:00:00Z' },
    { id: '3', status: 'interview' as const, updatedAt: '2026-10-21T00:00:00Z' },
    { id: '4', status: 'archived' as const, updatedAt: '2026-10-21T00:00:00Z' },
  ];
  const hidden = pipelineColumns(jobs, false);
  assert.deepEqual(
    hidden.columns.map((c) => c.status),
    ['saved', 'applying', 'applied', 'interview', 'offer', 'rejected'],
  );
  assert.deepEqual(hidden.columns[0]!.jobs.map((j) => j.id), ['2', '1']);
  assert.equal(hidden.archivedCount, 1);
  const shown = pipelineColumns(jobs, true);
  assert.deepEqual(shown.columns.at(-1)!.jobs.map((j) => j.id), ['4']);
  // Read-proof: every job lands in exactly one column.
  assert.equal(shown.columns.reduce((n, c) => n + c.jobs.length, 0), jobs.length);
});

test('checkJobForm mirrors jobCreateBody: what it accepts the API accepts, what it rejects the API rejects', () => {
  const cases: [Partial<JobFormValues>, Record<string, string>][] = [
    [{}, {}],
    [{ title: '  ' }, { title: 'required' }],
    [{ sourceText: '' }, { sourceText: 'required' }],
    [{ sourceText: 'a'.repeat(POSTING_MAX) }, {}],
    [{ sourceText: 'a'.repeat(POSTING_MAX + 1) }, { sourceText: 'tooLong' }],
    [{ sourceUrl: 'javascript:alert(1)' }, { sourceUrl: 'url' }],
    [{ sourceUrl: 'ftp://example.test/x' }, { sourceUrl: 'url' }],
    [{ sourceUrl: 'https://www.linkedin.com/jobs/view/1' }, {}],
    [{ title: 't'.repeat(201) }, { title: 'tooLong' }],
    [{ notes: 'n'.repeat(5001) }, { notes: 'tooLong' }],
  ];
  for (const [over, expected] of cases) {
    const values = form(over);
    assert.deepEqual(checkJobForm(values), expected, JSON.stringify(over).slice(0, 80));
    assert.equal(jobCreateBody.safeParse(jobBody(values)).success, Object.keys(expected).length === 0, JSON.stringify(over).slice(0, 80));
  }
});

test('jobBody: trimmed, an empty link is null (optional, never fetched)', () => {
  assert.deepEqual(jobBody(form({ title: ' A ', sourceUrl: '  ' })), { title: 'A', company: '', location: '', sourceUrl: null, sourceText: 'Buscamos SQL y Python.', notes: '' });
});

test('issuesToFields maps the API\'s real zod issues onto the form fields', () => {
  const r = jobCreateBody.safeParse({ title: '', sourceText: 'x'.repeat(POSTING_MAX + 1), sourceUrl: 'nope' });
  assert.equal(r.success, false);
  const issues = r.error!.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  assert.deepEqual(issuesToFields(issues), { title: 'required', sourceText: 'tooLong', sourceUrl: 'url' });
  assert.deepEqual(issuesToFields(undefined), {});
  assert.deepEqual(issuesToFields([{ path: 'status', message: 'Invalid option' }]), {});
});

test('linkHost shows where a reference points (and nothing for a non-URL)', () => {
  assert.equal(linkHost('https://empleos.example.test/vacante/1?ref=x'), 'empleos.example.test');
  assert.equal(linkHost(null), null);
  assert.equal(linkHost('no es url'), null);
});

test('jobs copy: es and en carry the same keys, the match is never called AI, and the link copy says it is never visited', () => {
  const keys = (o: unknown, prefix = ''): string[] =>
    o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`])) : [];
  assert.deepEqual(keys(JOBS_COPY.en).sort(), keys(JOBS_COPY.es).sort());
  assert.match(JOBS_COPY.es.matchLabel, /sin IA/);
  assert.match(JOBS_COPY.en.matchLabel, /no AI/);
  assert.match(JOBS_COPY.es.intake.sourceUrlHint, /no lo visitamos/);
  assert.match(JOBS_COPY.es.tailor.aiHeading, /próximamente/);
  // No percentages: the match copy shows the API's counts only.
  for (const l of ['es', 'en'] as const) assert.ok(!/%/.test(JSON.stringify(JOBS_COPY[l].match)), l);
  assert.equal(fmt('{n} de {max}', { n: 3, max: '50,000' }), '3 de 50,000');
  assert.equal(fmt('{missing}', {}), '{missing}');
});
