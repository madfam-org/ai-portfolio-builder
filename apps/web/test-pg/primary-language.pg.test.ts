/**
 * W7 (B4) over a REAL Postgres (as cv_app): changing the profile's primary language swaps the texts of the header and
 * of every one of the owner's items in one transaction (repository putProfile, lib/profile-text-swap.ts). The stored
 * rows, another owner left untouched, the localized render data identical in both languages before and after, the
 * round trip back, and the refusal of a translation keyed by the stored primary language.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { DbHandle } from '../src/server/db/client.ts';
import { handleApi } from '../src/server/api/handler.ts';
import type { ItemKind } from '../src/lib/copy/app.ts';
import { contentLocale, localizeHeader, localizeItem, type ContentLocale } from '../src/lib/profile-text.ts';
import { bearer, startTestIssuer, type TestIssuer } from '../test-support/janua-tokens.ts';
import { appDb, resetAndMigrate } from './harness.ts';

const A = 'janua|primary-a';
const B = 'janua|primary-b';
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

// Test-only: the assertions walk nested JSON response bodies.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

async function api(method: string, path: string, sub: string, body?: unknown) {
  const req = new Request(`http://0.0.0.0:3000${path}`, { method, headers: bearer(await issuer.token({ sub, name: `Nombre ${sub}` })), body: body === undefined ? undefined : JSON.stringify(body) });
  const res = await handleApi(req, path.split('?')[0]!.slice('/api/v1/'.length).split('/'), { env: issuer.env, getDb: () => h });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Json) : null };
}

async function stored(sub: string): Promise<{ profile: Json; items: Json[] }> {
  const res = await api('GET', '/api/v1/profile', sub);
  assert.equal(res.status, 200);
  rowsRead += 1 + (res.body?.items.length ?? 0);
  return { profile: res.body?.profile, items: res.body?.items };
}

/** What every renderer reads for each language: the header and every item, localized (lib/profile-text.ts). */
function renderData(state: { profile: Json; items: Json[] }) {
  const primary = contentLocale(state.profile.locale);
  const out: Record<string, unknown> = {};
  for (const target of ['es-MX', 'en'] as ContentLocale[]) {
    const p = state.profile;
    out[`header:${target}`] = localizeHeader({ headline: p.headline, summary: p.summary, location: p.contact.location }, p.translations, primary, target).header;
    for (const item of state.items) out[`${item.id}:${target}`] = localizeItem(item.kind as ItemKind, item.content, item.translations, primary, target).content;
  }
  return out;
}

const strip = (rows: Json[]) => rows.map((r) => ({ id: r.id, kind: r.kind, content: r.content, translations: r.translations, tags: r.tags, position: r.position }));

const HEADER = { headline: 'Asesora de ventas de lujo', summary: 'Cinco años en boutique.', locale: 'es-MX', contact: { email: 'valeria@example.test', location: 'Ciudad de México' } };
const HEADER_EN = { en: { headline: 'Luxury sales advisor', location: 'Mexico City' } };
const EXPERIENCE = { role: 'Asesora de ventas', organization: 'Maison Ejemplo', location: 'Ciudad de México', startDate: '2021-02', summary: 'Atención personalizada.', highlights: ['Cumplí el 112 % de mi meta.'] };
const EXPERIENCE_EN = { en: { role: 'Sales advisor', highlights: ['Reached 112% of my target.'] } };
const RECOMMENDATION = { name: 'Ana Ficticia', role: 'Gerente de tienda', relationship: 'Fue mi jefa directa', text: 'Una vendedora excepcional.' };
const RECOMMENDATION_EN = { en: { role: 'Store manager' } };

test('switching es-MX → en swaps the header and every item in place; render data identical; B untouched; switching back restores the rows', async () => {
  assert.equal((await api('PUT', '/api/v1/profile', A, { ...HEADER, translations: HEADER_EN })).status, 200);
  const posts = [
    { kind: 'experience', content: EXPERIENCE, translations: EXPERIENCE_EN },
    { kind: 'skill', content: { name: 'Atención al cliente', level: 'expert' } },
    { kind: 'recommendation', content: RECOMMENDATION, translations: RECOMMENDATION_EN },
    { kind: 'language', content: { code: 'fr', name: 'Francés', level: 'B2' } },
  ];
  for (const [position, p] of posts.entries()) assert.equal((await api('POST', '/api/v1/profile/items', A, { ...p, position, tags: [] })).status, 201);
  // B: a profile with its own English translations, which A's switch must never touch.
  assert.equal((await api('PUT', '/api/v1/profile', B, { headline: 'Gerente', translations: { en: { headline: 'Manager' } } })).status, 200);
  assert.equal((await api('POST', '/api/v1/profile/items', B, { kind: 'experience', content: { role: 'Gerente', organization: 'Otra Casa' }, tags: [], translations: { en: { role: 'Manager' } } })).status, 201);

  const original = await stored(A);
  const theirs = await stored(B);
  const renderedBefore = renderData(original);
  assert.equal(Object.keys(renderedBefore).length, 2 * (1 + posts.length), 'header and items, in both languages');

  // As the editor sends it: the texts in the SAVED languages, the translations keyed by the saved other language.
  const put = await api('PUT', '/api/v1/profile', A, { ...HEADER, locale: 'en', translations: HEADER_EN });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  assert.equal(put.body?.items?.length, posts.length, 'the swapped items come back with the profile');

  const switched = await stored(A);
  assert.equal(switched.profile.locale, 'en');
  assert.equal(switched.profile.headline, 'Luxury sales advisor');
  assert.equal(switched.profile.summary, HEADER.summary, 'no translation: the field keeps its value');
  assert.deepEqual(switched.profile.contact, { email: 'valeria@example.test', location: 'Mexico City' });
  assert.deepEqual(switched.profile.translations, { 'es-MX': { headline: HEADER.headline, location: 'Ciudad de México' } });
  const byKind = (state: { items: Json[] }, kind: string) => state.items.find((i) => i.kind === kind)!;
  assert.deepEqual(byKind(switched, 'experience').content, { ...EXPERIENCE, role: 'Sales advisor', highlights: ['Reached 112% of my target.'] });
  assert.deepEqual(byKind(switched, 'experience').translations, { 'es-MX': { role: EXPERIENCE.role, highlights: EXPERIENCE.highlights } });
  assert.deepEqual(byKind(switched, 'recommendation').content, { ...RECOMMENDATION, role: 'Store manager' }, 'the recommender\'s words are untouched');
  assert.deepEqual(byKind(switched, 'recommendation').translations, { 'es-MX': { role: RECOMMENDATION.role } });
  assert.deepEqual(byKind(switched, 'skill').content, byKind(original, 'skill').content);
  assert.equal(byKind(switched, 'skill').translations, null, 'nothing added where there was no translation');
  assert.deepEqual(strip(put.body?.items as Json[]), strip(switched.items), 'the response is what is stored');

  assert.deepEqual(renderData(switched), renderedBefore, 'every document renders the same text in both languages');
  const theirsAfter = await stored(B);
  assert.deepEqual(theirsAfter.profile, theirs.profile, 'B\'s profile untouched');
  assert.deepEqual(strip(theirsAfter.items), strip(theirs.items), 'B\'s items untouched');

  // An older client (no translations in the body) switching back: the stored ones are swapped, and the rows return.
  const backPut = await api('PUT', '/api/v1/profile', A, { headline: switched.profile.headline, summary: switched.profile.summary, locale: 'es-MX', contact: switched.profile.contact });
  assert.equal(backPut.status, 200, JSON.stringify(backPut.body));
  const back = await stored(A);
  assert.equal(back.profile.locale, 'es-MX');
  for (const k of ['headline', 'summary', 'contact', 'translations', 'displayName']) assert.deepEqual(back.profile[k], original.profile[k], k);
  assert.deepEqual(strip(back.items), strip(original.items), 'every item as it was');
  assert.deepEqual(renderData(back), renderedBefore);

  // A save that keeps the language never touches the items.
  const same = await api('PUT', '/api/v1/profile', A, { ...HEADER, translations: HEADER_EN });
  assert.equal(same.status, 200);
  assert.equal(same.body?.items, undefined);
});

test('a translation keyed by the STORED primary language is refused and changes nothing, switching or not', async () => {
  const before = await stored(A);
  assert.equal(before.profile.locale, 'es-MX');
  const keep = await api('PUT', '/api/v1/profile', A, { ...HEADER, translations: { 'es-MX': { headline: 'x' } } });
  assert.equal(keep.status, 400);
  assert.equal(keep.body?.issues?.[0]?.path, 'translations.es-MX');
  const switching = await api('PUT', '/api/v1/profile', A, { ...HEADER, locale: 'en', translations: { 'es-MX': { headline: 'x' } } });
  assert.equal(switching.status, 400, 'the body is read in the stored primary language');
  const afterRefusals = await stored(A);
  assert.deepEqual(afterRefusals.profile, before.profile);
  assert.deepEqual(strip(afterRefusals.items), strip(before.items), 'the transaction rolled back: no item swapped');
});
