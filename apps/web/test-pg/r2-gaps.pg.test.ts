/**
 * Paths the 2026-11-21 audit found without a test, over a REAL Postgres as `cv_app`: the owner's own document delete,
 * withdrawing a published document through a status PATCH, and the OCR route's job ceiling (checked against the
 * database before any page is read; nothing stored). Every test crosses owners A and B.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { DbHandle } from '../src/server/db/client.ts';
import { handleApi, type ApiDeps } from '../src/server/api/handler.ts';
import { createRepository, type Repository } from '../src/server/db/repository.ts';
import { RateLimiter } from '../src/server/ingest/rate-limit.ts';
import type { OcrMediaType, OcrResult, TlacuiloOcrPort } from '../src/server/tlacuilo/client.ts';
import { bearer, startTestIssuer, type TestIssuer } from '../test-support/janua-tokens.ts';
import { A, B, appDb, resetAndMigrate } from './harness.ts';

let issuer: TestIssuer;
let h: DbHandle;
let repo: Repository;
let rowsRead = 0;

before(async () => {
  await resetAndMigrate();
  issuer = await startTestIssuer();
  h = appDb();
  repo = createRepository(h.db);
});
after(async () => {
  assert.ok(rowsRead > 0, `read ${rowsRead} rows`);
  await issuer.close();
  await h.sql.end();
});

async function call(method: string, path: string, opts: { sub?: string; body?: BodyInit; type?: string; extra?: Partial<ApiDeps> } = {}) {
  const headers: Record<string, string> = opts.sub ? bearer(await issuer.token({ sub: opts.sub })) : {};
  if (opts.type) headers['Content-Type'] = opts.type;
  const req = new Request(`http://0.0.0.0:3000${path}`, { method, headers, body: opts.body });
  const res = await handleApi(req, path.slice('/api/v1/'.length).split('/'), { env: issuer.env, getDb: () => h, ...opts.extra });
  const text = await res.text();
  // Test-only: the assertions walk nested JSON response bodies.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: text ? (JSON.parse(text) as Record<string, any>) : null };
}
const json = (value: unknown) => JSON.stringify(value);

async function newDocument(owner: string, title: string) {
  const item = await repo.createItem(owner, { kind: 'skill', position: 0, content: { name: `Habilidad ${title}` }, tags: [] });
  const doc = await repo.createArtifact(owner, { jobId: null, kind: 'cv', title, locale: 'es-MX', template: 'base', content: { items: [{ itemId: item.id }], blocks: [], showContact: false } });
  assert.ok(doc);
  return doc;
}

test('the owner deletes their own document: 204, gone for them, untouched for B; B deleting it is a 404', async () => {
  const mine = await newDocument(A, 'Para borrar');
  const theirs = await newDocument(B, 'De B');
  assert.equal((await call('DELETE', `/api/v1/artifacts/${mine.id}`, { sub: B })).status, 404, 'B cannot delete A\'s');
  assert.equal((await call('DELETE', `/api/v1/artifacts/${mine.id}`, { sub: A })).status, 204);
  assert.equal((await call('GET', `/api/v1/artifacts/${mine.id}`, { sub: A })).status, 404);
  assert.equal((await call('DELETE', `/api/v1/artifacts/${mine.id}`, { sub: A })).status, 404, 'a second delete finds nothing');
  const left = await repo.listArtifacts(B);
  rowsRead += left.length;
  assert.ok(left.some((a) => a.id === theirs.id), 'B\'s document is untouched');
});

test('a status PATCH withdraws a published document: its address stops answering, the publication time is kept', async () => {
  const doc = await newDocument(A, 'Publicado y retirado');
  const slug = `retirar-${Date.now().toString(36)}`;
  const published = await call('POST', `/api/v1/artifacts/${doc.id}/publish`, { sub: A, body: json({ visibility: 'public', slug }) });
  assert.equal(published.status, 200, json(published.body));
  assert.equal((await call('GET', `/api/v1/public/a/${slug}`)).status, 200);
  assert.equal((await call('PATCH', `/api/v1/artifacts/${doc.id}`, { sub: B, body: json({ status: 'ready' }) })).status, 404, 'B cannot withdraw it');
  assert.equal((await call('GET', `/api/v1/public/a/${slug}`)).status, 200, 'still public after B tried');
  const patched = await call('PATCH', `/api/v1/artifacts/${doc.id}`, { sub: A, body: json({ status: 'ready' }) });
  assert.equal(patched.status, 200, json(patched.body));
  assert.equal((await call('GET', `/api/v1/public/a/${slug}`)).status, 404, 'the public address stops answering at once');
  const row = await repo.getArtifact(A, doc.id);
  rowsRead += row ? 1 : 0;
  assert.equal(row?.status, 'ready');
  assert.equal(row?.visibility, 'private');
  assert.equal(row?.slug, null);
  assert.ok(row?.publishedAt, 'the last publication time is kept (the daily limit counts it)');
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

test('OCR route: the job ceiling is read from the database first, per owner; a page is read for B; nothing is stored', async () => {
  const pages: OcrMediaType[] = [];
  const client: TlacuiloOcrPort = {
    readPage: async (_bytes, mediaType): Promise<OcrResult> => {
      pages.push(mediaType);
      return { ok: true, page: { lines: ['Gerente de tienda', 'Ciudad de México'], confidence: 0.93, verdict: 'good', source: 'ocr', truncated: false } };
    },
  };
  const extra: Partial<ApiDeps> = { quotas: { jobs: 1 }, ocr: { client, limiter: new RateLimiter([{ max: 50, ms: 60_000 }]), log: () => undefined } };
  await repo.createJob(A, { title: 'Vacante que llena el cupo', company: 'Ejemplo SA', location: '', sourceUrl: '', sourceText: 'texto', status: 'saved', notes: '' });
  const jobsBefore = { a: (await repo.listJobs(A)).length, b: (await repo.listJobs(B)).length };
  rowsRead += jobsBefore.a + jobsBefore.b;

  assert.equal((await call('POST', '/api/v1/jobs/intake/ocr', { body: PNG, type: 'image/png', extra })).status, 401, 'no token');
  const status = await call('GET', '/api/v1/jobs/intake/ocr', { sub: B, extra });
  assert.equal(status.status, 200);
  assert.equal(status.body?.enabled, true);

  const full = await call('POST', '/api/v1/jobs/intake/ocr', { sub: A, body: PNG, type: 'image/png', extra });
  assert.equal(full.status, 429, json(full.body));
  assert.equal(full.body?.error, 'quota_exceeded');
  assert.equal(full.body?.resource, 'jobs');
  assert.deepEqual(pages, [], 'A at the ceiling: no page was read');

  const read = await call('POST', '/api/v1/jobs/intake/ocr', { sub: B, body: PNG, type: 'image/png', extra });
  assert.equal(read.status, 200, json(read.body));
  assert.deepEqual(read.body?.page.lines, ['Gerente de tienda', 'Ciudad de México']);
  assert.deepEqual(pages, ['image/png']);

  const jobsAfter = { a: (await repo.listJobs(A)).length, b: (await repo.listJobs(B)).length };
  assert.deepEqual(jobsAfter, jobsBefore, 'reading a page stores nothing');
});
