/**
 * The CV templates' classes on the sheet (templates.module.css), in one small module: ArtifactView renders with them,
 * and the print view's page estimate swaps one for another without importing every renderer.
 */
import tpl from './templates.module.css';

export const CV_TEMPLATE_CLASS: Readonly<Record<string, string>> = { base: '', compacto: tpl.cvCompacto!, clasico: tpl.cvClasico! };

/** A CV template's class ('' for `base` or an unknown id). */
export function cvTemplateClass(template: string): string {
  return CV_TEMPLATE_CLASS[template] ?? '';
}
