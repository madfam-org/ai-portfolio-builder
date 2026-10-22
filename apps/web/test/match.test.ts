import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchItems, normalise } from '../src/server/api/match.ts';

test('normalise: es + en, diacritics, stopwords, tech marks, plural fold', () => {
  assert.deepEqual(normalise('Gestión de Proyectos y diseño'), ['gestion', 'proyecto', 'diseño'.normalize('NFD').replace(/[̀-ͯ]/g, '')]);
  assert.deepEqual(normalise('Experience with Node.js, C++ and C#; the APIs.'), ['experience', 'node.js', 'c++', 'c#', 'apis']);
  assert.deepEqual(normalise('2024 a el de'), []);
});

test('matchItems ranks by tag (3) and term (1) overlap, deterministically, and lists missing terms', () => {
  const job = { title: 'Desarrolladora backend', sourceText: 'Buscamos experiencia en PostgreSQL y TypeScript. Deseable: Kubernetes.' };
  const items = [
    { id: 'b', kind: 'skill', position: 1, content: { name: 'Fotografía' }, tags: ['arte'] },
    { id: 'a', kind: 'experience', position: 0, content: { role: 'Backend developer', organization: 'X', highlights: ['APIs en TypeScript'] }, tags: ['PostgreSQL'] },
    { id: 'c', kind: 'skill', position: 2, content: { name: 'Kubernetes' }, tags: [] },
  ];
  const r = matchItems(job, items);
  assert.equal(r.algorithm, 'keyword-overlap-v1');
  assert.deepEqual(
    r.items.map((i) => [i.itemId, i.score]),
    [
      ['a', 5],
      ['c', 1],
      ['b', 0],
    ],
  );
  assert.deepEqual(r.items[0]?.matchedTags, ['PostgreSQL']);
  assert.deepEqual(r.items[0]?.matchedTerms, ['backend', 'typescript']);
  assert.ok(r.missingTerms.includes('buscamo') || r.missingTerms.includes('buscamos'));
  assert.ok(!r.missingTerms.includes('postgresql'));
  assert.deepEqual(matchItems(job, items), r, 'same input, same output');
});
