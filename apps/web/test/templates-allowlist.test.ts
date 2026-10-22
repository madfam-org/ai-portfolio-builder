/**
 * W4-T: the API's template allowlist comes from the registry (`lib/templates.ts`). The shape check stays; a template
 * outside its kind's list is a 400 on create, on a set (per document or set-wide) and, through the handler, on a
 * PATCH. The tailoring workspace's per-kind choices produce bodies that pass it.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_KINDS, buildArtifactSet } from '../src/components/jobs/tailoring.ts';
import { artifactCreateBody, artifactSetBody, templateIssue } from '../src/server/api/validation.ts';
import { ARTIFACT_KINDS } from '../src/server/db/schema.ts';
import { APP_COPY } from '../src/lib/copy/app.ts';
import { TEMPLATE_REGISTRY, isTemplateFor, templateIds } from '../src/lib/templates.ts';

test('the registry covers exactly the artifact kinds of the schema', () => {
  assert.deepEqual(Object.keys(TEMPLATE_REGISTRY).sort(), [...ARTIFACT_KINDS].sort());
});

test('create: every registry template of its kind passes; unknown or another kind\'s template is a 400 on `template`', () => {
  let accepted = 0;
  for (const kind of ARTIFACT_KINDS) {
    for (const template of templateIds(kind)) {
      assert.ok(artifactCreateBody.safeParse({ kind, title: 't', template }).success, `${kind}/${template}`);
      accepted += 1;
    }
    assert.equal(artifactCreateBody.parse({ kind, title: 't' }).template, 'base', 'the default stays base');
  }
  assert.equal(accepted, 9);
  for (const [kind, template] of [['cv', 'no-existe'], ['cv', 'formal'], ['portfolio', 'compacto'], ['presentation', 'lista'], ['cover_letter', 'contraste'], ['cv', 'BASE'], ['cv', '../base']]) {
    const r = artifactCreateBody.safeParse({ kind, title: 't', template });
    assert.equal(r.success, false, `${kind}/${template}`);
    assert.deepEqual([...new Set(r.error!.issues.map((i) => i.path.join('.')))], ['template']);
  }
});

test('set: a per-document template is checked against its own kind; the set-wide one against every kind that inherits it', () => {
  const ok = artifactSetBody.safeParse({ artifacts: [{ kind: 'cv', title: 'a', template: 'compacto' }, { kind: 'portfolio', title: 'b', template: 'lista' }, { kind: 'presentation', title: 'c' }] });
  assert.ok(ok.success);
  assert.deepEqual(ok.data.artifacts.map((a) => a.template ?? ok.data.template), ['compacto', 'lista', 'base']);
  const wrong = artifactSetBody.safeParse({ artifacts: [{ kind: 'cv', title: 'a' }, { kind: 'portfolio', title: 'b', template: 'clasico' }] });
  assert.equal(wrong.success, false);
  assert.deepEqual(wrong.error!.issues.map((i) => i.path.join('.')), ['artifacts.1.template']);
  const setWide = artifactSetBody.safeParse({ template: 'compacto', artifacts: [{ kind: 'cv', title: 'a' }, { kind: 'portfolio', title: 'b' }] });
  assert.equal(setWide.success, false, 'compacto is a CV template only');
  assert.deepEqual(setWide.error!.issues.map((i) => i.path.join('.')), ['template']);
  assert.equal(artifactSetBody.safeParse({ artifacts: [{ kind: 'cv', title: 'a', template: 'Mal formado' }] }).success, false, 'the shape check stays');
});

test('patch (the handler\'s check): templateIssue against the stored kind', () => {
  assert.equal(templateIssue('cv', 'clasico'), null);
  assert.equal(templateIssue('cover_letter', 'formal'), null);
  assert.match(templateIssue('cv', 'formal') ?? '', /unknown template for cv/);
  assert.match(templateIssue('bogus', 'base') ?? '', /unknown template/);
  assert.equal(isTemplateFor('portfolio', 'lista'), true);
  assert.equal(isTemplateFor('portfolio', 'constructor'), false, 'no prototype key is a template');
});

test('the workspace: one template per chosen kind reaches the batch body and passes the API', () => {
  const built = buildArtifactSet({
    jobId: '6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
    jobTitle: 'Backend',
    company: 'Acme',
    kinds: [...DEFAULT_KINDS, 'cover_letter'],
    template: 'base',
    templates: { cv: 'clasico', presentation: 'contraste', cover_letter: 'formal' },
    locale: 'es-MX',
    selection: [{ itemId: '11111111-1111-4111-8111-111111111111', override: { title: '', summary: '', highlights: '' } }],
    summary: '',
    showContact: false,
    greeting: '',
    closing: '',
    kindLabels: APP_COPY.es.kinds,
  });
  assert.ok(built.ok);
  const parsed = artifactSetBody.parse(built.body);
  assert.deepEqual(
    parsed.artifacts.map((a) => [a.kind, a.template ?? parsed.template]),
    [
      ['cv', 'clasico'],
      ['portfolio', 'base'],
      ['presentation', 'contraste'],
      ['cover_letter', 'formal'],
    ],
  );
});
