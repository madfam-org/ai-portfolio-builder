/**
 * How many printed pages a document takes, estimated in the browser before printing (the print view's «unas N
 * páginas»), so a CV that spills onto a third page shows it before anyone opens the print dialog.
 *
 * The estimate lays out a hidden copy of the document at the PRINTABLE width with the stylesheet's own `@media print`
 * rules (re-scoped to the copy, so the screen never changes), then paginates it the way print does here: the page
 * holds `pageHeight` of content, and a unit that must not split (an entry, a compact line: `break-inside: avoid`)
 * moves whole to the next page when it does not fit. It stays an estimate (the browser's own pagination has the last
 * word), so the copy says «aprox.».
 */

/** The printable area of each named page (render.module.css `@page cvLetter` / `cvA4`: margins 15mm × 16mm), in mm. */
export const PRINT_AREA_MM = {
  letter: { width: 215.9 - 2 * 16, height: 279.4 - 2 * 15 },
  a4: { width: 210 - 2 * 16, height: 297 - 2 * 15 },
} as const;

export const PX_PER_MM = 96 / 25.4;

/** A block that must not split, by its top and bottom in px from the top of the document. */
export interface Unit {
  top: number;
  bottom: number;
}

/**
 * Pages for content `total` px tall with the given unsplittable units (in document order), on pages that hold
 * `pageHeight` px. A unit that crosses the end of a page and fits on one page starts the next page; a taller unit
 * flows. Never fewer than 1 page.
 */
export function paginate(units: readonly Unit[], total: number, pageHeight: number): number {
  if (!(pageHeight > 0)) return 1;
  let pageStart = 0;
  let pages = 1;
  // Content shifted down by units moved to a new page so far.
  let shift = 0;
  for (const u of units) {
    const top = u.top + shift;
    const bottom = u.bottom + shift;
    while (top >= pageStart + pageHeight) {
      pageStart += pageHeight;
      pages += 1;
    }
    if (bottom > pageStart + pageHeight && bottom - top <= pageHeight) {
      const next = pageStart + pageHeight;
      shift += next - top;
      pageStart = next;
      pages += 1;
    }
  }
  const end = total + shift;
  while (end > pageStart + pageHeight + 0.5) {
    pageStart += pageHeight;
    pages += 1;
  }
  return pages;
}

/** The `@media print` rules of the page's same-origin stylesheets, re-scoped under `scope` (a selector). */
export function printRulesScoped(sheets: ArrayLike<CSSStyleSheet>, scope: string): string[] {
  const out: string[] = [];
  const walk = (rules: CSSRuleList, inPrint: boolean) => {
    for (const rule of Array.from(rules)) {
      if (typeof CSSMediaRule !== 'undefined' && rule instanceof CSSMediaRule) {
        const media = rule.media.mediaText.toLowerCase();
        const print = media.includes('print') && !media.includes('not print');
        if (print || inPrint) walk(rule.cssRules, true);
      } else if (inPrint && typeof CSSStyleRule !== 'undefined' && rule instanceof CSSStyleRule) {
        const selectors = rule.selectorText
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s && !/(^|\s)(html|body)\b|:root/.test(s));
        if (selectors.length) out.push(`${selectors.map((s) => `${scope} ${s}`).join(', ')} { ${rule.style.cssText} }`);
      }
    }
  };
  for (const sheet of Array.from(sheets)) {
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      rules = null; // a cross-origin sheet: unreadable, and never one of ours
    }
    if (rules) walk(rules, false);
  }
  return out;
}

/**
 * Estimates the printed pages of `source` (the sheet holding the document) on `paper`, optionally as if it used
 * another template (`swap`: the classes of the current and the other template). Browser only. The hidden copy and its
 * scoped rules are removed before returning.
 */
export function estimatePrintedPages(source: HTMLElement, paper: keyof typeof PRINT_AREA_MM, swap?: { from: string; to: string }): number {
  const area = PRINT_AREA_MM[paper];
  const host = document.createElement('div');
  host.setAttribute('data-print-measure', '');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, { position: 'absolute', left: '-100000px', top: '0', width: `${area.width}mm`, visibility: 'hidden', pointerEvents: 'none' });
  const copy = source.cloneNode(true) as HTMLElement;
  copy.removeAttribute('id');
  for (const el of Array.from(copy.querySelectorAll('[id]'))) el.removeAttribute('id');
  Object.assign(copy.style, { padding: '0', border: '0', width: '100%', boxShadow: 'none' });
  // «What if this were another template»: the copy wears the other template's class instead of its own.
  if (swap) {
    const sheet = copy.querySelector<HTMLElement>('[data-template]') ?? copy;
    if (swap.from) sheet.classList.remove(swap.from);
    if (swap.to) sheet.classList.add(swap.to);
  }
  host.appendChild(copy);
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(printRulesScoped(document.styleSheets, '[data-print-measure]').join('\n'));
  const before = document.adoptedStyleSheets;
  document.adoptedStyleSheets = [...before, sheet];
  document.body.appendChild(host);
  try {
    const origin = copy.getBoundingClientRect().top;
    const units: Unit[] = [];
    for (const el of Array.from(copy.querySelectorAll<HTMLElement>('*'))) {
      const avoid = getComputedStyle(el).breakInside;
      if (avoid !== 'avoid' && avoid !== 'avoid-page') continue;
      const r = el.getBoundingClientRect();
      if (r.height > 0) units.push({ top: r.top - origin, bottom: r.bottom - origin });
    }
    // Outermost units only, in document order (a unit inside another moves with it).
    const outer = units.filter((u, i) => !units.some((v, j) => j !== i && v.top <= u.top && v.bottom >= u.bottom && (v.top < u.top || v.bottom > u.bottom)));
    outer.sort((a, b) => a.top - b.top);
    return paginate(outer, copy.getBoundingClientRect().height, area.height * PX_PER_MM);
  } finally {
    host.remove();
    document.adoptedStyleSheets = before;
  }
}
