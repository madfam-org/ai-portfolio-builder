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
  assert.equal(r.algorithm, 'keyword-overlap-v3');
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

test('v2: everyday filler, the place and a recommender\'s words never score; real work words still do', () => {
  const job = { title: 'Engineering Director', sourceText: 'This is a hybrid role. Set up the best teams; always ensure quality. Build systems on React.' };
  const items = [
    { id: 'rec', kind: 'recommendation', position: 0, content: { name: 'Persona Ejemplo', text: 'Always builds the best teams, ensures quality.', relationship: 'Was my mentor' }, tags: [] },
    { id: 'exp', kind: 'experience', position: 0, content: { role: 'Engineer', organization: 'X', location: 'Cuernavaca · Hybrid', highlights: ['Set up React systems and teams'] }, tags: [] },
  ];
  const r = matchItems(job, items);
  const rec = r.items.find((i) => i.itemId === 'rec')!;
  const exp = r.items.find((i) => i.itemId === 'exp')!;
  assert.equal(rec.score, 0, 'a recommendation is someone else\'s words');
  assert.deepEqual(exp.matchedTerms, ['react', 'systems', 'teams'], 'no «set», «up», «best» or the location\'s «hybrid»');
  for (const filler of ['up', 'set', 'best', 'always', 'cada', 'siempre']) assert.deepEqual(normalise(filler), [], filler);
});

test('v3: plurals of stopwords never score (the stopword list also applies to the folded form)', () => {
  for (const word of ['others', 'nuevos', 'nuevas', 'grandes', 'mismos', 'partes', 'formas', 'otras']) assert.deepEqual(normalise(word), [], word);
  // Real plurals still fold and still score.
  assert.deepEqual(normalise('clientes proyectos systems'), ['cliente', 'proyecto', 'system']);
  const job = { title: 'Ejecutiva comercial', sourceText: 'Buscamos nuevos talentos para atender clientes.' };
  const items = [
    { id: 'n', kind: 'experience', position: 0, content: { role: 'Vendedora', organization: 'X', highlights: ['Atraje nuevos clientes'] }, tags: [] },
    { id: 'o', kind: 'skill', position: 1, content: { name: 'Nuevos mercados' }, tags: [] },
  ];
  const r = matchItems(job, items);
  assert.deepEqual(r.items.find((i) => i.itemId === 'n')?.matchedTerms, ['clientes'], '«nuevos» is not a shared term (the posting\'s own word is shown)');
  assert.equal(r.items.find((i) => i.itemId === 'o')?.score, 0, 'an item sharing only «nuevos» is not relevant');
  assert.ok(!r.missingTerms.includes('nuevos'), 'nor a gap');
});

test('v3: the languages C and R and the acronym IT can match, as tags and as words', () => {
  assert.deepEqual(normalise('C'), ['c']);
  assert.deepEqual(normalise('R'), ['r']);
  assert.deepEqual(normalise('IT'), ['it']);
  const job = { title: 'Analista de datos', sourceText: 'Experiencia en C, R y Python. Soporte de IT.' };
  const items = [
    { id: 'c', kind: 'skill', position: 0, content: { name: 'C' }, tags: ['C'] },
    { id: 'r', kind: 'skill', position: 1, content: { name: 'R' }, tags: [] },
    { id: 'it', kind: 'experience', position: 2, content: { role: 'Técnico de IT', organization: 'X' }, tags: ['IT'] },
    { id: 'none', kind: 'skill', position: 3, content: { name: 'Excel' }, tags: [] },
  ];
  const r = matchItems(job, items);
  const by = (id: string) => r.items.find((i) => i.itemId === id)!;
  assert.deepEqual(by('c').matchedTags, ['C']);
  assert.equal(by('c').score, 3);
  assert.deepEqual(by('r').matchedTerms, ['r']);
  assert.deepEqual(by('it').matchedTags, ['IT']);
  assert.equal(by('none').score, 0);
});

test('v3: one-letter words, lowercase «it» and all-caps stopwords stay stopwords', () => {
  // The Spanish and English one-letter words, in either case, never become terms.
  for (const word of ['a', 'e', 'i', 'o', 'u', 'y', 'A', 'E', 'I', 'O', 'U', 'Y', 'c', 'r']) assert.deepEqual(normalise(word), [], word);
  assert.deepEqual(normalise('we built it'), ['built'], 'the English pronoun «it» is a stopword');
  // An all-caps heading: its stopwords («EN», «Y», «DE», «CON», «NUEVOS») never score; only the work words do.
  assert.deepEqual(normalise('REQUISITOS: EXPERIENCIA EN VENTAS Y MANEJO DE CLIENTES CON NUEVOS RETOS'), ['requisito', 'experiencia', 'venta', 'manejo', 'cliente', 'reto']);
  assert.deepEqual(normalise('ABOUT THE ROLE: WE WANT OTHERS'), ['role']);
  const job = { title: 'Asesora', sourceText: 'REQUISITOS: EXPERIENCIA EN VENTAS Y TRATO CON CLIENTES' };
  const items = [{ id: 'x', kind: 'experience', position: 0, content: { role: 'Asesora', organization: 'X', summary: 'Trabajé en una tienda y con un equipo de otros vendedores.' }, tags: [] }];
  const r = matchItems(job, items);
  assert.deepEqual(r.items[0]?.matchedTerms, ['asesora'], 'no «en», «y», «con», «otros» in common');
});
