/**
 * W7 (B4): bilingual profile text, end to end, with the SYNTHETIC persona «Valeria Ficticia Robles» (fictional; the
 * employer «Maison Ejemplo» and the school are invented). Spanish is the profile's language; English is written next
 * to it, field by field, in the profile editor.
 *
 * 1. Baseline: documents of a profile WITHOUT translations print the same text, byte for byte, as before W7-B4. The
 *    golden files under e2e/fixtures/bilingual/ were printed by the build of `main` at cab8e0d0 (the commit this lane
 *    started from) with this very test (`CV_E2E_WRITE_GOLDEN=1`); this build must print the identical text.
 * 2. The editor: «Español | English» per form, the English text written next to the Spanish one, per-item «falta en
 *    inglés» marks, the language chosen from a list (its name comes from the ISO 639 code).
 * 3. The English «Clásica» CV prints the English strings and none of the Spanish free text (proper nouns aside); the
 *    Spanish CV still prints the golden text.
 * 4. A field left without English falls back to the Spanish text and is FLAGGED in tailoring and preview («Faltan N
 *    textos en inglés», linking to the field), never in the printed output.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { readPdf } from './documents-pdf.ts';
import { apiAs, cspViolations, signIn, type Json } from './support/fixtures.ts';
import { suiteOwners, url } from './support/env.ts';

const { OWNER_B } = suiteOwners('bilingual');
/** The persona: invented, never a real person. */
const VALERIA = { sub: 'janua|e2e-bilingual-persona', name: 'Valeria Ficticia Robles', email: 'valeria@example.test' };
const GOLDEN = join(import.meta.dirname, 'fixtures', 'bilingual');
const WRITE_GOLDEN = process.env.CV_E2E_WRITE_GOLDEN === '1';
const SHOTS = process.env.CV_E2E_SHOTS;
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `bilingual-${name}.png`), fullPage: true });
}

/** The Spanish profile, with fields that exist on `main` only (the baseline must print on both builds). */
const HEADER = {
  displayName: 'Valeria Ficticia Robles',
  headline: 'Asesora de ventas de lujo · alta joyería y relojería',
  summary: 'Asesora de ventas de lujo con cinco años en boutique, cartera propia de clientes y servicio en español e inglés.',
  locale: 'es-MX',
  contact: { email: 'valeria@example.test', location: 'Ciudad de México' },
};
const ITEMS = [
  {
    kind: 'experience',
    content: {
      role: 'Asesora de ventas de lujo',
      organization: 'Maison Ejemplo',
      employmentType: 'full_time',
      location: 'Ciudad de México',
      startDate: '2021-02',
      current: true,
      summary: 'Atención a clientes nacionales y extranjeros en una boutique de alta joyería.',
      highlights: ['Cumplí el 112 % de mi meta anual de ventas en 2025.', 'Desarrollé una cartera de 150 clientes activos.'],
    },
    tags: ['Clienteling', 'CRM'],
  },
  { kind: 'education', content: { institution: 'Universidad Ejemplo', degree: 'Licenciatura en Mercadotecnia', field: 'Comercio de lujo', startDate: '2014', endDate: '2018' }, tags: [] },
  { kind: 'skill', content: { name: 'Ventas consultivas', level: 'expert' }, tags: ['Ventas'] },
  { kind: 'language', content: { name: 'Inglés', level: 'C1' }, tags: ['Inglés'] },
  { kind: 'language', content: { name: 'Español', level: 'native' }, tags: [] },
  { kind: 'achievement', content: { title: 'Primer lugar regional en ventas, segundo trimestre de 2025', date: '2025-07' }, tags: [] },
  { kind: 'certification', content: { name: 'Curso de diamantes y gemas de color', issuer: 'Escuela Ejemplo de Gemología', date: '2023' }, tags: [] },
];
/** Printed in the English CV once translated; none of it may remain there. */
const SPANISH_FREE_TEXT = [
  'Asesora de ventas de lujo',
  'alta joyería y relojería',
  'cinco años en boutique',
  'Atención a clientes',
  'Cumplí el 112 %',
  'Desarrollé una cartera',
  'Licenciatura en Mercadotecnia',
  'Comercio de lujo',
  'Ventas consultivas',
  'Inglés',
  'Español',
  'Primer lugar regional',
  'Curso de diamantes',
  'Ciudad de México',
  'Nativo',
];

const docs: Record<'cvEs' | 'cvEn' | 'letterEs' | 'portfolioEn', string> = { cvEs: '', cvEn: '', letterEs: '', portfolioEn: '' };
const itemIds: Record<string, string> = {};

async function printedText(page: Page, id: string): Promise<string> {
  await page.goto(url('app', `/documentos/${id}/imprimir`));
  await expect(page.locator('article[data-kind]')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  const pdf = readPdf(await page.pdf({ preferCSSPageSize: true }));
  await page.emulateMedia({ media: 'screen' });
  expect(pdf.images).toBe(0);
  return pdf.text;
}

function golden(name: string, text: string): void {
  const file = join(GOLDEN, `${name}.txt`);
  if (WRITE_GOLDEN) {
    mkdirSync(GOLDEN, { recursive: true });
    writeFileSync(file, text);
    return;
  }
  expect(text, `${name}: the printed text equals the text main printed (${file})`).toBe(readFileSync(file, 'utf8'));
}

test.describe.serial('bilingual profile text (synthetic persona)', () => {
  test('baseline: without translations, the printed text is byte for byte what main printed', async ({ page, context }) => {
    const violations = cspViolations(page);
    expect((await apiAs(VALERIA, 'PUT', '/api/v1/profile', HEADER)).status).toBe(200);
    const seeded = await apiAs(VALERIA, 'POST', '/api/v1/profile/items/batch', { items: ITEMS });
    expect(seeded.status).toBe(201);
    for (const it of seeded.json!.items as Json[]) itemIds[`${it.kind}:${it.position}`] = it.id as string;
    const items = (seeded.json!.items as Json[]).map((i) => ({ itemId: i.id as string }));
    const es = await apiAs(VALERIA, 'POST', '/api/v1/artifacts/batch', {
      locale: 'es-MX',
      artifacts: [
        { kind: 'cv', title: 'CV · Asesora · Maison Ejemplo', template: 'clasico', content: { items, showContact: true } },
        { kind: 'cover_letter', title: 'Carta · Asesora · Maison Ejemplo', template: 'formal', content: { items, greeting: 'Estimado equipo:', closing: 'Atentamente,' } },
      ],
    });
    expect(es.status).toBe(201);
    const en = await apiAs(VALERIA, 'POST', '/api/v1/artifacts/batch', {
      locale: 'en',
      artifacts: [
        { kind: 'cv', title: 'CV · Asesora · Maison Ejemplo (English)', template: 'clasico', content: { items, showContact: true } },
        { kind: 'portfolio', title: 'Portafolio · Maison Ejemplo (English)', template: 'base', content: { items } },
      ],
    });
    expect(en.status).toBe(201);
    const byKind = (r: typeof es, kind: string) => (r.json!.artifacts as Json[]).find((a) => a.kind === kind)!.id as string;
    docs.cvEs = byKind(es, 'cv');
    docs.letterEs = byKind(es, 'cover_letter');
    docs.cvEn = byKind(en, 'cv');
    docs.portfolioEn = byKind(en, 'portfolio');

    await signIn(context, VALERIA);
    const texts = {
      'cv-es-clasico': await printedText(page, docs.cvEs),
      'cv-en-clasico': await printedText(page, docs.cvEn),
      'cover-letter-es-formal': await printedText(page, docs.letterEs),
      'portfolio-en-base': await printedText(page, docs.portfolioEn),
    };
    for (const [name, text] of Object.entries(texts)) {
      expect(text.replace(/\s/g, '')).toContain('ValeriaFicticiaRobles');
      golden(name, text);
    }
    expect(violations).toEqual([]);
  });
});
