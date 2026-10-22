/**
 * The import model (src/components/import/model.ts, header.ts), the batch/delete bodies (validation.ts), the contact
 * merge and the export documents (server/db/data-rights.ts mergeContact, server/api/portability.ts).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { headerChoices, headerPatch } from '../src/components/import/header.ts';
import { IMPORT_MAX_ITEMS, duplicateKey, fitContent, fitHeader, fitTags, findDuplicates, type ImportItem } from '../src/components/import/model.ts';
import { exportFilename, fullExport } from '../src/server/api/portability.ts';
import { DELETE_ME_CONFIRMATION, ITEM_BATCH_MAX, deleteMeBody, itemBatchBody } from '../src/server/api/validation.ts';
import { mergeContact } from '../src/server/db/data-rights.ts';

test('fitContent: unknown keys dropped, text cut to its limit (noted), required fields enforced, end before start dropped', () => {
  const long = 'x'.repeat(3500);
  const r = fitContent('experience', { role: '  Rol  ', organization: 'Org', summary: long, hack: 'no', ownerSub: 'b', startDate: '2020', endDate: '2019' });
  assert.ok(r);
  assert.deepEqual(Object.keys(r.content).sort(), ['organization', 'role', 'startDate', 'summary']);
  assert.equal(r.content.role, 'Rol');
  assert.equal((r.content.summary as string).length, 3000);
  assert.ok((r.content.summary as string).endsWith('…'));
  assert.deepEqual(r.notes.sort(), ['date_dropped', 'truncated']);
  assert.equal(fitContent('experience', { role: 'Rol' }), null);
  assert.equal(fitContent('link', { label: 'x', url: 'ftp://x' }), null, 'a link without an http(s) url is not a link');
  assert.deepEqual(fitContent('skill', { name: 'SQL', level: 'guru', years: 5.5 })?.content, { name: 'SQL' });
  assert.deepEqual(fitContent('project', { name: 'p', highlights: ['a', '', 7, 'b'], links: [{ url: 'https://a.test' }, { url: 'https://a.test' }, { url: 'nope' }] })?.content, {
    name: 'p',
    links: [{ label: 'a.test', url: 'https://a.test' }],
    highlights: ['a', 'b'],
  });
});

test('fitTags and fitHeader keep the API limits; the email check is zod\'s', () => {
  assert.deepEqual(fitTags(['A', 'a', ' b ', '', 3, 'c'.repeat(70)]), ['A', 'b', 'c'.repeat(60)]);
  assert.equal(fitTags(Array.from({ length: 80 }, (_, i) => `t${i}`)).length, 50);
  const email = z.string().email();
  for (const sample of ['ana@example.test', 'a.b+c@sub.example.mx', 'ana@', 'ana@x', 'a b@example.test', 'ana@example.t']) {
    const h = fitHeader({ contact: { email: sample } });
    assert.equal(h.contact.email !== undefined, email.safeParse(sample).success, sample);
  }
  assert.deepEqual(fitHeader({ displayName: ' Ana ', headline: '', summary: 'y'.repeat(6000), contact: { links: [{ url: 'www.ana.test' }] } }), {
    displayName: 'Ana',
    summary: `${'y'.repeat(4999)}…`,
    contact: { links: [{ label: 'ana.test', url: 'https://www.ana.test' }] },
  });
});

const item = (key: string, kind: ImportItem['kind'], content: Record<string, unknown>): ImportItem => ({ key, kind, content, tags: [], origin: { file: 'f', row: 1 }, notes: [] });

test('duplicates: same kind and key fields (case, accents and spaces folded), against the profile and within the file', () => {
  assert.equal(duplicateKey('skill', { name: ' Pythón ' }), duplicateKey('skill', { name: 'python' }));
  assert.notEqual(duplicateKey('experience', { role: 'A', organization: 'B', startDate: '2020' }), duplicateKey('experience', { role: 'A', organization: 'B', startDate: '2021' }));
  const dups = findDuplicates(
    [item('1', 'skill', { name: 'SQL' }), item('2', 'skill', { name: 'Python' }), item('3', 'skill', { name: 'python' }), item('4', 'language', { name: 'SQL' })],
    [{ kind: 'skill', content: { name: 'sql' } }],
  );
  assert.deepEqual([...dups].sort(), ['1', '3']);
});

test('header choices: only fields the import has; preselected only when empty today; links only when new; the patch', () => {
  const header = { displayName: 'Ana', headline: 'Nueva', summary: 'Igual', contact: { email: 'ana@example.test', links: [{ label: 'a', url: 'https://a.test' }, { label: 'b', url: 'https://b.test' }] } };
  const profile = { displayName: '', headline: 'Vieja', summary: 'Igual', contact: { links: [{ label: 'a', url: 'https://a.test' }] } };
  const choices = headerChoices(header, profile);
  assert.deepEqual(
    choices.map((c) => [c.key, c.preselected, c.replaces]),
    [['displayName', true, false], ['headline', false, true], ['email', true, false], ['links', true, false]],
  );
  assert.equal(choices.find((c) => c.key === 'links')!.display, 'https://b.test');
  assert.deepEqual(headerPatch(header, new Set(['displayName', 'email', 'links'] as const)), { displayName: 'Ana', contact: { email: 'ana@example.test', links: header.contact.links } });
  assert.equal(headerPatch(header, new Set()), null);
  assert.equal(headerChoices({ contact: {} }, null).length, 0);
});

test('mergeContact: given keys replace, links are added by URL up to 20', () => {
  const current = { email: 'old@example.test', phone: '1', links: [{ label: 'a', url: 'https://a.test' }] };
  assert.deepEqual(mergeContact(current, { email: 'new@example.test', links: [{ label: 'A', url: 'https://a.test' }, { label: 'b', url: 'https://b.test' }] }), {
    email: 'new@example.test',
    phone: '1',
    links: [{ label: 'a', url: 'https://a.test' }, { label: 'b', url: 'https://b.test' }],
  });
  const many = Array.from({ length: 25 }, (_, i) => ({ label: `l${i}`, url: `https://x.test/${i}` }));
  assert.equal(mergeContact({}, { links: many }).links?.length, 20);
  assert.deepEqual(mergeContact(current, {}), current);
});

test('the batch body: the client cap equals the server cap; strict; something to import; the delete confirmation', () => {
  assert.equal(IMPORT_MAX_ITEMS, ITEM_BATCH_MAX);
  const one = { kind: 'skill', content: { name: 'SQL' } };
  assert.ok(itemBatchBody.safeParse({ items: [one] }).success);
  assert.ok(itemBatchBody.safeParse({ profile: { headline: 'x' } }).success);
  assert.ok(!itemBatchBody.safeParse({}).success, 'nothing to import');
  assert.ok(!itemBatchBody.safeParse({ items: [], profile: {} }).success);
  assert.ok(!itemBatchBody.safeParse({ items: [{ ...one, position: 3 }] }).success, 'no positions from the body');
  assert.ok(!itemBatchBody.safeParse({ items: [one], ownerSub: 'b' }).success, 'no mass assignment');
  assert.ok(!itemBatchBody.safeParse({ items: [{ kind: 'nope', content: {} }] }).success);
  assert.ok(!itemBatchBody.safeParse({ items: Array.from({ length: ITEM_BATCH_MAX + 1 }, () => one) }).success);
  assert.ok(!itemBatchBody.safeParse({ profile: { locale: 'en' } }).success, 'locale is not importable');
  assert.ok(deleteMeBody.safeParse({ confirm: DELETE_ME_CONFIRMATION }).success);
  for (const bad of [{}, { confirm: 'ELIMINAR' }, { confirm: DELETE_ME_CONFIRMATION, extra: 1 }]) assert.ok(!deleteMeBody.safeParse(bad).success);
});

test('the full export: schema and version, every row without the owner key; dated file names', () => {
  const now = new Date('2026-10-22T23:30:00Z');
  const doc = fullExport({ profile: null, items: [{ ownerSub: 'secret', id: 'i' } as never], jobs: [], artifacts: [{ ownerSub: 'secret', id: 'a', shareToken: 't', slug: null } as never] }, now);
  assert.equal(doc.schema, 'madfam-cv-export');
  assert.equal(doc.version, 1);
  assert.equal(doc.exportedAt, '2026-10-22T23:30:00.000Z');
  assert.ok(!JSON.stringify(doc).includes('secret'));
  assert.deepEqual(doc.artifacts, [{ id: 'a', shareToken: 't', slug: null }]);
  assert.equal(exportFilename('full', now), 'cv-mis-datos-2026-10-22.json');
  assert.equal(exportFilename('json-resume', now), 'cv-json-resume-2026-10-22.json');
});
