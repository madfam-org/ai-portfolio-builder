/**
 * The landing must tell the truth about what exists (R85). Since the invite-only beta (owner ruling 2026-10-22) the
 * core journey is built and in use by invited people; only assisted writing is still a plan. These tests fail if the
 * landing goes back to saying nothing is available, or starts promising the AI.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COPY } from '../src/lib/copy/landing.ts';

const LOCALES = ['es', 'en'] as const;

test('landing: the built parts say private beta, only assisted writing says coming soon', () => {
  for (const locale of LOCALES) {
    const t = COPY[locale];
    const planned = t.building.filter((item) => !item.live);
    assert.equal(t.building.length, 5, locale);
    assert.equal(planned.length, 1, `${locale}: exactly one planned item`);
    assert.match(planned[0]!.title, /asistida|Assisted/, locale);
    const tags = new Set(t.building.filter((item) => item.live).map((item) => item.tag));
    assert.equal(tags.size, 1, `${locale}: one tag for what is built`);
    assert.notEqual([...tags][0], planned[0]!.tag, locale);
  }
});

test('landing: says invite-only, never that nothing exists or that anyone can sign up', () => {
  for (const locale of LOCALES) {
    const t = COPY[locale];
    const all = [t.badge, t.lead, t.buildingIntro, t.status, t.meta.title, t.meta.description].join(' ');
    assert.match(all, /invitaci[oó]n|invit/i, locale);
    assert.doesNotMatch(all, /Nada de esto|None of this|no hay cuentas|no accounts/i, locale);
    assert.ok(t.ecosystem.find((item) => /Janua/.test(item.title))?.live, `${locale}: Janua sign-in is live`);
  }
  assert.equal(COPY.es.building.length + COPY.en.building.length, 10, 'read both locales');
});
