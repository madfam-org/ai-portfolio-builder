/**
 * W7 (B4) over a REAL Postgres (as cv_app): bilingual profile text (`translations` on profiles and profile_items,
 * migration 0003). Owner-scoped like every other column: B never reads, writes or clears A's translations (404 and an
 * unchanged re-read); the public projection carries only the document's own language; the export carries every
 * translation; the body cap and the per-field limits still hold; the database refuses a non-object value.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { DbHandle } from '../src/server/db/client.ts';
import { handleApi } from '../src/server/api/handler.ts';
import { getLinkArtifactByToken } from '../src/server/db/repository.ts';
import { bearer, startTestIssuer, type TestIssuer } from '../test-support/janua-tokens.ts';
import { appDb, resetAndMigrate } from './harness.ts';

const A = 'janua|bilingual-a';
const B = 'janua|bilingual-b';
let issuer: TestIssuer;
let h: DbHandle;
let rowsRead = 0;

before(async () => {
  await resetAndMigrate();
  issuer = await startTestIssuer();
  h = appDb();
});
after(async () => {
  assert.ok(rowsRead > 0, `read ${rowsRead} rows`);
  await issuer.close();
  await h.sql.end();
});

async function api(method: string, path: string, sub: string, body?: unknown, raw?: string) {
  const req = new Request(`http://0.0.0.0:3000${path}`, { method, headers: bearer(await issuer.token({ sub, name: `Nombre ${sub}` })), body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const res = await handleApi(req, path.split('?')[0]!.slice('/api/v1/'.length).split('/'), { env: issuer.env, getDb: () => h });
  const text = await res.text();
  // Test-only: the assertions walk nested JSON response bodies.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, headers: res.headers, body: text ? (JSON.parse(text) as Record<string, any>) : null };
}

const HEADER = { headline: 'Asesora de ventas de lujo', summary: 'Cinco años en boutique.', locale: 'es-MX', contact: { location: 'Ciudad de México' } };
const HEADER_EN = { en: { headline: 'Luxury sales advisor', summary: 'Five years in a boutique.', location: 'Mexico City' } };
const EXPERIENCE = { role: 'Asesora de ventas', organization: 'Maison Ejemplo', location: 'Ciudad de México', startDate: '2021-02', highlights: ['Cumplí el 112 % de mi meta.'] };
const EXPERIENCE_EN = { en: { role: 'Sales advisor', location: 'Mexico City', highlights: ['Reached 112% of my target.'] } };

let itemId = '';

test('translations: stored per owner; a PUT or PATCH without them keeps them; null clears; B gets 404 and changes nothing', async () => {
  const put = await api('PUT', '/api/v1/profile', A, { ...HEADER, translations: HEADER_EN });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  assert.deepEqual(put.body?.profile.translations, HEADER_EN);
  const item = await api('POST', '/api/v1/profile/items', A, { kind: 'experience', content: EXPERIENCE, tags: [], translations: { en: { ...EXPERIENCE_EN.en, summary: '  ' } } });
  assert.equal(item.status, 201, JSON.stringify(item.body));
  itemId = item.body?.item.id as string;
  assert.deepEqual(item.body?.item.translations, EXPERIENCE_EN, 'blank fields are not stored');
  const lang = await api('POST', '/api/v1/profile/items', A, { kind: 'language', content: { code: 'en', name: 'Inglés', level: 'C1' } });
  assert.equal(lang.status, 201);
  assert.equal(lang.body?.item.translations, null, 'no translations: null, as every row before W7-B4');

  // An older client (no `translations` in the body) keeps what is stored.
  assert.equal((await api('PUT', '/api/v1/profile', A, HEADER)).status, 200);
  assert.equal((await api('PATCH', `/api/v1/profile/items/${itemId}`, A, { tags: ['CRM'] })).status, 200);
  let mine = await api('GET', '/api/v1/profile', A);
  rowsRead += mine.body?.items.length ?? 0;
  assert.deepEqual(mine.body?.profile.translations, HEADER_EN);
  assert.deepEqual(mine.body?.items.find((i: { id: string }) => i.id === itemId).translations, EXPERIENCE_EN);

  // B: another person's item is a 404 for every write, and A's row is unchanged afterwards.
  assert.equal((await api('PATCH', `/api/v1/profile/items/${itemId}`, B, { translations: null })).status, 404);
  assert.equal((await api('PATCH', `/api/v1/profile/items/${itemId}`, B, { translations: { en: { role: 'Hacked' } } })).status, 404);
  assert.equal((await api('GET', `/api/v1/profile/items/${itemId}`, B)).status, 404);
  const theirs = await api('GET', '/api/v1/profile', B);
  assert.equal(theirs.body?.profile, null);
  assert.deepEqual(theirs.body?.items, []);
  mine = await api('GET', '/api/v1/profile', A);
  rowsRead += mine.body?.items.length ?? 0;
  assert.deepEqual(mine.body?.items.find((i: { id: string }) => i.id === itemId).translations, EXPERIENCE_EN, 'unchanged after B tried');

  // B's own translations never reach A, and the other way round.
  assert.equal((await api('PUT', '/api/v1/profile', B, { headline: 'B', translations: { en: { headline: 'B en' } } })).status, 200);
  assert.deepEqual((await api('GET', '/api/v1/profile', A)).body?.profile.translations, HEADER_EN);

  // null clears.
  const cleared = await api('PATCH', `/api/v1/profile/items/${itemId}`, A, { translations: null });
  assert.equal(cleared.body?.item.translations, null);
  assert.deepEqual((await api('PATCH', `/api/v1/profile/items/${itemId}`, A, { translations: EXPERIENCE_EN })).body?.item.translations, EXPERIENCE_EN);
});

test('refusals: the primary language, single fields (organisation), unknown locales, field limits; the body cap holds', async () => {
  const bad = async (method: string, path: string, body: unknown) => (await api(method, path, A, body)).status;
  assert.equal(await bad('PUT', '/api/v1/profile', { ...HEADER, translations: { 'es-MX': { headline: 'x' } } }), 400, 'the primary language is the fields themselves');
  assert.equal(await bad('PUT', '/api/v1/profile', { ...HEADER, translations: { en: { displayName: 'Valeria' } } }), 400, 'the name is single');
  assert.equal(await bad('PUT', '/api/v1/profile', { ...HEADER, translations: { fr: { headline: 'x' } } }), 400, 'only es-MX and en');
  assert.equal(await bad('PUT', '/api/v1/profile', { ...HEADER, translations: { en: { headline: 'x'.repeat(201) } } }), 400, 'same limit as the headline');
  assert.equal(await bad('PATCH', `/api/v1/profile/items/${itemId}`, { translations: { en: { organization: 'Maison' } } }), 400, 'organisations are proper names');
  assert.equal(await bad('PATCH', `/api/v1/profile/items/${itemId}`, { translations: { en: { startDate: '2020' } } }), 400, 'dates are single');
  assert.equal(await bad('PATCH', `/api/v1/profile/items/${itemId}`, { translations: { en: { summary: 'x'.repeat(3001) } } }), 400, 'same limit as the summary');
  assert.equal(await bad('PATCH', `/api/v1/profile/items/${itemId}`, { translations: { en: { highlights: Array.from({ length: 31 }, () => 'x') } } }), 400, 'at most 30 highlights');
  assert.equal(await bad('PATCH', `/api/v1/profile/items/${itemId}`, { translations: [] }), 400, 'an object, never a list');
  const lang = (await api('GET', '/api/v1/profile', A)).body?.items.find((i: { kind: string }) => i.kind === 'language');
  assert.equal(await bad('PATCH', `/api/v1/profile/items/${lang.id}`, { translations: { en: { name: 'English' } } }), 400, 'a language name comes from its code');
  assert.equal(await bad('PATCH', `/api/v1/profile/items/${lang.id}`, { content: { code: 'xx', name: 'Inglés' } }), 400, 'only listed ISO 639 codes');
  const huge = JSON.stringify({ translations: { en: { summary: 'x'.repeat(300 * 1024) } } });
  assert.equal((await api('PATCH', `/api/v1/profile/items/${itemId}`, A, undefined, huge)).status, 413, 'the body cap (limits.ts) still holds');
  // Nothing refused was stored.
  const after = await api('GET', '/api/v1/profile', A);
  rowsRead += after.body?.items.length ?? 0;
  assert.deepEqual(after.body?.profile.translations, HEADER_EN);
  assert.deepEqual(after.body?.items.find((i: { id: string }) => i.id === itemId).translations, EXPERIENCE_EN);
});

test('the database refuses a translations value that is not a JSON object, even as cv_app bypassing the API', async () => {
  await assert.rejects(h.sql`update profile_items set translations = '["en"]'::jsonb where owner_sub = ${A}`, /profile_items_translations_check/);
  await assert.rejects(h.sql`update profiles set translations = '"en"'::jsonb where owner_sub = ${A}`, /profiles_translations_check/);
  await assert.rejects(h.sql`update profiles set translations = ${JSON.stringify({ en: { summary: 'x'.repeat(70_000) } })}::jsonb where owner_sub = ${A}`, /profiles_translations_check/);
});

test('public projection: only the document language, only the fields it shows; a Spanish document carries none', async () => {
  const items = (await api('GET', '/api/v1/profile', A)).body?.items as { id: string }[];
  rowsRead += items.length;
  const set = await api('POST', '/api/v1/artifacts/batch', A, {
    locale: 'en',
    artifacts: [{ kind: 'cv', title: 'CV (English)', content: { items: items.map((i) => ({ itemId: i.id })), showContact: false } }],
  });
  assert.equal(set.status, 201, JSON.stringify(set.body));
  const es = await api('POST', '/api/v1/artifacts', A, { kind: 'cv', title: 'CV', locale: 'es-MX', content: { items: items.map((i) => ({ itemId: i.id })), showContact: true } });
  const enId = set.body?.artifacts[0].id as string;
  const enLink = await api('POST', `/api/v1/artifacts/${enId}/publish`, A, { visibility: 'link' });
  const esLink = await api('POST', `/api/v1/artifacts/${es.body?.artifact.id}/publish`, A, { visibility: 'link' });
  assert.equal(enLink.status, 200);
  const en = await getLinkArtifactByToken(h.db, enLink.body?.artifact.shareToken as string);
  assert.ok(en);
  assert.equal(en.profile.locale, 'es-MX');
  assert.deepEqual(en.profile.translations, { en: { headline: HEADER_EN.en.headline, summary: HEADER_EN.en.summary } }, 'no place without the contact');
  assert.deepEqual(en.items.find((i) => i.id === itemId)?.translations, EXPERIENCE_EN);
  const sp = await getLinkArtifactByToken(h.db, esLink.body?.artifact.shareToken as string);
  assert.ok(sp);
  assert.equal(sp.profile.translations, undefined, 'a document in the primary language reads no translation');
  assert.ok(sp.items.every((i) => i.translations === undefined));
  rowsRead += en.items.length + sp.items.length;
});

test('export: the full export carries every translation; JSON Resume per language, 400 for an unknown one', async () => {
  const full = await api('GET', '/api/v1/me/export', A);
  assert.equal(full.status, 200);
  assert.deepEqual(full.body?.profile.translations, HEADER_EN);
  assert.deepEqual(full.body?.items.find((i: { id: string }) => i.id === itemId).translations, EXPERIENCE_EN);
  const es = await api('GET', '/api/v1/me/export?format=json-resume', A);
  assert.equal(es.body?.basics.label, HEADER.headline);
  assert.equal(es.body?.work[0].position, EXPERIENCE.role);
  assert.equal(es.body?.languages[0].language, 'Inglés');
  const en = await api('GET', '/api/v1/me/export?format=json-resume&locale=en', A);
  assert.equal(en.status, 200);
  assert.match(en.headers.get('content-disposition') ?? '', /cv-json-resume-en-\d{4}-\d{2}-\d{2}\.json/);
  assert.equal(en.body?.basics.label, HEADER_EN.en.headline);
  assert.equal(en.body?.basics.location.address, 'Mexico City');
  assert.equal(en.body?.work[0].position, 'Sales advisor');
  assert.equal(en.body?.work[0].name, 'Maison Ejemplo', 'proper names stay');
  assert.deepEqual(en.body?.work[0].highlights, EXPERIENCE_EN.en.highlights);
  assert.equal(en.body?.languages[0].language, 'English', 'from the ISO 639 code');
  assert.equal((await api('GET', '/api/v1/me/export?format=json-resume&locale=fr', A)).status, 400);
  // B's export holds none of A's text.
  const theirs = await api('GET', '/api/v1/me/export', B);
  assert.ok(!JSON.stringify(theirs.body).includes('Luxury sales advisor'));
  rowsRead += full.body?.items.length ?? 0;
});
