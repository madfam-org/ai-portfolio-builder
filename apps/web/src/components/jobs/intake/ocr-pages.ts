/**
 * Reading images through tlacuilo, browser side: turn what the person picked (a photo, a screenshot, or a PDF with no
 * text layer) into page images small enough for cv's API, send them one by one, and join the text that comes back.
 *
 * Why here: cv's server never buffers more than 512 KiB of a request, so the browser does the shrinking. Each page is
 * drawn on a white canvas no larger than `LONG_EDGE` and encoded as JPEG, lowering quality and then size until it
 * fits `maxBytes`; a page of text stays legible far below a megabyte. The original file never leaves the browser.
 * PDF pages are drawn by pdf.js (the same lazy, main-thread build as pdf.ts). Nothing here stores anything.
 *
 * `sizeFor` and `joinPages` are pure (unit tested); the rest needs a DOM.
 */
export const LONG_EDGE = 2400;
export const MIN_LONG_EDGE = 1000;
const QUALITIES = [0.82, 0.7, 0.58, 0.46] as const;

export interface OcrLimits {
  maxPages: number;
  maxBytes: number;
}

export interface OcrStatus extends OcrLimits {
  enabled: boolean;
}

export type OcrVerdict = 'good' | 'fair' | 'poor';
export interface OcrPageText {
  lines: string[];
  confidence: number | null;
  verdict: OcrVerdict;
  truncated: boolean;
}

/** What went wrong, in the API's own words (`error`) plus the three things only the browser can know. */
export type OcrError = { code: string; retryAfter: number | null };
export type OcrOutcome = { ok: true; text: string; pages: number; totalPages: number; verdict: OcrVerdict } | { ok: false; error: OcrError };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
const defaultFetch: FetchLike = (i, init) => fetch(i, init);
const OCR_PATH = '/api/v1/jobs/intake/ocr';

/** Whether reading images is on. Any failure reads as off: the page then keeps its «aún no leemos imágenes». */
export async function ocrStatus(fetchImpl: FetchLike = defaultFetch): Promise<OcrStatus> {
  const off: OcrStatus = { enabled: false, maxPages: 0, maxBytes: 0 };
  try {
    const res = await fetchImpl(OCR_PATH, { cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!res.ok) return off;
    const j = (await res.json()) as Partial<OcrStatus>;
    if (j.enabled !== true || typeof j.maxPages !== 'number' || typeof j.maxBytes !== 'number' || j.maxPages < 1 || j.maxBytes < 50_000) return off;
    return { enabled: true, maxPages: Math.min(j.maxPages, 8), maxBytes: j.maxBytes };
  } catch {
    return off;
  }
}

/** The canvas size for a source of `width` × `height`: never enlarged, long edge at most `longEdge`. */
export function sizeFor(width: number, height: number, longEdge: number = LONG_EDGE): { width: number; height: number } {
  const long = Math.max(width, height);
  const k = long > longEdge ? longEdge / long : 1;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/** Pages joined as one text: lines as read, a blank line between pages. */
export function joinPages(pages: readonly OcrPageText[]): string {
  return pages
    .map((p) => p.lines.join('\n').trim())
    .filter(Boolean)
    .join('\n\n');
}

/** The weakest verdict of the pages read (one bad page is what the person must check). */
export function worstVerdict(pages: readonly OcrPageText[]): OcrVerdict {
  if (pages.some((p) => p.verdict === 'poor')) return 'poor';
  return pages.some((p) => p.verdict === 'fair') ? 'fair' : 'good';
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/** Encode what `draw` paints (at the size it is given) as a JPEG under `maxBytes`, or null when it cannot be. */
async function encode(width: number, height: number, maxBytes: number, draw: (canvas: HTMLCanvasElement, w: number, h: number) => Promise<void> | void): Promise<Blob | null> {
  let edge = LONG_EDGE;
  for (;;) {
    const size = sizeFor(width, height, edge);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size.width, size.height);
    await draw(canvas, size.width, size.height);
    for (const q of QUALITIES) {
      const blob = await toBlob(canvas, q);
      if (blob && blob.size <= maxBytes) return blob;
    }
    canvas.width = 0;
    canvas.height = 0;
    if (edge <= MIN_LONG_EDGE) return null;
    edge = Math.max(MIN_LONG_EDGE, Math.round(edge * 0.8));
  }
}

async function imagePage(file: Blob, maxBytes: number): Promise<Blob | null> {
  // `from-image`: a phone photo is drawn the way the person sees it (EXIF orientation applied).
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    return await encode(bitmap.width, bitmap.height, maxBytes, (canvas, w, h) => {
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
    });
  } finally {
    bitmap.close();
  }
}

async function pdfPages(file: Blob, limits: OcrLimits): Promise<{ pages: Blob[]; total: number } | null> {
  await import('pdfjs-dist/build/pdf.worker.min.mjs');
  const pdfjs = await import('pdfjs-dist');
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data, disableFontFace: true, useSystemFonts: false, useWasm: false, useWorkerFetch: false, isOffscreenCanvasSupported: false, stopAtErrors: false });
  const doc = await task.promise;
  try {
    const count = Math.min(doc.numPages, limits.maxPages);
    const pages: Blob[] = [];
    for (let n = 1; n <= count; n += 1) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const blob = await encode(base.width, base.height, limits.maxBytes, async (canvas, w) => {
        await page.render({ canvas, viewport: page.getViewport({ scale: w / base.width }), background: '#ffffff' }).promise;
      });
      page.cleanup();
      if (!blob) return null;
      pages.push(blob);
    }
    return { pages, total: doc.numPages };
  } finally {
    await task.destroy();
  }
}

async function postPage(blob: Blob, fetchImpl: FetchLike): Promise<{ ok: true; page: OcrPageText } | { ok: false; error: OcrError }> {
  let res: Response;
  try {
    res = await fetchImpl(OCR_PATH, { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'image/jpeg' }, body: blob });
  } catch {
    return { ok: false, error: { code: 'network', retryAfter: null } };
  }
  let j: Record<string, unknown> = {};
  try {
    j = (await res.json()) as Record<string, unknown>;
  } catch {
    j = {};
  }
  const page = j.page as OcrPageText | undefined;
  if (res.ok && page && Array.isArray(page.lines)) return { ok: true, page };
  return { ok: false, error: { code: typeof j.error === 'string' ? j.error : `http_${res.status}`, retryAfter: typeof j.retryAfter === 'number' ? j.retryAfter : null } };
}

/**
 * Read a picked image or scanned PDF: prepare its pages, send each, join the text. `onProgress(done, of)` is called
 * before each page is sent. A page that cannot be read fails the whole document (no half-read posting), except that a
 * blank later page is skipped.
 */
export async function readWithOcr(file: Blob, kind: 'image' | 'pdf', limits: OcrLimits, onProgress: (done: number, of: number) => void = () => {}, fetchImpl: FetchLike = defaultFetch): Promise<OcrOutcome> {
  let blobs: Blob[];
  let total = 1;
  try {
    if (kind === 'pdf') {
      const prepared = await pdfPages(file, limits);
      if (!prepared) return { ok: false, error: { code: 'page_too_large', retryAfter: null } };
      blobs = prepared.pages;
      total = prepared.total;
    } else {
      const blob = await imagePage(file, limits.maxBytes);
      if (!blob) return { ok: false, error: { code: 'page_too_large', retryAfter: null } };
      blobs = [blob];
    }
  } catch {
    return { ok: false, error: { code: 'unsupported_image', retryAfter: null } };
  }
  if (blobs.length === 0) return { ok: false, error: { code: 'ocr_unreadable', retryAfter: null } };
  const pages: OcrPageText[] = [];
  for (const [i, blob] of blobs.entries()) {
    onProgress(i, blobs.length);
    const out = await postPage(blob, fetchImpl);
    if (out.ok) pages.push(out.page);
    else if (out.error.code === 'ocr_unreadable' && pages.length > 0) continue;
    else return out;
  }
  const text = joinPages(pages);
  if (!text) return { ok: false, error: { code: 'ocr_unreadable', retryAfter: null } };
  return { ok: true, text, pages: pages.length, totalPages: total, verdict: worstVerdict(pages) };
}
