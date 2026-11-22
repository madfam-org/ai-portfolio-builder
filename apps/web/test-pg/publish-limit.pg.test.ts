/**
 * The daily publish limit over a REAL Postgres (as cv_app): at most PUBLISH_DAILY_LIMIT different documents per owner
 * published within 24 hours, whatever their state now. Withdrawing one does not free its place; publishing again one
 * already counted adds nothing; concurrent publishes of one owner cannot pass the limit together (the count and the
 * update run in one transaction under a per-owner advisory lock); the 429's Retry-After is the time until the oldest
 * publication in the window is 24 hours old.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import postgres from 'postgres';
import { createDb, type DbHandle } from '../src/server/db/client.ts';
import { handleApi } from '../src/server/api/handler.ts';
import { PUBLISH_DAILY_LIMIT, PublishLimitError, createRepository, sharedPageGate, type Repository } from '../src/server/db/repository.ts';
import { bearer, startTestIssuer, type TestIssuer } from '../test-support/janua-tokens.ts';
import { B, appDb, resetAndMigrate, testUrls } from './harness.ts';

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
  return { status: res.status, headers: res.headers, body: text ? (JSON.parse(text) as Record<string, any>) : null };
}

const EMPTY = { items: [], blocks: [], showContact: false };

async function documents(owner: string, n: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const row = await repo.createArtifact(owner, { jobId: null, kind: 'cv', title: `d${i}`, locale: 'es-MX', template: 'base', content: EMPTY });
    ids.push(row!.id);
  }
  return ids;
}

test('withdrawing a document does not free its place: unpublish and a status change both keep its last publication', async () => {
  const OWNER = 'janua|limit-withdraw';
  const ids = await documents(OWNER, PUBLISH_DAILY_LIMIT + 1);
  for (const id of ids.slice(0, PUBLISH_DAILY_LIMIT)) assert.ok(await repo.publishArtifact(OWNER, id, { visibility: 'link' }));
  const linked = await repo.getArtifact(OWNER, ids[0]!);
  const unpublished = await repo.unpublishArtifact(OWNER, ids[0]!);
  const toReady = await repo.updateArtifact(OWNER, ids[1]!, { status: 'ready' });
  for (const row of [unpublished, toReady]) {
    assert.equal(row?.status, 'ready');
    assert.equal(row?.visibility, 'private');
    assert.equal(row?.shareToken, null);
    assert.ok(row?.publishedAt instanceof Date, 'the last publication is kept');
  }
  assert.equal(await sharedPageGate(h.db, 'link', linked!.shareToken!), null, 'a withdrawn document is not served');
  await assert.rejects(repo.publishArtifact(OWNER, ids[PUBLISH_DAILY_LIMIT]!, { visibility: 'link' }), PublishLimitError);
  const res = await api('POST', `/api/v1/artifacts/${ids[PUBLISH_DAILY_LIMIT]}/publish`, OWNER, { visibility: 'link' });
  assert.equal(res.status, 429);
  assert.deepEqual(res.body, { error: 'publish_limit' });
  const rows = await repo.listArtifacts(OWNER);
  rowsRead += rows.length;
  assert.equal(rows.filter((r) => r.status === 'published').length, PUBLISH_DAILY_LIMIT - 2);
  assert.equal(rows.find((r) => r.id === ids[PUBLISH_DAILY_LIMIT])?.status, 'draft', 'the refused one is unchanged');
});

test('publishing again a document already counted in the window is allowed, withdrawn or not; another owner is unaffected', async () => {
  const OWNER = 'janua|limit-again';
  const ids = await documents(OWNER, PUBLISH_DAILY_LIMIT + 1);
  for (const id of ids.slice(0, PUBLISH_DAILY_LIMIT)) assert.ok(await repo.publishArtifact(OWNER, id, { visibility: 'link' }));
  await repo.unpublishArtifact(OWNER, ids[0]!);
  const again = await repo.publishArtifact(OWNER, ids[0]!, { visibility: 'public', slug: 'limite-otra-vez', indexable: false });
  assert.equal(again?.status, 'published', 'a withdrawn document of the window is published again');
  assert.ok(await repo.publishArtifact(OWNER, ids[1]!, { visibility: 'link' }), 'a new link for a published one');
  await assert.rejects(repo.publishArtifact(OWNER, ids[PUBLISH_DAILY_LIMIT]!, { visibility: 'link' }), PublishLimitError, 'still no new place');
  const [bId] = await documents(B, 1);
  assert.ok(await repo.publishArtifact(B, bId!, { visibility: 'link' }), 'the limit is per owner');
  const rows = await repo.listArtifacts(OWNER);
  rowsRead += rows.length;
  assert.equal(rows.filter((r) => r.status === 'published').length, PUBLISH_DAILY_LIMIT);
});

test('concurrent publishes at one below the limit: exactly one succeeds', async () => {
  const OWNER = 'janua|limit-race';
  const RACERS = 5;
  const ids = await documents(OWNER, PUBLISH_DAILY_LIMIT - 1 + RACERS);
  for (const id of ids.slice(0, PUBLISH_DAILY_LIMIT - 1)) assert.ok(await repo.publishArtifact(OWNER, id, { visibility: 'link' }));
  // Its own pool, one connection per racer, so the publishes really run at the same time.
  const pool = createDb(testUrls().app, { max: RACERS });
  try {
    const racing = createRepository(pool.db);
    const results = await Promise.allSettled(ids.slice(PUBLISH_DAILY_LIMIT - 1).map((id) => racing.publishArtifact(OWNER, id, { visibility: 'link' })));
    const won = results.filter((r) => r.status === 'fulfilled');
    const refused = results.filter((r) => r.status === 'rejected' && r.reason instanceof PublishLimitError);
    assert.equal(won.length, 1, `succeeded: ${won.length}`);
    assert.equal(refused.length, RACERS - 1, `refused: ${refused.length}`);
  } finally {
    await pool.sql.end();
  }
  const rows = await repo.listArtifacts(OWNER);
  rowsRead += rows.length;
  assert.equal(rows.filter((r) => r.status === 'published').length, PUBLISH_DAILY_LIMIT);
});

test('Retry-After is the time until the oldest publication in the window is 24 hours old', async () => {
  const OWNER = 'janua|limit-retry';
  const ids = await documents(OWNER, PUBLISH_DAILY_LIMIT + 1);
  for (const id of ids.slice(0, PUBLISH_DAILY_LIMIT)) assert.ok(await repo.publishArtifact(OWNER, id, { visibility: 'link' }));
  // As the database owner: the oldest of the window was published 23 hours ago (and since withdrawn), one 25 hours
  // ago (out of the window: its place is free again).
  const owner = postgres(testUrls().owner, { max: 1 });
  try {
    await owner`update artifacts set published_at = now() - interval '23 hours' where id = ${ids[0]!}`;
    await owner`update artifacts set published_at = now() - interval '25 hours' where id = ${ids[1]!}`;
  } finally {
    await owner.end();
  }
  await repo.unpublishArtifact(OWNER, ids[0]!);
  const [extra] = await documents(OWNER, 1);
  assert.ok(await repo.publishArtifact(OWNER, ids[PUBLISH_DAILY_LIMIT]!, { visibility: 'link' }), 'the place of the 25-hour-old one is free');
  const refused = await repo.publishArtifact(OWNER, extra!, { visibility: 'link' }).then(
    () => null,
    (err: unknown) => err,
  );
  assert.ok(refused instanceof PublishLimitError, String(refused));
  assert.ok(refused.retryAfter > 3600 - 60 && refused.retryAfter <= 3600, `retryAfter: ${refused.retryAfter}`);
  const res = await api('POST', `/api/v1/artifacts/${extra}/publish`, OWNER, { visibility: 'link' });
  assert.equal(res.status, 429);
  const header = Number(res.headers.get('retry-after'));
  assert.ok(Number.isInteger(header) && header > 3600 - 60 && header <= 3600, `Retry-After: ${res.headers.get('retry-after')}`);
  const rows = await repo.listArtifacts(OWNER);
  rowsRead += rows.length;
});
