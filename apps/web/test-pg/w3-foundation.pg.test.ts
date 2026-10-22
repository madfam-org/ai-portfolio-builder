/**
 * W3-1 additions over a REAL Postgres (as cv_app): «Subir/Bajar» reorder, the all-or-none artifact set, the publish
 * rate limit, and the pages-host gate. Every test crosses owners A and B and re-reads A's rows afterwards.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import postgres from 'postgres';
import type { DbHandle } from '../src/server/db/client.ts';
import { handleApi } from '../src/server/api/handler.ts';
import { ForeignItemsError, PUBLISH_DAILY_LIMIT, PublishLimitError, createRepository, sharedPageGate, type Repository } from '../src/server/db/repository.ts';
import { bearer, startTestIssuer, type TestIssuer } from '../test-support/janua-tokens.ts';
import { A, B, appDb, resetAndMigrate, testUrls } from './harness.ts';

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

async function api(method: string, path: string, sub: string, body?: unknown) {
  const req = new Request(`http://0.0.0.0:3000${path}`, { method, headers: bearer(await issuer.token({ sub })), body: body === undefined ? undefined : JSON.stringify(body) });
  const res = await handleApi(req, path.slice('/api/v1/'.length).split('/'), { env: issuer.env, getDb: () => h });
  const text = await res.text();
  // Test-only: the assertions walk nested JSON response bodies.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: text ? (JSON.parse(text) as Record<string, any>) : null };
}

const skill = (name: string, position: number) => ({ kind: 'skill', position, content: { name }, tags: [] as string[] });

test('reorder: positions 0..n-1 in one transaction; another person\'s id refuses the whole reorder', async () => {
  const [x, y, z] = [await repo.createItem(A, skill('x', 0)), await repo.createItem(A, skill('y', 1)), await repo.createItem(A, skill('z', 2))];
  const bItem = await repo.createItem(B, skill('b', 0));
  const res = await api('POST', '/api/v1/profile/items/reorder', A, { itemIds: [z.id, x.id, y.id] });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(
    res.body?.items.map((i: { id: string; position: number }) => [i.id, i.position]),
    [[z.id, 0], [x.id, 1], [y.id, 2]],
  );
  // B names A's ids (and A names B's): 422, and nothing moved on either side.
  assert.equal((await api('POST', '/api/v1/profile/items/reorder', B, { itemIds: [x.id, bItem.id] })).status, 422);
  await assert.rejects(repo.reorderItems(A, [y.id, bItem.id]), ForeignItemsError);
  const again = await repo.listItems(A);
  rowsRead += again.length;
  assert.deepEqual(again.map((i) => i.id), [z.id, x.id, y.id]);
  assert.equal((await repo.getItem(B, bItem.id))?.position, 0);
  assert.equal((await api('POST', '/api/v1/profile/items/reorder', A, { itemIds: [] })).status, 400);
});

test('artifact set: three tailored artifacts or none; foreign job or items are refused', async () => {
  const job = await repo.createJob(A, { title: 'Backend', company: 'X', location: '', sourceUrl: null, sourceText: 'PostgreSQL', status: 'saved', notes: '' });
  const item = await repo.createItem(A, skill('PostgreSQL', 0));
  const content = { items: [{ itemId: item.id, override: { summary: 'a la medida' } }] };
  const ok = await api('POST', '/api/v1/artifacts/batch', A, {
    jobId: job.id,
    artifacts: [
      { kind: 'cv', title: 'CV para X', content },
      { kind: 'portfolio', title: 'Portafolio para X', content },
      { kind: 'presentation', title: 'Presentación para X', content },
    ],
  });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.deepEqual(ok.body?.artifacts.map((a: { kind: string; status: string; jobId: string }) => [a.kind, a.status, a.jobId]), [
    ['cv', 'draft', job.id],
    ['portfolio', 'draft', job.id],
    ['presentation', 'draft', job.id],
  ]);
  assert.equal(ok.body?.artifacts[0].ownerSub, undefined);

  // B: A's job is a 404, A's items a 422; no row is created for anyone.
  assert.equal((await api('POST', '/api/v1/artifacts/batch', B, { jobId: job.id, artifacts: [{ kind: 'cv', title: 't' }] })).status, 404);
  assert.equal((await api('POST', '/api/v1/artifacts/batch', B, { artifacts: [{ kind: 'cv', title: 't', content }] })).status, 422);
  assert.equal((await repo.listArtifacts(B)).length, 0);

  // Fault on the THIRD insert (a kind the CHECK constraint refuses, past zod): the first two roll back.
  const before = (await repo.listArtifacts(A, { jobId: job.id })).length;
  await assert.rejects(
    repo.createArtifactSet(A, {
      jobId: job.id,
      locale: 'es-MX',
      template: 'base',
      artifacts: [
        { kind: 'cv', title: '1', content: { items: [], blocks: [], showContact: false } },
        { kind: 'portfolio', title: '2', content: { items: [], blocks: [], showContact: false } },
        { kind: 'bogus', title: '3', content: { items: [], blocks: [], showContact: false } },
      ],
    }),
  );
  const afterRows = await repo.listArtifacts(A, { jobId: job.id });
  rowsRead += afterRows.length;
  assert.equal(afterRows.length, before, 'all or none');
  assert.equal((await api('POST', '/api/v1/artifacts/batch', A, { artifacts: [] })).status, 400);
  assert.equal((await api('POST', '/api/v1/artifacts/batch', A, { artifacts: Array.from({ length: 5 }, () => ({ kind: 'cv', title: 'x' })) })).status, 400);
});

test('pages gate: only published, unsuspended, shared-that-way artifacts; indexing only by the owner\'s choice', async () => {
  const a = await repo.createArtifact(A, { jobId: null, kind: 'cv', title: 'Pública', locale: 'en', template: 'base', content: { items: [], blocks: [], showContact: false } });
  const draft = await repo.createArtifact(A, { jobId: null, kind: 'cv', title: 'Borrador', locale: 'es-MX', template: 'base', content: { items: [], blocks: [], showContact: false } });
  assert.ok(a && draft);
  assert.equal(await sharedPageGate(h.db, 'public', 'gate-a'), null);
  // B cannot publish A's artifact under any handle.
  assert.equal((await api('POST', `/api/v1/artifacts/${a.id}/publish`, B, { visibility: 'public', slug: 'gate-a' })).status, 404);
  assert.equal(await sharedPageGate(h.db, 'public', 'gate-a'), null);

  assert.equal((await api('POST', `/api/v1/artifacts/${a.id}/publish`, A, { visibility: 'public', slug: 'gate-a' })).status, 200);
  assert.deepEqual(await sharedPageGate(h.db, 'public', 'gate-a'), { indexable: false, locale: 'en' });
  assert.equal((await api('POST', `/api/v1/artifacts/${a.id}/publish`, A, { visibility: 'public', slug: 'gate-a', indexable: true })).status, 200);
  assert.deepEqual(await sharedPageGate(h.db, 'public', 'gate-a'), { indexable: true, locale: 'en' });
  assert.equal(await sharedPageGate(h.db, 'link', 'gate-a'), null, 'a public artifact is never reachable as a link');

  const link = await api('POST', `/api/v1/artifacts/${a.id}/publish`, A, { visibility: 'link' });
  const token = link.body?.artifact.shareToken as string;
  assert.deepEqual(await sharedPageGate(h.db, 'link', token), { indexable: false, locale: 'en' });
  assert.equal(await sharedPageGate(h.db, 'public', 'gate-a'), null, 'the old slug stops at once');

  // Suspension (operator SQL, as the owner role would run it) hides it at once.
  const owner = postgres(testUrls().owner, { max: 1, onnotice: () => undefined });
  try {
    await owner`update artifacts set suspended_at = now(), suspended_reason = 'test' where id = ${a.id}`;
    assert.equal(await sharedPageGate(h.db, 'link', token), null);
  } finally {
    await owner.end();
  }
  const rows = await repo.listArtifacts(A);
  rowsRead += rows.length;
  assert.equal(rows.find((r) => r.id === draft.id)?.status, 'draft');
});

test(`publish limit: at most ${PUBLISH_DAILY_LIMIT} artifacts published per owner per day; re-publishing one does not count; B is unaffected`, async () => {
  const OWNER = 'janua|owner-limit';
  const empty = { items: [], blocks: [], showContact: false };
  const ids: string[] = [];
  for (let i = 0; i < PUBLISH_DAILY_LIMIT + 1; i += 1) {
    const row = await repo.createArtifact(OWNER, { jobId: null, kind: 'cv', title: `n${i}`, locale: 'es-MX', template: 'base', content: empty });
    ids.push(row!.id);
  }
  for (const id of ids.slice(0, PUBLISH_DAILY_LIMIT)) assert.ok(await repo.publishArtifact(OWNER, id, { visibility: 'link' }));
  // Rotating a link («Cambiar enlace») re-publishes the same artifact: allowed.
  assert.ok(await repo.publishArtifact(OWNER, ids[0]!, { visibility: 'link' }));
  await assert.rejects(repo.publishArtifact(OWNER, ids[PUBLISH_DAILY_LIMIT]!, { visibility: 'link' }), PublishLimitError);
  const res = await api('POST', `/api/v1/artifacts/${ids[PUBLISH_DAILY_LIMIT]}/publish`, OWNER, { visibility: 'link' });
  assert.equal(res.status, 429);
  assert.deepEqual(res.body, { error: 'publish_limit' });
  const bRow = await repo.createArtifact(B, { jobId: null, kind: 'cv', title: 'b', locale: 'es-MX', template: 'base', content: empty });
  assert.ok(await repo.publishArtifact(B, bRow!.id, { visibility: 'link' }), 'the limit is per owner');
  const rows = await repo.listArtifacts(OWNER);
  rowsRead += rows.length;
  assert.equal(rows.filter((r) => r.status === 'published').length, PUBLISH_DAILY_LIMIT);
});
