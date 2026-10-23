/**
 * B1: the first-run guide's copy (es-MX source, en) and the language cv asks Janua's hosted pages for (OIDC
 * `ui_locales`). The guide's behaviour over the built server is e2e/onboarding.spec.ts.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ONBOARDING_COPY } from '../src/lib/copy/onboarding.ts';
import { JANUA_UI_LOCALES, localeOfAppPath, uiLocalesFor } from '../src/lib/ui-locales.ts';

function leaves(value: unknown, path = ''): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof value === 'string') out.set(path, value);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) for (const [p, s] of leaves(v, `${path}.${k}`)) out.set(p, s);
  return out;
}

test('the guide copy has the same keys in es and en, none empty, and names only what is built', () => {
  const es = leaves(ONBOARDING_COPY.es);
  const en = leaves(ONBOARDING_COPY.en);
  assert.deepEqual([...es.keys()].sort(), [...en.keys()].sort());
  assert.ok(es.size >= 9, `read ${es.size} strings`);
  for (const [key, text] of [...es, ...en]) assert.ok(text.trim().length > 0, key);
  const all = [...es.values(), ...en.values()].join(' ');
  assert.doesNotMatch(all, /madfam\.com/i);
  assert.doesNotMatch(all, /\b(IA|AI)\b/, 'no AI promise in the first-run guide');
  // The privacy line is the product default: private, nothing published without the person.
  assert.match(ONBOARDING_COPY.es.privacy, /privado.*Nada se publica a menos que tú lo decidas/);
  assert.match(ONBOARDING_COPY.en.privacy, /private.*Nothing is published unless you choose/);
  // The bookmark is named as the intake names it.
  assert.match(ONBOARDING_COPY.es.jobStep.body, /«Capturar vacante»/);
  assert.match(ONBOARDING_COPY.en.jobStep.body, /«Capture posting»/);
});

test('Janua is asked for es-MX, or English when the sign-in starts on an /en page', () => {
  assert.deepEqual(JANUA_UI_LOCALES, { es: 'es-MX', en: 'en' });
  for (const [path, locale] of [['/', 'es'], ['/perfil', 'es'], ['/empleos/nuevo', 'es'], ['/en', 'en'], ['/en/perfil', 'en'], ['/english', 'es'], ['/enx/perfil', 'es']] as const) {
    assert.equal(localeOfAppPath(path), locale, path);
    assert.equal(uiLocalesFor(path), JANUA_UI_LOCALES[locale], path);
  }
});
