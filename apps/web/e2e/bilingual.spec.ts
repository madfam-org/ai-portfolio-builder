/**
 * W7 (B4): bilingual profile text, end to end, with the SYNTHETIC persona «Valeria Ficticia Robles» (fictional; the
 * employer «Maison Ejemplo» and the school are invented). Spanish is the profile's language; English is written next
 * to it, field by field, in the profile editor.
 *
 * 1. Baseline: documents of a profile WITHOUT translations print the same text, byte for byte, as before W7-B4. The
 *    golden files under e2e/fixtures/bilingual/ are the print view's document text (DOM `textContent`, rendered by
 *    the server: no fonts, no layout, so identical on macOS and on CI's Linux) written by the build of `main` at
 *    f1ca3530 with this very test (`CV_E2E_WRITE_GOLDEN=1`); this build must produce the identical text. The PDF is
 *    checked separately where it is environment-independent (no images, Letter pages) and, within one run, the
 *    Spanish PDFs after translations exist must equal the same documents' PDFs before (normalised text, page count).
 *    The PDF text layer itself is NOT compared with a file: how Chromium's text layer splits small caps and wraps
 *    lines depends on the machine's fonts (macOS «Perfil profesional», Linux «P ERFIL PROFESIONAL»).
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
/** A fresh owner key per run, so a re-run on the same database starts from an empty profile. */
const VALERIA = { sub: `janua|e2e-bilingual-persona-${Date.now().toString(36)}`, name: 'Valeria Ficticia Robles', email: 'valeria@example.test' };
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
let jobId = '';

/**
 * A text compared across PDF text layers: Unicode NFKC, case-folded, every whitespace removed (small caps and line
 * wrapping differ between machines; the words and their order do not).
 */
const norm = (text: string) => text.normalize('NFKC').toLowerCase().replace(/\s/g, '');

interface Printed {
  /** The print view's document text as the server rendered it (DOM textContent): exact, machine-independent. */
  text: string;
  /** The PDF's text layer, normalised (`norm`), and its page count: comparable within one machine. */
  pdfText: string;
  pages: number;
}

/** The print view of a document: its exact text, and the PDF Chromium prints from it (Letter, no images). */
async function printed(page: Page, id: string): Promise<Printed> {
  await page.goto(url('app', `/documentos/${id}/imprimir`));
  const doc = page.locator('article[data-kind]');
  await expect(doc).toBeVisible();
  const text = await doc.evaluate((el) => el.textContent ?? '');
  await page.emulateMedia({ media: 'print' });
  const pdf = readPdf(await page.pdf({ preferCSSPageSize: true }));
  await page.emulateMedia({ media: 'screen' });
  expect(pdf.images).toBe(0);
  expect(pdf.pages).toBeGreaterThan(0);
  for (const size of pdf.sizes) expect(size.map(Math.round)).toEqual([612, 792]);
  return { text, pdfText: norm(pdf.text), pages: pdf.pages };
}

/** The baseline run's PDFs (same machine, same run): the Spanish documents must print them again later. */
const baselinePdf: Record<string, Pick<Printed, 'pdfText' | 'pages'>> = {};

/** The tailoring workspace: every profile item into the selection («Agregar» until none is left). */
async function addEverything(page: Page): Promise<void> {
  await expect(page.getByTestId('tailor-selected')).toBeVisible();
  const available = page.getByTestId('tailor-available').getByRole('button');
  for (let n = await available.count(); n > 0; n = await available.count()) {
    await available.first().click();
    await expect(available).toHaveCount(n - 1);
  }
}

function golden(name: string, text: string): void {
  const file = join(GOLDEN, `${name}.txt`);
  if (WRITE_GOLDEN) {
    mkdirSync(GOLDEN, { recursive: true });
    writeFileSync(file, text);
    return;
  }
  expect(text, `${name}: the document text equals the text main rendered (${file})`).toBe(readFileSync(file, 'utf8'));
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
    const prints = {
      'cv-es-clasico': await printed(page, docs.cvEs),
      'cv-en-clasico': await printed(page, docs.cvEn),
      'cover-letter-es-formal': await printed(page, docs.letterEs),
      'portfolio-en-base': await printed(page, docs.portfolioEn),
    };
    for (const [name, p] of Object.entries(prints)) {
      expect(p.text).toContain('Valeria Ficticia Robles');
      expect(p.pdfText, `${name}: the PDF carries the document's text`).toContain(norm('Valeria Ficticia Robles'));
      expect(p.pdfText).toContain(norm(name.includes('-es-') ? 'Asesora de ventas de lujo' : 'Maison Ejemplo'));
      golden(name, p.text);
      baselinePdf[name] = { pdfText: p.pdfText, pages: p.pages };
    }
    expect(violations).toEqual([]);
  });

  test('editor: «Español | English» per form; the header and an experience written in English; the language from the list', async ({ page, context }) => {
    const violations = cspViolations(page);
    await signIn(context, VALERIA);
    await page.goto(url('app', '/perfil'));
    const header = page.getByTestId('perfil-language');
    await expect(header.getByLabel('Español (principal)')).toBeChecked();
    await expect(page.getByTestId('perfil-missing')).toHaveText('Faltan 3 textos en inglés');
    await shot(page, '1-editor-es');
    await header.getByLabel('English').check();
    await expect(page.getByLabel('Titular en inglés')).toBeVisible();
    await expect(page.getByLabel('Titular', { exact: true })).toBeHidden();
    await expect(page.getByTestId('perfil-translation')).toContainText(`Texto en español: ${HEADER.headline}`);
    await expect(page.getByTestId('perfil-translation')).toContainText('Sin traducción automática');
    await page.getByLabel('Titular en inglés').fill('Luxury sales advisor · fine jewellery and watches');
    await page.getByLabel('Resumen en inglés').fill('Luxury sales advisor with five years in a boutique, her own client book and service in Spanish and English.');
    await page.getByLabel('Ciudad o región en inglés').fill('Mexico City');
    await expect(page.getByTestId('perfil-missing')).toHaveCount(0);
    await page.getByRole('button', { name: 'Guardar perfil' }).click();
    await expect(page.getByTestId('header-state')).toHaveText('Perfil guardado.');

    const experience = page.getByTestId('section-experience').getByTestId('profile-item');
    await expect(experience.getByTestId('item-missing-translation')).toHaveText('Faltan 4 textos en inglés');
    await page.getByRole('button', { name: 'Editar «Asesora de ventas de lujo»' }).click();
    const form = page.getByTestId(`form-experience-${itemIds['experience:0']}`);
    const formSwitch = form.getByTestId(`form-experience-${itemIds['experience:0']}-language`);
    // Keyboard: the switch is one radio group; the arrow key moves to English.
    await formSwitch.getByLabel('Español (principal)').focus();
    await page.keyboard.press('ArrowRight');
    await expect(formSwitch.getByLabel('English')).toBeChecked();
    await form.getByRole('button', { name: 'Copiar el texto en español como punto de partida' }).click();
    await expect(form.getByLabel('Puesto en inglés')).toHaveValue('Asesora de ventas de lujo');
    await form.getByLabel('Puesto en inglés').fill('Luxury sales advisor');
    await form.getByLabel('Ubicación en inglés').fill('Mexico City');
    await form.getByLabel('Descripción en inglés').fill('Serving local and international clients in a fine jewellery boutique.');
    await form.getByLabel('Logros y responsabilidades en inglés').fill('Reached 112% of my annual sales target in 2025.\nBuilt a book of 150 active clients.');
    await shot(page, '2-editor-en');
    await form.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect(experience.getByTestId('item-missing-translation')).toHaveCount(0);

    const languages = page.getByTestId('section-language').getByTestId('profile-item');
    await page.getByRole('button', { name: 'Editar «Inglés»' }).click();
    const langForm = page.getByTestId(`form-language-${itemIds['language:3']}`);
    await expect(langForm.getByTestId(`form-language-${itemIds['language:3']}-language`)).toHaveCount(0);
    await langForm.getByLabel('Idioma', { exact: true }).selectOption('en');
    await expect(langForm.getByLabel('Nombre del idioma (obligatorio)')).toHaveValue('Inglés');
    await langForm.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect(languages.first().getByTestId('item-missing-translation')).toHaveCount(0);
    await expect(languages.nth(1).getByTestId('item-missing-translation')).toHaveText('Falta 1 texto en inglés');

    const stored = (await apiAs(VALERIA, 'GET', '/api/v1/profile')).json!;
    expect(stored.profile.translations.en.location).toBe('Mexico City');
    const exp = (stored.items as Json[]).find((i) => i.id === itemIds['experience:0'])!;
    expect(exp.content.role).toBe('Asesora de ventas de lujo');
    expect(exp.translations.en.highlights).toEqual(['Reached 112% of my annual sales target in 2025.', 'Built a book of 150 active clients.']);
    expect((stored.items as Json[]).find((i) => i.id === itemIds['language:3'])!.content.code).toBe('en');
    expect((await apiAs(OWNER_B, 'GET', `/api/v1/profile/items/${itemIds['experience:0']}`)).status).toBe(404);
    expect(violations).toEqual([]);
  });

  test('fallback and flag: what lacks English prints in Spanish; preview and tailoring say «Faltan N textos en inglés», print never', async ({ page, context }) => {
    const violations = cspViolations(page);
    await signIn(context, VALERIA);
    await page.goto(url('app', `/documentos/${docs.cvEn}/vista-previa`));
    const flag = page.getByTestId('missing-translations');
    // Education (degree, field), skill, the Spanish language (no code yet), achievement and certification.
    await expect(flag.getByRole('heading')).toHaveText('Faltan 6 textos en inglés');
    await expect(flag).toContainText('Donde falta el texto en inglés, el documento usa el texto en español.');
    await expect(flag).toContainText('Este aviso no aparece en el documento impreso');
    await expect(page.locator('article[data-kind="cv"]')).toContainText('Licenciatura en Mercadotecnia');
    await shot(page, '3-preview-flag');

    const fallback = await printed(page, docs.cvEn);
    for (const flat of [norm(fallback.text), fallback.pdfText]) {
      expect(flat).toContain(norm('Luxury sales advisor'));
      expect(flat).toContain(norm('Licenciatura en Mercadotecnia'));
      for (const word of ['Faltan', 'textos', 'aviso']) expect(flat).not.toContain(norm(word));
    }

    await page.goto(url('app', `/documentos/${docs.cvEn}/vista-previa`));
    await page.getByTestId('missing-translations').getByRole('link', { name: 'Licenciatura en Mercadotecnia (Educación)' }).click();
    await page.waitForURL(new RegExp(`/perfil#traducir-${itemIds['education:1']}$`));
    const eduForm = page.getByTestId(`form-education-${itemIds['education:1']}`);
    await expect(eduForm.getByLabel('Título o grado en inglés')).toBeVisible();
    await expect(eduForm.getByRole('heading', { name: 'Editar estudios' })).toBeFocused();

    const job = await apiAs(VALERIA, 'POST', '/api/v1/jobs', { title: 'Client Advisor', company: 'Maison Ejemplo', sourceText: 'Client Advisor para boutique de alta joyería: clienteling, CRM, ventas consultivas, inglés avanzado.' });
    expect(job.status).toBe(201);
    jobId = job.json!.job.id as string;
    await page.goto(url('app', `/empleos/${jobId}/adaptar`));
    await addEverything(page);
    await expect(page.getByTestId('missing-translations')).toHaveCount(0);
    await page.getByTestId('tailor-language').getByRole('radio', { name: 'Inglés' }).check();
    const tailorFlag = page.getByTestId('missing-translations');
    await expect(tailorFlag.getByRole('heading')).toHaveText('Faltan 6 textos en inglés');
    // A per-job override replaces a text for this document: it no longer lacks English.
    const skill = page.getByTestId('tailor-selected').getByTestId('tailor-entry').filter({ hasText: 'Ventas consultivas' });
    await skill.getByText('Ajustar el texto para este empleo').click();
    await skill.getByLabel('Título para este empleo').fill('Consultative selling');
    await expect(tailorFlag.getByRole('heading')).toHaveText('Faltan 5 textos en inglés');
    await shot(page, '4-tailor-flag');
    // Overrides belong to one language: back in Spanish the override is put away, and returns in English.
    await page.getByTestId('tailor-language').getByRole('radio', { name: 'Español (México)' }).check();
    await expect(page.getByTestId('missing-translations')).toHaveCount(0);
    await page.getByTestId('tailor-language').getByRole('radio', { name: 'Inglés' }).check();
    await skill.getByText('Ajustar el texto para este empleo').click();
    await expect(skill.getByLabel('Título para este empleo')).toHaveValue('Consultative selling');
    expect(violations).toEqual([]);
  });

  test('complete: the English «Clásica» CV prints the English text and none of the Spanish; the Spanish documents print the golden text', async ({ page, context }) => {
    const violations = cspViolations(page);
    const patch = async (key: string, body: unknown) => expect((await apiAs(VALERIA, 'PATCH', `/api/v1/profile/items/${itemIds[key]}`, body)).status).toBe(200);
    await patch('education:1', { translations: { en: { degree: 'Bachelor’s degree in Marketing', field: 'Luxury retail' } } });
    await patch('skill:2', { translations: { en: { name: 'Consultative selling' } } });
    await patch('language:4', { content: { code: 'es', name: 'Español', level: 'native' } });
    await patch('achievement:5', { translations: { en: { title: 'First place in regional sales, second quarter of 2025' } } });
    await patch('certification:6', { translations: { en: { name: 'Diamonds and coloured gemstones course' } } });

    await signIn(context, VALERIA);
    await page.goto(url('app', `/empleos/${jobId}/adaptar`));
    await addEverything(page);
    for (const kind of ['Portafolio', 'Presentación']) await page.getByLabel(kind, { exact: true }).uncheck();
    await page.getByRole('group', { name: 'Plantilla: CV' }).getByRole('radio', { name: /^Clásica/ }).check();
    await page.getByTestId('tailor-language').getByRole('radio', { name: 'Inglés' }).check();
    await page.getByLabel('Incluir mis datos de contacto', { exact: false }).check();
    await expect(page.getByTestId('missing-translations')).toHaveCount(0);
    await page.getByRole('button', { name: 'Crear documentos para este empleo' }).click();
    await expect(page.getByTestId('tailor-created')).toContainText('se crearon 1 borradores');
    const created = ((await apiAs(VALERIA, 'GET', `/api/v1/artifacts?job_id=${jobId}`)).json!.artifacts as Json[]).find((a) => a.locale === 'en' && a.kind === 'cv')!;
    expect(created.template).toBe('clasico');

    for (const id of [created.id as string, docs.cvEn]) {
      await page.goto(url('app', `/documentos/${id}/vista-previa`));
      await expect(page.getByTestId('missing-translations')).toHaveCount(0);
      const doc = page.locator('article[data-kind="cv"]');
      await expect(doc).toHaveAttribute('lang', 'en');
      await expect(doc.getByRole('heading', { name: 'Experience' })).toBeVisible();
      if (id === docs.cvEn) await shot(page, '5-preview-en');
      const p = await printed(page, id);
      // The same checks on the document's text and on the PDF's text layer (normalised).
      for (const flat of [norm(p.text), p.pdfText]) {
        for (const en of [
          'Luxury sales advisor · fine jewellery and watches',
          'with five years in a boutique',
          'Reached 112% of my annual sales target in 2025.',
          'Bachelor’s degree in Marketing, Luxury retail',
          'Consultative selling',
          'English',
          'Spanish',
          'Native',
          'First place in regional sales',
          'Diamonds and coloured gemstones course',
          'Mexico City',
          'Feb 2021 – Present',
          'Maison Ejemplo',
          'Universidad Ejemplo',
        ]) {
          expect(flat, `${id}: ${en}`).toContain(norm(en));
        }
        for (const es of SPANISH_FREE_TEXT) expect(flat, `${id}: no «${es}»`).not.toContain(norm(es));
      }
    }

    // The Spanish documents of the same (now bilingual) profile: exactly main's text, and the same PDF as before the
    // translations existed (same machine, same run: normalised text layer and page count).
    for (const [name, id] of [
      ['cv-es-clasico', docs.cvEs],
      ['cover-letter-es-formal', docs.letterEs],
    ] as const) {
      const p = await printed(page, id);
      golden(name, p.text);
      expect(p.pdfText, `${name}: the PDF text is the baseline's`).toBe(baselinePdf[name]!.pdfText);
      expect(p.pages, `${name}: the page count is the baseline's`).toBe(baselinePdf[name]!.pages);
    }
    await page.goto(url('app', `/documentos/${docs.cvEs}/vista-previa`));
    await expect(page.getByTestId('missing-translations')).toHaveCount(0);
    await shot(page, '6-preview-es');
    expect((await apiAs(OWNER_B, 'GET', `/api/v1/artifacts/${created.id}`)).status).toBe(404);
    expect(violations).toEqual([]);
  });
});
