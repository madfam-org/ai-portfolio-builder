/**
 * W5-J «Capturar desde tu navegador»: what the person's OWN browser takes from a page they have open, and how it reaches
 * cv-app. No dependency; usable in the browser and in Node tests (relative imports only).
 *
 * Transport: the bookmarklet opens `https://<cv-app>/empleos/capturar#<payload>` in a new tab. The payload rides in the
 * URL FRAGMENT, which browsers never send to any server (no request carries it, no Referer contains it); the capture
 * page reads it, drops it from the address bar (`history.replaceState`) and shows a preview. cv-app's
 * Cross-Origin-Opener-Policy: same-origin severs the opener, so there is no window channel to the job site at all, and
 * cv-app's CSP and same-origin checks stay exactly as they are. Nothing is stored until the person confirms on cv-app.
 *
 * Payload: `z.` + base64url(deflate-raw(JSON)) when the page's browser has CompressionStream, else `j.` + base64url(JSON).
 */

export interface CapturePayload {
  v: 1;
  url: string | null;
  canonical: string | null;
  title: string;
  jsonLd: string[];
  meta: Record<string, string>;
  microdata: string;
  text: string;
}

/** Caps the capture page applies before sending (the API reads at most 256 KiB per request). */
export const CAPTURE_LIMITS = { fragmentChars: 2_000_000, inflatedBytes: 1_500_000, bodyBytes: 240_000 } as const;

export class CaptureError extends Error {
  readonly code: 'empty' | 'too_large' | 'corrupt';
  constructor(code: 'empty' | 'too_large' | 'corrupt') {
    super(`capture: ${code}`);
    this.code = code;
  }
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function inflate(bytes: Uint8Array, max: number): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      throw new CaptureError('too_large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const strOrNull = (v: unknown, max: number): string | null => (typeof v === 'string' && v ? v.slice(0, max) : null);

/** Untrusted input (any page could open the capture URL): kept to the known shape and sizes, nothing else. */
export function sanitizePayload(raw: unknown): CapturePayload {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const meta: Record<string, string> = {};
  if (typeof o.meta === 'object' && o.meta !== null) {
    for (const [k, v] of Object.entries(o.meta as Record<string, unknown>).slice(0, 60)) if (typeof v === 'string') meta[k.slice(0, 100)] = v.slice(0, 5000);
  }
  const jsonLd = Array.isArray(o.jsonLd) ? o.jsonLd.filter((x): x is string => typeof x === 'string').slice(0, 10).map((x) => x.slice(0, 200_000)) : [];
  const payload: CapturePayload = {
    v: 1,
    url: strOrNull(o.url, 2000),
    canonical: strOrNull(o.canonical, 2000),
    title: str(o.title, 500),
    jsonLd,
    meta,
    microdata: str(o.microdata, 200_000),
    text: str(o.text, 120_000),
  };
  if (!payload.text.trim() && payload.jsonLd.length === 0 && !payload.microdata) throw new CaptureError('empty');
  return payload;
}

/** The fragment (with or without `#`) → the payload. */
export async function decodeFragment(hash: string): Promise<CapturePayload> {
  const h = hash.replace(/^#/, '');
  if (!h) throw new CaptureError('empty');
  if (h.length > CAPTURE_LIMITS.fragmentChars) throw new CaptureError('too_large');
  const kind = h.slice(0, 2);
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(h.slice(2));
  } catch {
    throw new CaptureError('corrupt');
  }
  try {
    if (kind === 'z.') bytes = await inflate(bytes, CAPTURE_LIMITS.inflatedBytes);
    else if (kind !== 'j.') throw new CaptureError('corrupt');
    if (bytes.length > CAPTURE_LIMITS.inflatedBytes) throw new CaptureError('too_large');
    return sanitizePayload(JSON.parse(new TextDecoder().decode(bytes)) as unknown);
  } catch (err) {
    if (err instanceof CaptureError) throw err;
    throw new CaptureError('corrupt');
  }
}

/** The payload → a fragment, the way the bookmarklet builds it (tests; the HTML-file path sends the capture directly). */
export async function encodeFragment(payload: CapturePayload, compress = true): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  if (!compress) return `j.${toBase64Url(json)}`;
  const stream = new Blob([json as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return `z.${toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()))}`;
}

const bytesOf = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

/** Trims a capture so the intake request stays under the API's body cap: microdata first, then the text, then JSON-LD. */
export function fitCapture(p: CapturePayload, max: number = CAPTURE_LIMITS.bodyBytes): Omit<CapturePayload, 'v'> {
  const { v: _v, ...c } = p;
  const body = (x: typeof c) => ({ source: 'capture', kind: 'capture', capture: x });
  if (bytesOf(body(c)) <= max) return c;
  let out = { ...c, microdata: '' };
  if (out.jsonLd.length > 1) out = { ...out, jsonLd: out.jsonLd.filter((x) => /JobPosting/.test(x)).slice(0, 2) };
  while (bytesOf(body(out)) > max && out.text.length > 1000) out = { ...out, text: out.text.slice(0, Math.floor(out.text.length * 0.75)) };
  while (bytesOf(body(out)) > max && out.jsonLd.length > 0) out = { ...out, jsonLd: out.jsonLd.slice(0, -1) };
  return out;
}

/**
 * The same reading as the bookmarklet, over a parsed Document (an .html file the person picks, parsed with DOMParser
 * in the browser: inert, no script runs, no subresource loads).
 */
export function captureFromDocument(doc: Document, url: string | null): CapturePayload {
  const jsonLd = [...doc.querySelectorAll('script[type="application/ld+json"]')]
    .map((s) => s.textContent ?? '')
    .filter((t) => /JobPosting/.test(t))
    .slice(0, 5);
  const meta: Record<string, string> = {};
  for (const m of [...doc.querySelectorAll('meta[property^="og:"],meta[name="description"],meta[name^="twitter:"]')].slice(0, 40)) {
    const k = m.getAttribute('property') ?? m.getAttribute('name');
    const v = m.getAttribute('content');
    if (k && v) meta[k] = v;
  }
  const md = doc.querySelector('[itemtype*="schema.org/JobPosting"]');
  const root = doc.querySelector('main') ?? doc.querySelector('article') ?? doc.body;
  for (const el of [...(root?.querySelectorAll('script,style,noscript,template,nav,footer,form,svg') ?? [])]) el.remove();
  const text = root ? blockText(root) : '';
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;
  return { v: 1, url, canonical, title: doc.title ?? '', jsonLd, meta, microdata: md ? md.outerHTML.slice(0, 150_000) : '', text: text.slice(0, 60_000) };
}

const BLOCK = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'ASIDE', 'UL', 'OL', 'LI', 'DL', 'DT', 'DD', 'TABLE', 'TR', 'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BR', 'HR', 'BLOCKQUOTE', 'PRE']);

/** Readable text of an element without layout (a parsed document is never rendered): blocks become line breaks. */
export function blockText(root: Element): string {
  const out: string[] = [];
  const visit = (n: Node) => {
    if (n.nodeType === 3) {
      out.push((n.nodeValue ?? '').replace(/\s+/g, ' '));
      return;
    }
    if (n.nodeType !== 1) return;
    const el = n as Element;
    if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return;
    const block = BLOCK.has(el.tagName);
    if (block) out.push('\n');
    if (el.tagName === 'LI') out.push('• ');
    el.childNodes.forEach(visit);
    if (block) out.push('\n');
  };
  visit(root);
  return out
    .join('')
    .split('\n')
    .map((l) => l.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 60_000);
}

