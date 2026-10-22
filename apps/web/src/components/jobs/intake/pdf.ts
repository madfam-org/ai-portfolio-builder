/**
 * W5-J: the text layer of a PDF posting, read in the browser with Mozilla's pdf.js (pdfjs-dist, Apache-2.0), loaded
 * ONLY when the person picks a PDF (dynamic import: no other page downloads it).
 *
 * pdf.js runs on the main thread ("fake worker": the worker module is imported as a chunk, so no Worker, blob: or
 * eval is needed and cv-app's CSP stays as it is), with no font loading, no WebAssembly and no network (no CMap,
 * font or wasm URL is given; `useWorkerFetch: false`). A PDF with (almost) no text is reported as scanned: OCR
 * belongs to tlacuilo and is not available yet (server/ingest/seams.ts).
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

export async function readPdfText(file: Blob): Promise<PdfText> {
  // The worker module defines globalThis.pdfjsWorker; pdf.js then runs it in this thread instead of a Worker.
  await import('pdfjs-dist/build/pdf.worker.min.mjs');
  const pdfjs = await import('pdfjs-dist');
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data, disableFontFace: true, useSystemFonts: false, useWasm: false, useWorkerFetch: false, isOffscreenCanvasSupported: false, stopAtErrors: false });
  const doc = await task.promise;
  try {
    const pages = Math.min(doc.numPages, PDF_LIMITS.maxPages);
    const out: string[] = [];
    for (let n = 1; n <= pages; n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let line = '';
      for (const item of content.items as TextItemLike[]) {
        line += item.str ?? '';
        if (item.hasEOL) {
          out.push(line);
          line = '';
        }
      }
      if (line) out.push(line);
      out.push('');
      page.cleanup();
    }
    const text = out
      .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (text.replace(/\s/g, '').length < PDF_LIMITS.minChars) throw new ScannedPdfError('no text layer');
    return { text, pages };
  } finally {
    await task.destroy();
  }
}
