/**
 * The required cross-owner tests (lane J §3.7, adapted to the profile / jobs / artifacts model), against a REAL
 * Postgres, connected as the runtime role cv_app. Two owners, A and B.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { DbHandle } from '../src/server/db/client.ts';
import {
  ForeignItemsError,
  JobHasArtifactsError,
  SuspendedError,
  createRepository,
  getLinkArtifactByToken,
  getPublicArtifactBySlug,
  type Repository,
} from '../src/server/db/repository.ts';
import { A, B, appDb, resetAndMigrate } from './harness.ts';

let h: DbHandle;
let repo: Repository;
let rowsRead = 0;
const ids = { profileA: '', itemA: '', itemB: '', jobA: '', artifactA: '' };

before(async () => {
  await resetAndMigrate();
  h = appDb();
  repo = createRepository(h.db);
  await repo.putProfile(A, { headline: 'Backend', summary: 'A', locale: 'es-MX', contact: { email: 'a@example.test' } }, 'Ana A');
  const itemA = await repo.createItem(A, { kind: 'skill', position: 0, content: { name: 'PostgreSQL' }, tags: ['sql'] });
  const itemB = await repo.createItem(B, { kind: 'skill', position: 0, content: { name: 'Go' }, tags: [] }, 'Beto B');
  const jobA = await repo.createJob(A, { title: 'Backend dev', company: 'X', location: '', sourceUrl: null, sourceText: 'PostgreSQL y TypeScript', status: 'saved', notes: '' });
  const artifactA = await repo.createArtifact(A, {
    jobId: jobA.id,
    kind: 'cv',
    title: 'CV para X',
    locale: 'es-MX',
    template: 'base',
    content: { items: [{ itemId: itemA.id }], blocks: [], showContact: false },
  });
  assert.ok(artifactA);
  ids.profileA = itemA.profileId;
  ids.itemA = itemA.id;
  ids.itemB = itemB.id;
  ids.jobA = jobA.id;
  ids.artifactA = artifactA.id;
});

after(async () => {
  // Read-proof: a run that read zero rows must not pass.
  assert.ok(rowsRead > 0, `read ${rowsRead} rows`);
  await h?.sql.end();
});

async function snapshotA() {
  const s = {
    profile: await repo.getProfile(A),
    job: await repo.getJob(A, ids.jobA),
    artifact: await repo.getArtifact(A, ids.artifactA),
  };
  rowsRead += s.profile.items.length + (s.job ? 1 : 0) + (s.artifact ? 1 : 0);
  return s;
}

test('1. B lists never contain A rows (profile, items, jobs, artifacts)', async () => {
  const aItems = await repo.listItems(A);
  const aJobs = await repo.listJobs(A);
  const aArts = await repo.listArtifacts(A);
  rowsRead += aItems.length + aJobs.length + aArts.length;
  assert.equal(aItems.length, 1);
  assert.equal(aJobs.length, 1);
  assert.equal(aArts.length, 1);
  const bItems = await repo.listItems(B);
  assert.deepEqual(bItems.map((i) => i.id), [ids.itemB]);
  assert.deepEqual(await repo.listJobs(B), []);
  assert.deepEqual(await repo.listArtifacts(B), []);
  assert.deepEqual(await repo.listArtifacts(B, { jobId: ids.jobA }), []);
  const bProfile = await repo.getProfile(B);
  assert.equal(bProfile.profile?.displayName, 'Beto B', 'display name prefilled from the Janua name claim');
  assert.ok(bProfile.items.every((i) => i.ownerSub === B));
});

test('2. B get/update/delete/publish of A ids → null (404), and A rows are unchanged afterwards', async () => {
  const before = await snapshotA();
  assert.equal(await repo.getItem(B, ids.itemA), null);
  assert.equal(await repo.updateItem(B, ids.itemA, { tags: ['pwned'] }), null);
  assert.equal(await repo.deleteItem(B, ids.itemA), false);
  assert.equal(await repo.getJob(B, ids.jobA), null);
  assert.equal(await repo.updateJob(B, ids.jobA, { title: 'pwned' }), null);
  assert.equal(await repo.deleteJob(B, ids.jobA), false);
  assert.equal(await repo.getArtifact(B, ids.artifactA), null);
  assert.equal(await repo.updateArtifact(B, ids.artifactA, { title: 'pwned' }), null);
  assert.equal(await repo.publishArtifact(B, ids.artifactA, { visibility: 'link' }), null);
  assert.equal(await repo.unpublishArtifact(B, ids.artifactA), null);
  assert.equal(await repo.deleteArtifact(B, ids.artifactA), false);
  assert.equal(await repo.createArtifact(B, { jobId: ids.jobA, kind: 'cv', title: 't', locale: 'en', template: 'base', content: { items: [], blocks: [], showContact: false } }), null);
  assert.deepEqual(await snapshotA(), before);
});

test('3. the composite FKs reject cross-owner children even when the repository is bypassed', async () => {
  await assert.rejects(
    h.sql`insert into profile_items (owner_sub, profile_id, kind, content) values (${B}, ${ids.profileA}, 'skill', '{"name":"x"}'::jsonb)`,
    (err: { code?: string }) => err.code === '23503',
  );
  await assert.rejects(
    h.sql`insert into artifacts (owner_sub, job_id, kind, title, content) values (${B}, ${ids.jobA}, 'cv', 't', '{}'::jsonb)`,
    (err: { code?: string }) => err.code === '23503',
  );
  // And the sharing CHECKs: a token without 'link', a published private artifact.
  await assert.rejects(h.sql`update artifacts set share_token = 'x' where id = ${ids.artifactA}`, (err: { code?: string }) => err.code === '23514');
  await assert.rejects(h.sql`update artifacts set status = 'published', published_at = now() where id = ${ids.artifactA}`, (err: { code?: string }) => err.code === '23514');
});

test('4. artifact content cannot reference another owner item ids (create and update)', async () => {
  const content = { items: [{ itemId: ids.itemA }, { itemId: ids.itemB }], blocks: [], showContact: false };
  await assert.rejects(repo.createArtifact(A, { jobId: null, kind: 'portfolio', title: 'p', locale: 'en', template: 'base', content }), (err) => err instanceof ForeignItemsError && err.ids.join() === ids.itemB);
  await assert.rejects(repo.updateArtifact(A, ids.artifactA, { content }), ForeignItemsError);
  const slides = { items: [], blocks: [], showContact: false, slides: [{ title: 's', itemIds: [ids.itemB] }] };
  await assert.rejects(repo.createArtifact(A, { jobId: null, kind: 'presentation', title: 'p', locale: 'en', template: 'base', content: slides }), ForeignItemsError);
  const art = await repo.getArtifact(A, ids.artifactA);
  rowsRead += art ? 1 : 0;
  assert.deepEqual((art?.content as { items: unknown[] }).items, [{ itemId: ids.itemA }]);
});

test('5. drafts and private artifacts are never public; link ≠ slug; unpublish and suspension close both', async () => {
  const draft = await repo.getArtifact(A, ids.artifactA);
  assert.equal(draft?.status, 'draft');
  const link = await repo.publishArtifact(A, ids.artifactA, { visibility: 'link' });
  assert.ok(link?.shareToken && link.shareToken.length === 43);
  assert.ok(await getLinkArtifactByToken(h.db, link.shareToken), 'link artifact by token');
  rowsRead += 1;
  assert.equal(await getPublicArtifactBySlug(h.db, link.shareToken.toLowerCase()), null);

  const pub = await repo.publishArtifact(A, ids.artifactA, { visibility: 'public', slug: 'ana-backend', indexable: false });
  assert.equal(pub?.shareToken, null);
  assert.equal(await getLinkArtifactByToken(h.db, link.shareToken), null, 'the old token died when the slug was set');
  const seen = await getPublicArtifactBySlug(h.db, 'ana-backend');
  rowsRead += seen ? 1 : 0;
  assert.equal(seen?.profile.displayName, 'Ana A');
  assert.deepEqual(seen?.items.map((i) => i.id), [ids.itemA]);
  assert.equal('contact' in (seen?.profile ?? {}), false, 'contact only when the artifact says showContact');
  assert.equal('ownerSub' in (seen?.artifact ?? {}), false);

  // Another owner cannot take the slug.
  const bArt = await createRepository(h.db).createArtifact(B, { jobId: null, kind: 'cv', title: 'b', locale: 'en', template: 'base', content: { items: [], blocks: [], showContact: false } });
  assert.ok(bArt);
  await assert.rejects(repo.publishArtifact(B, bArt.id, { visibility: 'public', slug: 'ana-backend', indexable: false }), /slug taken/);
  assert.equal(await getPublicArtifactBySlug(h.db, 'b-draft'), null);

  await repo.unpublishArtifact(A, ids.artifactA);
  assert.equal(await getPublicArtifactBySlug(h.db, 'ana-backend'), null);

  await repo.publishArtifact(A, ids.artifactA, { visibility: 'public', slug: 'ana-backend', indexable: true });
  // Operator takedown (docs/DEPLOYMENT.md "Moderation"): never served, and the owner cannot publish again.
  const owner = (await import('postgres')).default(process.env.CV_TEST_OWNER_URL!, { max: 1 });
  await owner`update artifacts set suspended_at = now(), suspended_reason = 'test' where id = ${ids.artifactA}`;
  await owner.end();
  assert.equal(await getPublicArtifactBySlug(h.db, 'ana-backend'), null);
  await assert.rejects(repo.publishArtifact(A, ids.artifactA, { visibility: 'link' }), SuspendedError);
});

test('6. a job with artifacts cannot be deleted (409), never a silent cascade; cv_app has no DDL', async () => {
  await assert.rejects(repo.deleteJob(A, ids.jobA), JobHasArtifactsError);
  await assert.rejects(h.sql`create table cv_app_should_not_create (id int)`, (err: { code?: string }) => err.code === '42501');
  await assert.rejects(h.sql`drop table artifacts`, (err: { code?: string }) => err.code === '42501');
});
