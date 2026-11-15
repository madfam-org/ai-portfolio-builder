import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchItems, normalise, surfaceForms } from '../src/server/api/match.ts';

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
  assert.ok(r.missingTerms.includes('experiencia'), 'a real gap is listed');
  assert.ok(!r.missingTerms.some((t) => /^buscamo/.test(t)), 'posting boilerplate is not a gap');
  assert.ok(!r.missingTerms.includes('postgresql'));
  assert.deepEqual(matchItems(job, items), r, 'same input, same output');
});

test('what is shown is the posting\'s own word, never the matcher\'s token; the score does not change', () => {
  const job = {
    title: 'Asesora de ventas senior',
    company: 'Boutique Ejemplo',
    location: 'Ciudad de México',
    sourceText: 'Boutique Ejemplo busca Asesora en Ciudad de México. Requisitos: Inglés intermedio, clienteling, comisiones y capacitación de producto. Ofrecemos sueldo base más comisiones.',
  };
  const items = [
    { id: 'a', kind: 'language', position: 0, content: { name: 'Ingles' }, tags: [] },
    { id: 'b', kind: 'skill', position: 1, content: { name: 'Clienteling' }, tags: ['clienteling'] },
  ];
  const r = matchItems(job, items);
  assert.deepEqual(r.items.map((i) => [i.itemId, i.score]), [['b', 3], ['a', 1]], 'scores are the same rule as before');
  assert.deepEqual(r.items[1]?.matchedTerms, ['inglés'], 'accent kept, as the posting writes it');
  for (const shown of ['comisiones', 'capacitación', 'producto']) assert.ok(r.missingTerms.includes(shown), shown);
  for (const token of ['comisione', 'capacitacion', 'ingle', 'ofrecemo']) assert.ok(!r.missingTerms.includes(token), `${token} is a token, not a word`);
  for (const filler of ['boutique', 'ejemplo', 'ciudad', 'méxico', 'mexico', 'busca', 'ofrecemos', 'requisitos', 'sueldo']) {
    assert.ok(!r.missingTerms.includes(filler), `${filler} is not about the work`);
  }
  assert.ok(r.missingTerms.length >= 3, `read ${r.missingTerms.length} gaps`);
  // Without a company or a place the same call still works (older callers), and only boilerplate is dropped.
  const bare = matchItems({ title: job.title, sourceText: job.sourceText }, items);
  assert.ok(bare.missingTerms.includes('boutique'));
  assert.deepEqual(bare.items.map((i) => i.score), r.items.map((i) => i.score));
  assert.equal(surfaceForms('Node.js y C++, APIs; Comisiones.').get('comisione'), 'comisiones');
  assert.equal(surfaceForms('Node.js y C++').get('node.js'), 'node.js');
});
