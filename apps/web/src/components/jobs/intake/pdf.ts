/**
 * W5-J: the text layer of a PDF posting, read in the browser with Mozilla's pdf.js (pdfjs-dist, Apache-2.0), loaded
 * ONLY when the person picks a PDF (dynamic import: no other page downloads it).
 *
 * pdf.js runs on the main thread ("fake worker": the worker module is imported as a chunk, so no Worker, blob: or
 * eval is needed and cv-app's CSP stays as it is), with no font loading, no WebAssembly and no network (no CMap,
 * font or wasm URL is given; `useWorkerFetch: false`). A PDF with (almost) no text is reported as scanned: its pages
 * can then be read through tlacuilo when that is on (ocr-pages.ts), never by an OCR engine of cv's own.
 *
 * `isEvalSupported` is deliberately absent: pdf.js 6 removed that option together with its eval-compiled font path
 * (the 6.4.299 build has no `eval` or `new Function`; test/ingest-client.test.ts guards it, and the e2e asserts no CSP
 * violation on a PDF pick). Passing it is a type error in pdfjs-dist 6.
 */

export interface PdfText {
  text: string;
  pages: number;
}

export const PDF_LIMITS = { maxBytes: 20 * 1024 * 1024, maxPages: 30, minChars: 40 } as const;

export class ScannedPdfError extends Error {}

interface TextItemLike {
  str?: string;
  hasEOL?: boolean;
}

/** One run of text as pdf.js places it: origin (PDF points, y up), font size and advance width. */
export interface PdfRun {
  str: string;
  x: number;
  y: number;
  size: number;
  width: number;
  eol: boolean;
}

export interface PdfPageRuns {
  width: number;
  height: number;
  runs: PdfRun[];
}

interface PositionedItemLike extends TextItemLike {
  transform?: number[];
  width?: number;
}

/** Opens the PDF with pdf.js (main thread, no network, no fonts) and hands each page's text items to `onPage`. */
async function eachPage(file: Blob, onPage: (items: PositionedItemLike[], view: number[]) => void): Promise<number> {
  // The worker module defines globalThis.pdfjsWorker; pdf.js then runs it in this thread instead of a Worker.
  await import('pdfjs-dist/build/pdf.worker.min.mjs');
  const pdfjs = await import('pdfjs-dist');
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data, disableFontFace: true, useSystemFonts: false, useWasm: false, useWorkerFetch: false, isOffscreenCanvasSupported: false, stopAtErrors: false });
  const doc = await task.promise;
  try {
    const pages = Math.min(doc.numPages, PDF_LIMITS.maxPages);
    for (let n = 1; n <= pages; n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      onPage(content.items as PositionedItemLike[], page.view);
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

export async function readPdfText(file: Blob): Promise<PdfText> {
  const out: string[] = [];
  const pages = await eachPage(file, (items) => {
    let line = '';
    for (const item of items) {
      line += item.str ?? '';
      if (item.hasEOL) {
        out.push(line);
        line = '';
      }
    }
    if (line) out.push(line);
    out.push('');
  });
  const text = out
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.replace(/\s/g, '').length < PDF_LIMITS.minChars) throw new ScannedPdfError('no text layer');
  return { text, pages };
}

/**
 * The text runs of each page WITH their positions and sizes (the LinkedIn profile PDF import needs its two columns and
 * its heading sizes: components/import/linkedin-pdf.ts). Same pdf.js settings and limits as `readPdfText`.
 */
export async function readPdfRuns(file: Blob): Promise<PdfPageRuns[]> {
  const out: PdfPageRuns[] = [];
  let chars = 0;
  await eachPage(file, (items, view) => {
    const runs: PdfRun[] = [];
    for (const item of items) {
      const t = item.transform;
      if (typeof item.str !== 'string' || !t || t.length < 6) continue;
      chars += item.str.replace(/\s/g, '').length;
      runs.push({ str: item.str, x: t[4]!, y: t[5]!, size: Math.hypot(t[2]!, t[3]!) || Math.abs(t[0]!), width: item.width ?? 0, eol: item.hasEOL === true });
    }
    out.push({ width: (view[2] ?? 612) - (view[0] ?? 0), height: (view[3] ?? 792) - (view[1] ?? 0), runs });
  });
  if (chars < PDF_LIMITS.minChars) throw new ScannedPdfError('no text layer');
  return out;
}
