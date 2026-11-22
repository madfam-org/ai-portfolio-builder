/**
 * A cover letter's own body (2026-11-21) over a REAL Postgres, as cv_app: stored in the letter's `content` (jsonb, no
 * migration), bounded and letter-only (zod, all or none in a batch), owner-scoped (another person's letter is the 404
 * and stays unchanged), and in the public JSON only for a cover letter, without the summaries it replaces.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { DbHandle } from '../src/server/db/client.ts';
import { handleApi } from '../src/server/api/handler.ts';
import { LETTER_BODY_MAX } from '../src/server/api/validation.ts';
import { bearer, startTestIssuer, type TestIssuer } from '../test-support/janua-tokens.ts';
import { A, B, appDb, resetAndMigrate } from './harness.ts';

let issuer: TestIssuer;
let h: DbHandle;
let rowsRead = 0;
let itemId = '';
let jobId = '';
let letterId = '';

const BODY = 'Primer párrafo de la carta.\n\nSegundo párrafo de la carta.';

async function api(method: string, path: string, opts: { sub?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = opts.sub ? bearer(await issuer.token({ sub: opts.sub, name: `Name ${opts.sub}` })) : {};
  const req = new Request(`http://0.0.0.0:3000${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const res = await handleApi(req, path.split('?')[0]!.slice('/api/v1/'.length).split('/'), { env: issuer.env, getDb: () => h });
  const text = await res.text();
  // Test-only: the assertions walk nested JSON response bodies.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: text ? (JSON.parse(text) as Record<string, any>) : null };
}

before(async () => {
  await resetAndMigrate();
  issuer = await startTestIssuer();
  h = appDb();
  assert.equal((await api('PUT', '/api/v1/profile', { sub: A, body: { headline: 'Asesora', summary: 'Resumen del perfil' } })).status, 200);
  assert.equal((await api('PUT', '/api/v1/profile', { sub: B, body: { headline: 'Otra persona', summary: 'Resumen de B' } })).status, 200);
  const item = await api('POST', '/api/v1/profile/items', { sub: A, body: { kind: 'experience', content: { role: 'Asesora de ventas', organization: 'Boutique Ficticia' } } });
  assert.equal(item.status, 201, JSON.stringify(item.body));
  itemId = item.body?.item.id as string;
  const job = await api('POST', '/api/v1/jobs', { sub: A, body: { title: 'Asesora', company: 'Joyería Ejemplo', sourceText: 'Buscamos asesora de ventas.' } });
  assert.equal(job.status, 201);
  jobId = job.body?.job.id as string;
});
after(async () => {
  assert.ok(rowsRead > 0, `read ${rowsRead} rows`);
  await issuer.close();
  await h.sql.end();
});

test('the body is stored in the letter only, bounded, plain text; a batch that puts one in another kind stores nothing', async () => {
  const letter = await api('POST', '/api/v1/artifacts', { sub: A, body: { jobId, kind: 'cover_letter', title: 'Carta · Joyería Ejemplo', content: { summary: 'Resumen del documento', items: [{ itemId }], greeting: 'Hola:', body: BODY, closing: 'Saludos,' } } });
  assert.equal(letter.status, 201, JSON.stringify(letter.body));
  letterId = letter.body?.artifact.id as string;
  const read = await api('GET', `/api/v1/artifacts/${letterId}`, { sub: A });
  rowsRead += 1;
  assert.equal(read.body?.artifact.content.body, BODY);

  assert.equal((await api('POST', '/api/v1/artifacts', { sub: A, body: { kind: 'cover_letter', title: 'Larga', content: { body: 'x'.repeat(LETTER_BODY_MAX + 1) } } })).status, 400, 'over the cap');
  assert.equal((await api('POST', '/api/v1/artifacts', { sub: A, body: { kind: 'cover_letter', title: 'Tope', content: { body: 'x'.repeat(LETTER_BODY_MAX) } } })).status, 201, 'at the cap');
  assert.equal((await api('POST', '/api/v1/artifacts', { sub: A, body: { kind: 'cover_letter', title: 'Objeto', content: { body: { html: '<b>no</b>' } } } })).status, 400, 'plain text only');
  for (const kind of ['cv', 'portfolio', 'presentation']) {
    assert.equal((await api('POST', '/api/v1/artifacts', { sub: A, body: { kind, title: kind, content: { body: 'Solo de cartas' } } })).status, 400, `${kind}: no body`);
  }
  const before = ((await api('GET', `/api/v1/artifacts?job_id=${jobId}`, { sub: A })).body?.artifacts as unknown[]).length;
  const batch = await api('POST', '/api/v1/artifacts/batch', {
    sub: A,
    body: { jobId, artifacts: [{ kind: 'cover_letter', title: 'Carta', content: { body: BODY } }, { kind: 'cv', title: 'CV', content: { body: BODY } }] },
  });
  assert.equal(batch.status, 400);
  const afterBatch = (await api('GET', `/api/v1/artifacts?job_id=${jobId}`, { sub: A })).body?.artifacts as unknown[];
  rowsRead += afterBatch.length;
  assert.equal(afterBatch.length, before, 'all or none: not even the letter was stored');
});

test('owner-scoped: B cannot read, change or remove A\'s body (404), and A\'s re-read is unchanged; A edits and removes it', async () => {
  assert.equal((await api('GET', `/api/v1/artifacts/${letterId}`, { sub: B })).status, 404);
  assert.equal((await api('PATCH', `/api/v1/artifacts/${letterId}`, { sub: B, body: { content: { items: [], body: 'Escrito por B' } } })).status, 404);
  assert.equal((await api('PATCH', `/api/v1/artifacts/${letterId}`, { sub: B, body: { content: { items: [] } } })).status, 404);
  const bList = (await api('GET', '/api/v1/artifacts', { sub: B })).body?.artifacts as { id: string }[];
  assert.equal(bList.some((a) => a.id === letterId), false);
  const reread = await api('GET', `/api/v1/artifacts/${letterId}`, { sub: A });
  rowsRead += 1;
  assert.equal(reread.body?.artifact.content.body, BODY, 'unchanged after B\'s attempts');

  const edited = await api('PATCH', `/api/v1/artifacts/${letterId}`, { sub: A, body: { content: { ...reread.body?.artifact.content, body: 'Otro cuerpo.' } } });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal(edited.body?.artifact.content.body, 'Otro cuerpo.');
  const { body: _removed, ...withoutBody } = edited.body?.artifact.content as Record<string, unknown>;
  const removed = await api('PATCH', `/api/v1/artifacts/${letterId}`, { sub: A, body: { content: withoutBody } });
  assert.equal(removed.status, 200);
  assert.equal('body' in (removed.body?.artifact.content as object), false);
  // Put it back for the public read below.
  assert.equal((await api('PATCH', `/api/v1/artifacts/${letterId}`, { sub: A, body: { content: { ...withoutBody, body: BODY } } })).status, 200);
});

test('public JSON: a letter carries its body and neither summary; a letter without one and other kinds carry no body', async () => {
  const link = await api('POST', `/api/v1/artifacts/${letterId}/publish`, { sub: A, body: { visibility: 'link' } });
  assert.equal(link.status, 200, JSON.stringify(link.body));
  const shared = await api('GET', `/api/v1/public/s/${link.body?.artifact.shareToken}`);
  assert.equal(shared.status, 200);
  rowsRead += 1;
  assert.equal(shared.body?.artifact.content.body, BODY);
  assert.equal('summary' in shared.body?.artifact.content, false, 'the document summary is not printed under a body');
  assert.equal(shared.body?.profile.summary, '', 'nor the profile summary');
  const json = JSON.stringify(shared.body);
  for (const notPrinted of ['Resumen del documento', 'Resumen del perfil', 'Carta · Joyería Ejemplo']) assert.equal(json.includes(notPrinted), false, notPrinted);

  const plain = await api('POST', '/api/v1/artifacts', { sub: A, body: { kind: 'cover_letter', title: 'Carta sin cuerpo', content: { items: [{ itemId }], greeting: 'Hola:', closing: 'Saludos,' } } });
  const cv = await api('POST', '/api/v1/artifacts', { sub: A, body: { kind: 'cv', title: 'CV', content: { items: [{ itemId }] } } });
  assert.equal(plain.status, 201);
  assert.equal(cv.status, 201);
  assert.equal((await api('POST', `/api/v1/artifacts/${plain.body?.artifact.id}/publish`, { sub: A, body: { visibility: 'public', slug: 'carta-sin-cuerpo' } })).status, 200);
  const cvLink = await api('POST', `/api/v1/artifacts/${cv.body?.artifact.id}/publish`, { sub: A, body: { visibility: 'link' } });
  assert.equal(cvLink.status, 200);
  for (const read of [await api('GET', '/api/v1/public/a/carta-sin-cuerpo'), await api('GET', `/api/v1/public/s/${cvLink.body?.artifact.shareToken}`)]) {
    assert.equal(read.status, 200);
    rowsRead += 1;
    assert.equal('body' in read.body?.artifact.content, false);
    assert.equal(read.body?.profile.summary, 'Resumen del perfil', 'without a body or a summary of its own, the profile summary prints, as before');
  }
});
