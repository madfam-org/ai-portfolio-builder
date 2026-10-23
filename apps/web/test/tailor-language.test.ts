/**
 * W7 (B3): per-job es/en versions in the tailoring workspace: a version in a language other than the profile's says so
 * in its title (both versions read apart, within the title limit), and the languages a job's documents exist in.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIMITS, artifactTitle, buildArtifactSet, languagesOf } from '../src/components/jobs/tailoring.ts';
import { TAILOR_LANGUAGE_COPY } from '../src/lib/copy/tailor-language.ts';

const kindLabels = { cv: 'CV', portfolio: 'Portafolio', presentation: 'Presentación', cover_letter: 'Carta' } as const;

test('titles: unchanged without a tag; « (English)» appended within the limit with one', () => {
  assert.equal(artifactTitle('CV', 'Client Advisor', 'Maison Ejemplo'), 'CV · Client Advisor · Maison Ejemplo');
  assert.equal(artifactTitle('CV', 'Client Advisor', 'Maison Ejemplo', '(English)'), 'CV · Client Advisor · Maison Ejemplo (English)');
  const long = artifactTitle('CV', 'x'.repeat(400), 'Maison Ejemplo', '(English)');
  assert.equal(long.length <= LIMITS.artifactTitle, true);
  assert.match(long, / \(English\)$/);
});

test('the batch carries the language and the tagged titles', () => {
  const built = buildArtifactSet({
    jobId: '00000000-0000-4000-8000-000000000001',
    jobTitle: 'Client Advisor',
    company: 'Maison Ejemplo',
    kinds: ['cv', 'cover_letter'],
    template: 'base',
    templates: { cv: 'clasico' },
    locale: 'en',
    selection: [{ itemId: '00000000-0000-4000-8000-0000000000aa', override: { title: '', summary: '', highlights: '' } }],
    summary: '',
    showContact: false,
    greeting: '',
    closing: '',
    kindLabels,
    languageTag: TAILOR_LANGUAGE_COPY.es.titleTag.en,
  });
  assert.ok(built.ok);
  assert.equal(built.body.locale, 'en');
  assert.deepEqual(built.body.artifacts.map((a) => a.title), ['CV · Client Advisor · Maison Ejemplo (English)', 'Carta · Client Advisor · Maison Ejemplo (English)']);
  assert.equal(built.body.artifacts[0]!.template, 'clasico');
});

test('languagesOf: per language, the kinds that exist, in the workspace order', () => {
  const docs = [
    { kind: 'cover_letter', locale: 'es-MX' },
    { kind: 'cv', locale: 'es-MX' },
    { kind: 'cv', locale: 'es-MX' },
    { kind: 'cv', locale: 'en' },
  ] as const;
  assert.deepEqual(languagesOf(docs), [
    { locale: 'es-MX', kinds: ['cv', 'cover_letter'] },
    { locale: 'en', kinds: ['cv'] },
  ]);
  assert.deepEqual(languagesOf([]), []);
});
