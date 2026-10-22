/**
 * W4-I over a REAL Postgres (as cv_app): the import batch (`POST /profile/items/batch`, all or none), the export
 * (`GET /me/export`) and the deletion (`DELETE /me`). Every test crosses owners A and B and re-reads B afterwards.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { DbHandle } from '../src/server/db/client.ts';
import { handleApi } from '../src/server/api/handler.ts';
import { createDataRights } from '../src/server/db/data-rights.ts';
import { createRepository, sharedPageGate, type Repository } from '../src/server/db/repository.ts';
import { ITEM_BATCH_MAX } from '../src/server/api/validation.ts';
import { bearer, startTestIssuer, type TestIssuer } from '../test-support/janua-tokens.ts';
import { appDb, resetAndMigrate } from './harness.ts';

const A = 'janua|rights-a';
const B = 'janua|rights-b';
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
  const req = new Request(`http://0.0.0.0:3000${path}`, { method, headers: bearer(await issuer.token({ sub, name: `Nombre ${sub}` })), body: body === undefined ? undefined : JSON.stringify(body) });
  const res = await handleApi(req, path.split('?')[0]!.slice('/api/v1/'.length).split('/'), { env: issuer.env, getDb: () => h });
  const text = await res.text();
  // Test-only: the assertions walk nested JSON response bodies.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, headers: res.headers, body: text ? (JSON.parse(text) as Record<string, any>) : null };
}

/** Everything an owner holds, through the API (what the person would see). */
async function snapshot(sub: string) {
  const profile = await api('GET', '/api/v1/profile', sub);
  const jobs = await api('GET', '/api/v1/jobs', sub);
  const artifacts = await api('GET', '/api/v1/artifacts', sub);
  rowsRead += (profile.body?.items.length ?? 0) + (jobs.body?.jobs.length ?? 0) + (artifacts.body?.artifacts.length ?? 0);
  return { profile: profile.body, jobs: jobs.body, artifacts: artifacts.body };
}

const skill = (name: string) => ({ kind: 'skill', content: { name }, tags: [] as string[] });

test('import batch: owner-scoped, appended after existing items, header merged; one bad item refuses the whole batch', async () => {
  await repo.createItem(A, { kind: 'skill', position: 0, content: { name: 'Existente' }, tags: [] });
  await repo.createItem(B, { kind: 'skill', position: 0, content: { name: 'De B' }, tags: [] });
  await repo.putProfile(A, { headline: 'Titular de A', summary: '', locale: 'es-MX', contact: { links: [{ label: 'a', url: 'https://a.test' }] } });
  const bBefore = await snapshot(B);

  const res = await api('POST', '/api/v1/profile/items/batch', A, {
    items: [
      { kind: 'experience', content: { role: 'Ingeniera', organization: 'Acme Datos', startDate: '2021-01', current: true }, tags: ['SQL'] },
      skill('Python'),
      { kind: 'language', content: { name: 'Inglés', level: 'C1' } },
    ],
    profile: { summary: 'Importado', contact: { email: 'ana@example.test', links: [{ label: 'a', url: 'https://a.test' }, { label: 'b', url: 'https://b.test' }] } },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.deepEqual(res.body?.items.map((i: { kind: string; position: number }) => [i.kind, i.position]), [['experience', 1], ['skill', 2], ['language', 3]]);
  assert.equal(res.body?.items[0].ownerSub, undefined, 'the owner key is never echoed');
  assert.equal(res.body?.profile.headline, 'Titular de A', 'fields not sent are kept');
  assert.equal(res.body?.profile.summary, 'Importado');
  assert.deepEqual(res.body?.profile.contact, { email: 'ana@example.test', links: [{ label: 'a', url: 'https://a.test' }, { label: 'b', url: 'https://b.test' }] });

  // One invalid item among valid ones: 400 naming it, and nothing at all is written.
  const before = await snapshot(A);
  const bad = await api('POST', '/api/v1/profile/items/batch', A, { items: [skill('Bien'), { kind: 'project', content: { name: 'p', url: 'javascript:alert(1)' } }], profile: { headline: 'no' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body?.issues[0].path, 'items.1.content.url');
  for (const body of [{}, { items: [] }, { items: [{ ...skill('x'), position: 9 }] }, { items: [skill('x')], ownerSub: B }, { items: Array.from({ length: ITEM_BATCH_MAX + 1 }, () => skill('x')) }]) {
    assert.equal((await api('POST', '/api/v1/profile/items/batch', A, body)).status, 400, JSON.stringify(body).slice(0, 80));
  }
  assert.deepEqual(await snapshot(A), before);

  // All or none at the database too: a row the CHECK constraint refuses rolls back the header change with it.
  const rights = createDataRights(h.db);
  await assert.rejects(rights.importItems(A, { items: [skill('ok'), { kind: 'nope', content: {}, tags: [] }], profile: { headline: 'cambiado' } }));
  assert.deepEqual(await snapshot(A), before);

  // B's batch lands in B only; A unchanged, B gained exactly its own item.
  const bRes = await api('POST', '/api/v1/profile/items/batch', B, { items: [skill('Solo de B')] });
  assert.equal(bRes.status, 201);
  assert.equal(bRes.body?.profile.displayName, '', 'an existing profile keeps its name (B\'s was created without one)');
  assert.deepEqual(await snapshot(A), before);
  const bAfter = await snapshot(B);
  assert.equal(bAfter.profile?.items.length, bBefore.profile?.items.length + 1);

  // A first import for a person with no profile creates it (display name from Janua unless the import sets one).
  const fresh = await api('POST', '/api/v1/profile/items/batch', 'janua|rights-fresh', { profile: { displayName: 'Desde archivo' } });
  assert.equal(fresh.status, 201);
  assert.equal(fresh.body?.profile.displayName, 'Desde archivo');
  assert.deepEqual(fresh.body?.items, []);
});

test('import batch respects the W4-S item ceiling: an owner at 499 items importing 2 gets 429 and still has 499', async () => {
  const C = 'janua|rights-quota';
  const rights = createDataRights(h.db);
  await rights.importItems(C, { items: Array.from({ length: 300 }, (_, i) => skill(`s${i}`)) });
  await rights.importItems(C, { items: Array.from({ length: 199 }, (_, i) => skill(`t${i}`)) });
  const count = async () => (await api('GET', '/api/v1/profile/items', C)).body?.items.length;
  assert.equal(await count(), 499);
  const over = await api('POST', '/api/v1/profile/items/batch', C, { items: [skill('uno'), skill('dos')], profile: { headline: 'no debe guardarse' } });
  assert.equal(over.status, 429);
  assert.deepEqual(over.body, { error: 'quota_exceeded', resource: 'items', limit: 500 });
  assert.equal(await count(), 499, 'nothing written');
  assert.equal((await api('GET', '/api/v1/profile', C)).body?.profile.headline, '', 'the header patch rolled back with it');
  // Exactly up to the ceiling is fine; one more is not.
  assert.equal((await api('POST', '/api/v1/profile/items/batch', C, { items: [skill('ultimo')] })).status, 201);
  assert.equal(await count(), 500);
  assert.equal((await api('POST', '/api/v1/profile/items/batch', C, { items: [skill('extra')] })).status, 429);
  rowsRead += 500;
  // The ceiling is per owner: A and B are unaffected.
  assert.equal((await api('POST', '/api/v1/profile/items/batch', B, { items: [skill('B sigue')] })).status, 201);
  assert.equal((await api('DELETE', '/api/v1/profile/items/' + (await api('GET', '/api/v1/profile/items', B)).body?.items.at(-1).id, B)).status, 204);
});

test('export: everything A holds (share state included), never B\'s; a download, never cached; JSON Resume format', async () => {
  const job = await repo.createJob(A, { title: 'Backend', company: 'X', location: '', sourceUrl: null, sourceText: 'PostgreSQL', status: 'saved', notes: '' });
  const [itemA] = await repo.listItems(A);
  const art = await repo.createArtifact(A, { jobId: job.id, kind: 'cv', title: 'CV para X', locale: 'es-MX', template: 'base', content: { items: [{ itemId: itemA!.id }], blocks: [], showContact: false } });
  const published = await repo.publishArtifact(A, art!.id, { visibility: 'link' });
  await repo.createJob(B, { title: 'De B', company: '', location: '', sourceUrl: null, sourceText: 'B', status: 'saved', notes: '' });

  const res = await api('GET', '/api/v1/me/export', A);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(res.headers.get('content-disposition') ?? '', /^attachment; filename="cv-mis-datos-\d{4}-\d{2}-\d{2}\.json"$/);
  const doc = res.body!;
  rowsRead += doc.items.length + doc.jobs.length + doc.artifacts.length;
  assert.equal(doc.schema, 'madfam-cv-export');
  assert.equal(doc.version, 1);
  assert.equal(doc.profile.summary, 'Importado');
  assert.equal(doc.items.length, 4);
  assert.deepEqual(doc.jobs.map((j: { title: string }) => j.title), ['Backend']);
  assert.equal(doc.artifacts.length, 1);
  assert.equal(doc.artifacts[0].visibility, 'link');
  assert.equal(doc.artifacts[0].shareToken, published?.shareToken);
  assert.ok(!JSON.stringify(doc).includes(A) && !JSON.stringify(doc).includes('rights-b'), 'no owner keys, nothing of B');

  const bDoc = (await api('GET', '/api/v1/me/export', B)).body!;
  assert.deepEqual(bDoc.jobs.map((j: { title: string }) => j.title), ['De B']);
  assert.equal(bDoc.artifacts.length, 0);
  assert.ok(!JSON.stringify(bDoc).includes('Acme Datos'));

  const jr = await api('GET', '/api/v1/me/export?format=json-resume', A);
  assert.equal(jr.status, 200);
  assert.match(jr.headers.get('content-disposition') ?? '', /cv-json-resume-/);
  assert.equal(jr.body?.basics.label, 'Titular de A');
  assert.deepEqual(jr.body?.work, [{ name: 'Acme Datos', position: 'Ingeniera', startDate: '2021-01' }]);
  assert.equal((await api('GET', '/api/v1/me/export?format=xml', A)).status, 400);
});

test('delete: typed confirmation required; then A holds nothing, A\'s pages stop at once, B is untouched; export empty', async () => {
  const [art] = await repo.listArtifacts(A);
  const pub = await repo.createArtifact(A, { jobId: null, kind: 'portfolio', title: 'Portafolio', locale: 'es-MX', template: 'base', content: { items: [], blocks: [], showContact: false } });
  await repo.publishArtifact(A, pub!.id, { visibility: 'public', slug: 'portafolio-de-a', indexable: false });
  const token = art!.shareToken!;
  assert.equal((await api('GET', `/api/v1/public/s/${token}`, A)).status, 200);
  assert.equal((await api('GET', '/api/v1/public/a/portafolio-de-a', A)).status, 200);
  const aBefore = await snapshot(A);
  const bBefore = await snapshot(B);

  for (const body of [undefined, {}, { confirm: 'ELIMINAR' }, { confirm: 'delete-all-my-data', also: 1 }]) {
    assert.equal((await api('DELETE', '/api/v1/me', A, body)).status, 400, JSON.stringify(body));
  }
  assert.deepEqual(await snapshot(A), aBefore, 'nothing deleted without the confirmation');

  const del = await api('DELETE', '/api/v1/me', A, { confirm: 'delete-all-my-data' });
  assert.equal(del.status, 200);
  assert.deepEqual(del.body, { deleted: { profiles: 1, items: 4, jobs: 1, artifacts: 2 } });

  const aAfter = await snapshot(A);
  assert.deepEqual(aAfter.profile, { profile: null, items: [] });
  assert.deepEqual(aAfter.jobs, { jobs: [] });
  assert.deepEqual(aAfter.artifacts, { artifacts: [] });
  assert.equal((await api('GET', `/api/v1/public/s/${token}`, A)).status, 404);
  assert.equal((await api('GET', '/api/v1/public/a/portafolio-de-a', A)).status, 404);
  assert.equal(await sharedPageGate(h.db, 'public', 'portafolio-de-a'), null);
  assert.equal(await sharedPageGate(h.db, 'link', token), null);

  assert.deepEqual(await snapshot(B), bBefore, 'B untouched');
  const empty = (await api('GET', '/api/v1/me/export', A)).body!;
  assert.deepEqual([empty.profile, empty.items, empty.jobs, empty.artifacts], [null, [], [], []]);
  // Deleting again is harmless (nothing left), and B deleting removes only B.
  assert.deepEqual((await api('DELETE', '/api/v1/me', A, { confirm: 'delete-all-my-data' })).body, { deleted: { profiles: 0, items: 0, jobs: 0, artifacts: 0 } });
  const bDel = await api('DELETE', '/api/v1/me', B, { confirm: 'delete-all-my-data' });
  assert.equal(bDel.body?.deleted.profiles, 1);
  assert.equal((await api('GET', '/api/v1/profile', 'janua|rights-fresh')).body?.profile.displayName, 'Desde archivo', 'a third person keeps everything');
  rowsRead += 1;
});
