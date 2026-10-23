/**
 * W7 (B4): every (kind, template, locale) the renderers draw, over the shared fixtures WITHOUT translations, as markup
 * hashes. test/render-bilingual.test.ts compares them with test/fixtures/bilingual/render-baseline.json, written by
 * this same matrix on `main` at cab8e0d0 (before bilingual profile text existed): a profile without translations
 * renders byte for byte what it rendered before. Test-only; register render-loader.mjs before importing.
 */
import { createHash } from 'node:crypto';
import { CONTACT, data } from './render-fixtures.ts';

export const MATRIX_SELECTION = {
  summary: 'Resumen adaptado al puesto',
  items: [{ itemId: 'e1', override: { title: 'Líder de datos', highlights: ['Logro adaptado'] } }, { itemId: 'e2' }, { itemId: 'd1' }, { itemId: 's1' }, { itemId: 's2' }, { itemId: 'l1' }, { itemId: 'p1' }, { itemId: 'c1' }, { itemId: 'x1' }],
  blocks: [{ heading: 'Por qué Acme', body: 'Primer párrafo\n\nSegundo párrafo' }],
  showContact: true,
  intro: 'Hola, soy Ana',
  greeting: 'Estimado equipo:',
  closing: 'Saludos,',
};

export const MATRIX_KINDS = ['cv', 'portfolio', 'presentation', 'cover_letter'] as const;
export const MATRIX_LOCALES = ['es-MX', 'en'] as const;

type Render = (d: ReturnType<typeof data>) => string;

/** `kind/template/locale/contact|nocontact` → sha256 of the markup. */
export function renderMatrix(render: Render, templatesFor: (kind: (typeof MATRIX_KINDS)[number]) => string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const kind of MATRIX_KINDS) {
    for (const template of templatesFor(kind)) {
      for (const locale of MATRIX_LOCALES) {
        for (const withContact of [true, false]) {
          const content = { ...MATRIX_SELECTION, showContact: withContact };
          const html = render(data(kind, content, { locale, template, ...(withContact ? { contact: CONTACT } : {}) }));
          out[`${kind}/${template}/${locale}/${withContact ? 'contact' : 'nocontact'}`] = createHash('sha256').update(html).digest('hex');
        }
      }
    }
  }
  return out;
}
