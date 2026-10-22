/**
 * W4-T over a REAL Postgres (as cv_app): the template allowlist on every write path (create, set, PATCH) with an
 * unchanged re-read after each refusal, and rows stored BEFORE the allowlist (`base`, and an id no kind offers,
 * written by the owner role as older data would be) still read, edit, publish and render through the public projection.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { after, before, test } from 'node:test';
import postgres from 'postgres';
import type { DbHandle } from '../src/server/db/client.ts';
import { handleApi } from '../src/server/api/handler.ts';
import { getLinkArtifactByToken } from '../src/server/db/repository.ts';
import { bearer, startTestIssuer, type TestIssuer } from '../test-support/janua-tokens.ts';
import { A, B, appDb, resetAndMigrate, testUrls } from './harness.ts';

register('../test/render-loader.mjs', import.meta.url);
const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { ArtifactView } = await import('../src/components/render/ArtifactView.tsx');

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

async function api(method: string, path: string, sub: string, body?: unknown) {
  const req = new Request(`http://0.0.0.0:3000${path}`, { method, headers: bearer(await issuer.token({ sub })), body: body === undefined ? undefined : JSON.stringify(body) });
  const res = await handleApi(req, path.slice('/api/v1/'.length).split('/'), { env: issuer.env, getDb: () => h });
  const text = await res.text();
  // Test-only: the assertions walk nested JSON response bodies.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: text ? (JSON.parse(text) as Record<string, any>) : null };
}

const issuePaths = (body: Record<string, unknown> | null) => [...new Set(((body?.issues as { path: string }[]) ?? []).map((i) => i.path))];

test('the allowlist: create, set and PATCH accept only their kind\'s templates; a refusal changes nothing', async () => {
  const cv = await api('POST', '/api/v1/artifacts', A, { kind: 'cv', title: 'CV compacto', template: 'compacto' });
  assert.equal(cv.status, 201, JSON.stringify(cv.body));
  assert.equal(cv.body?.artifact.template, 'compacto');
  for (const [kind, template] of [['cv', 'no-existe'], ['portfolio', 'compacto'], ['cover_letter', 'contraste']]) {
    const res = await api('POST', '/api/v1/artifacts', A, { kind, title: 'x', template });
    assert.equal(res.status, 400, `${kind}/${template}`);
    assert.deepEqual(issuePaths(res.body), ['template']);
  }

  const set = await api('POST', '/api/v1/artifacts/batch', A, {
    artifacts: [
      { kind: 'cv', title: 'a', template: 'clasico' },
      { kind: 'portfolio', title: 'b', template: 'lista' },
      { kind: 'presentation', title: 'c', template: 'contraste' },
      { kind: 'cover_letter', title: 'd' },
    ],
  });
  assert.equal(set.status, 201, JSON.stringify(set.body));
  assert.deepEqual(
    (set.body?.artifacts as { kind: string; template: string }[]).map((a) => `${a.kind}/${a.template}`),
    ['cv/clasico', 'portfolio/lista', 'presentation/contraste', 'cover_letter/base'],
  );
  const listBefore = (await api('GET', '/api/v1/artifacts', A)).body?.artifacts as unknown[];
  rowsRead += listBefore.length;
  const refusedSet = await api('POST', '/api/v1/artifacts/batch', A, { artifacts: [{ kind: 'cv', title: 'a', template: 'compacto' }, { kind: 'portfolio', title: 'b', template: 'formal' }] });
  assert.equal(refusedSet.status, 400);
  assert.deepEqual(issuePaths(refusedSet.body), ['artifacts.1.template']);
  assert.equal(((await api('GET', '/api/v1/artifacts', A)).body?.artifacts as unknown[]).length, listBefore.length, 'all or none: nothing was created');

  const id = cv.body?.artifact.id as string;
  assert.equal((await api('PATCH', `/api/v1/artifacts/${id}`, A, { template: 'clasico' })).body?.artifact.template, 'clasico');
  const refused = await api('PATCH', `/api/v1/artifacts/${id}`, A, { title: 'Nuevo título', template: 'formal' });
  assert.equal(refused.status, 400);
  assert.deepEqual(issuePaths(refused.body), ['template']);
  const reread = await api('GET', `/api/v1/artifacts/${id}`, A);
  rowsRead += 1;
  assert.equal(reread.body?.artifact.template, 'clasico', 'the refused PATCH changed nothing');
  assert.equal(reread.body?.artifact.title, 'CV compacto', 'not even the valid field of the refused PATCH');
  // Another owner still gets the 404 first, whatever the template.
  assert.equal((await api('PATCH', `/api/v1/artifacts/${id}`, B, { template: 'base' })).status, 404);
  assert.equal((await api('PATCH', `/api/v1/artifacts/${id}`, B, { template: 'no-existe' })).status, 404);
});

test('rows from before the allowlist (base, and an id no kind offers) still read, edit, publish and render', async () => {
  const content = { items: [], blocks: [{ heading: 'Antes', body: 'Texto previo' }], showContact: false };
  assert.equal((await api('PUT', '/api/v1/profile', A, { headline: 'Ingeniera' })).status, 200);
  const owner = postgres(testUrls().owner, { max: 1, onnotice: () => undefined });
  let legacyId = '';
  let baseId = '';
  try {
    // As older data was written: straight into the table, no API in between.
    const rows = await owner<{ id: string; template: string }[]>`
      insert into artifacts (owner_sub, kind, title, locale, template, content)
      values (${A}, 'cv', 'CV previo', 'es-MX', 'base', ${owner.json(content)}),
             (${A}, 'portfolio', 'Portafolio previo', 'es-MX', 'retro', ${owner.json(content)})
      returning id, template`;
    baseId = rows.find((r) => r.template === 'base')!.id;
    legacyId = rows.find((r) => r.template === 'retro')!.id;
  } finally {
    await owner.end();
  }
  for (const id of [baseId, legacyId]) {
    const got = await api('GET', `/api/v1/artifacts/${id}`, A);
    assert.equal(got.status, 200);
    rowsRead += 1;
    // Editing anything else never trips the allowlist (the form sends only changed fields).
    const patched = await api('PATCH', `/api/v1/artifacts/${id}`, A, { title: `${got.body?.artifact.title} (editado)` });
    assert.equal(patched.status, 200, JSON.stringify(patched.body));
    assert.equal(patched.body?.artifact.template, got.body?.artifact.template, 'the stored template is kept');
    const link = await api('POST', `/api/v1/artifacts/${id}/publish`, A, { visibility: 'link' });
    assert.equal(link.status, 200);
    const shared = await getLinkArtifactByToken(h.db, link.body?.artifact.shareToken as string);
    assert.ok(shared);
    rowsRead += 1;
    const warn = console.warn;
    const logged: string[] = [];
    console.warn = (m: string) => logged.push(m);
    let html = '';
    try {
      html = renderToStaticMarkup(createElement(ArtifactView, { data: shared }));
    } finally {
      console.warn = warn;
    }
    assert.match(html, /data-template="base"/, 'renders as base');
    assert.match(html, /Texto previo/);
    assert.equal(logged.length, id === legacyId ? 1 : 0, 'only the unknown template is logged');
  }
  // Leaving the legacy template is allowed; going back to it is not.
  assert.equal((await api('PATCH', `/api/v1/artifacts/${legacyId}`, A, { template: 'lista' })).status, 200);
  assert.equal((await api('PATCH', `/api/v1/artifacts/${legacyId}`, A, { template: 'retro' })).status, 400);
});
