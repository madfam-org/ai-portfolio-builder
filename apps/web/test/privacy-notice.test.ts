/**
 * cv's privacy notice (lib/copy/privacy.ts): every element the law requires of a notice is present in both languages
 * (LFPDPPP 2025, art. 15 fr. I-VI), the facts it states match the code, and it is routed on the landing host only.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../src/lib/config.ts';
import { PRIVACY_COPY, PRIVACY_NOTICE, REQUIRED_SECTION_IDS, privacyPath } from '../src/lib/copy/privacy.ts';
import { sitemapXml } from '../src/lib/robots.ts';
import { decide } from '../src/lib/routing.ts';

const LOCALES = ['es', 'en'] as const;
const text = (locale: (typeof LOCALES)[number]) => {
  const t = PRIVACY_COPY[locale];
  return [t.lead, ...t.summary, ...Object.values(t.pending), ...t.sections.flatMap((s) => [s.title, ...s.body, ...(s.list ?? [])])].join('\n');
};

test('art. 15: the six required elements are sections in both languages, in the same order', () => {
  assert.deepEqual([...REQUIRED_SECTION_IDS], ['responsable', 'datos', 'finalidades', 'limitar', 'arco', 'cambios']);
  for (const locale of LOCALES) {
    const ids = PRIVACY_COPY[locale].sections.map((s) => s.id);
    for (const id of REQUIRED_SECTION_IDS) assert.ok(ids.includes(id), `${locale}: ${id}`);
    assert.equal(new Set(ids).size, ids.length, `${locale}: ids are unique`);
    for (const s of PRIVACY_COPY[locale].sections) assert.ok(s.body.length > 0 && s.body.every((p) => p.trim().length > 20), `${locale}: ${s.id} says something`);
  }
  assert.deepEqual(PRIVACY_COPY.es.sections.map((s) => s.id), PRIVACY_COPY.en.sections.map((s) => s.id));
  assert.ok(PRIVACY_COPY.es.sections.length >= 10, `read ${PRIVACY_COPY.es.sections.length} sections`);
});

test('the controller, the address, the mailbox and the authority are the current ones', () => {
  for (const locale of LOCALES) {
    const all = text(locale);
    assert.match(all, /Innovaciones MADFAM S\.A\.S\. de C\.V\./, locale);
    assert.match(all, /Río Pánuco 101.*62290.*Cuernavaca, Morelos/, locale);
    assert.match(all, /privacy@madfam\.io/, locale);
    assert.match(all, /Secretaría Anticorrupción y Buen Gobierno/, locale);
    assert.doesNotMatch(all, /\bINAI\b|Instituto Nacional de Transparencia/, `${locale}: the extinct authority is never named`);
    assert.doesNotMatch(all, /madfam\.com/i, locale);
    const mailboxes = new Set(all.match(/[a-z]+@madfam\.io/g));
    assert.deepEqual([...mailboxes], ['privacy@madfam.io'], `${locale}: one mailbox`);
    assert.doesNotMatch(all, /\bart(\.|ículo|icle)\s*\d/i, `${locale}: obligations are named, article numbers are not cited to the reader`);
  }
  assert.equal(PRIVACY_NOTICE.mailbox, 'privacy@madfam.io');
});

test('the time limits are the law\'s: twenty days to answer, fifteen to carry it out, fifteen to go to the authority', () => {
  assert.match(text('es'), /plazo máximo de veinte días/);
  assert.match(text('es'), /dentro de los quince días siguientes/);
  assert.match(text('en'), /at most twenty days/);
  assert.match(text('en'), /within the following fifteen days/);
  for (const locale of LOCALES) assert.doesNotMatch(text(locale), /hábiles|business days/, `${locale}: the law says days; the notice adds nothing`);
});

test('what the notice promises is what the product does: no ads, no sale, no AI training, private by default', () => {
  const es = text('es');
  assert.match(es, /No usamos tus datos para mercadotecnia/);
  assert.match(es, /No entrenamos modelos de inteligencia artificial/);
  assert.match(es, /solo el título del puesto y el estado/, 'the market range sends a title and a state');
  assert.match(es, /sin inteligencia artificial/, 'the match is keyword overlap');
  assert.match(es, /«Eliminar mis datos»/);
  assert.match(es, /«Descargar mis datos»/);
  assert.doesNotMatch(es + text('en'), /tlacuilo|tesseract|Hetzner|Cloudflare|Postgres/i, 'no service, engine or vendor names');
});

test('a draft says so and lists what is pending; an approved notice has nothing pending', () => {
  if (PRIVACY_NOTICE.status === 'draft') assert.ok(PRIVACY_NOTICE.pending.length > 0, 'a draft names what is open');
  else assert.equal(PRIVACY_NOTICE.pending.length, 0);
  for (const locale of LOCALES) for (const key of PRIVACY_NOTICE.pending) assert.ok(PRIVACY_COPY[locale].pending[key]?.length, `${locale}: ${key}`);
  assert.match(PRIVACY_NOTICE.version, /^\d{4}-\d{2}-\d{2}\.\d+$/);
  assert.ok(PRIVACY_NOTICE.version.startsWith(PRIVACY_NOTICE.updated));
});

test('routed on the landing host only, in both languages, and in the sitemap', () => {
  const env = { CV_HOST_LANDING: 'cv.madfam.io', CV_HOST_APP: 'cv-app.madfam.io', CV_HOST_API: 'cv-api.madfam.io' };
  const c = loadConfig(env);
  assert.deepEqual(decide('cv.madfam.io', '/privacidad', c), { kind: 'rewrite', role: 'landing', to: '/h/landing/es/privacidad', html: true, locale: 'es' });
  assert.deepEqual(decide('cv.madfam.io', '/en/privacidad', c), { kind: 'rewrite', role: 'landing', to: '/h/landing/en/privacidad', html: true, locale: 'en' });
  assert.equal(decide('cv-app.madfam.io', '/privacidad', c).kind, 'not-found');
  assert.equal(decide('cv-api.madfam.io', '/privacidad', c).kind, 'not-found');
  assert.equal(privacyPath('es'), '/privacidad');
  assert.equal(privacyPath('en'), '/en/privacidad');
  assert.match(sitemapXml(c), /https:\/\/cv\.madfam\.io\/privacidad/);
});
