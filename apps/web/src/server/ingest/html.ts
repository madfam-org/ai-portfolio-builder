/**
 * W5-J: a small, tolerant HTML reader for job pages (no dependency, no DOM, no script execution). It builds a shallow
 * element tree good enough for what the intake reads: JSON-LD `<script>` blocks, `<meta>` tags, the canonical link,
 * schema.org microdata, the title and the page's readable text. It never evaluates anything and never fetches a
 * subresource. Malformed markup degrades to less structure, never to an exception.
 */

export interface El {
  tag: string;
  attrs: Record<string, string>;
  children: Node[];
}
export type Node = El | string;

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
/** Raw-text elements: their content is kept as one string (scripts are kept only to read JSON-LD). */
const RAW = new Set(['script', 'style', 'textarea', 'title', 'noscript', 'template', 'xmp']);
/** Elements a start tag of the same kind implicitly closes (enough for lists, paragraphs and tables in job pages). */
const AUTO_CLOSE: Record<string, readonly string[]> = { p: ['p'], li: ['li'], dt: ['dt', 'dd'], dd: ['dt', 'dd'], tr: ['tr'], td: ['td', 'th'], th: ['td', 'th'], option: ['option'] };

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', iexcl: '¡', iquest: '¿', middot: '·', bull: '•',
  ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  copy: '©', reg: '®', trade: '™', euro: '€', deg: '°', ordf: 'ª', ordm: 'º', times: '×', shy: '',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó',
  Uacute: 'Ú', ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü', agrave: 'à', egrave: 'è', ograve: 'ò', ccedil: 'ç',
  Ccedil: 'Ç', auml: 'ä', ouml: 'ö', Auml: 'Ä', Ouml: 'Ö', szlig: 'ß', acirc: 'â', ecirc: 'ê', ocirc: 'ô',
};

export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[A-Za-z][A-Za-z0-9]{1,15});?/g, (whole, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '�';
      return String.fromCodePoint(code);
    }
    return NAMED[ref] ?? whole;
  });
}

const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parseAttrs(src: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of src.matchAll(ATTR)) {
    const name = m[1]!.toLowerCase();
    if (!(name in attrs)) attrs[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/** Parses HTML into a root element. Comments, doctypes and processing instructions are dropped. */
export function parseHtml(html: string): El {
  const root: El = { tag: '#root', attrs: {}, children: [] };
  const stack: El[] = [root];
  const top = () => stack[stack.length - 1]!;
  // Linear by construction (no nested quantifiers): a start tag's attribute text is at most 4 000 characters and may not
  // contain `<` or `>` (an attribute value holding `>` degrades to less structure). Pages are hostile input.
  const TAG = /<!--[\s\S]*?(?:--!?>|$)|<![^<>]*>|<\?[^<>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)([^<>]{0,4000})>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG.exec(html))) {
    if (m.index > last) top().children.push(decodeEntities(html.slice(last, m.index)));
    last = TAG.lastIndex;
    const [, closing, opening, attrSrc = ''] = m;
    const selfClose = /\/\s*$/.test(attrSrc);
    if (closing) {
      const name = closing.toLowerCase();
      const at = stack.map((e) => e.tag).lastIndexOf(name);
      if (at > 0) stack.length = at;
      continue;
    }
    if (!opening) continue;
    const name = opening.toLowerCase();
    const closes = AUTO_CLOSE[name];
    if (closes && closes.includes(top().tag)) stack.pop();
    const el: El = { tag: name, attrs: parseAttrs(attrSrc.replace(/\/\s*$/, '')), children: [] };
    top().children.push(el);
    if (RAW.has(name)) {
      const endTag = new RegExp(`</${name}`, 'ig');
      endTag.lastIndex = last;
      const end = endTag.exec(html)?.index ?? -1;
      const stop = end === -1 ? html.length : end;
      const content = html.slice(last, stop);
      if (content) el.children.push(name === 'script' || name === 'style' ? content : decodeEntities(content));
      const close = end === -1 ? html.length : html.indexOf('>', end);
      last = close === -1 ? html.length : close + 1;
      TAG.lastIndex = last;
      continue;
    }
    if (!VOID.has(name) && !selfClose) stack.push(el);
  }
  if (last < html.length) top().children.push(decodeEntities(html.slice(last)));
  return root;
}

export function* walk(el: El): Generator<El> {
  for (const c of el.children) {
    if (typeof c === 'string') continue;
    yield c;
    yield* walk(c);
  }
}

export function find(el: El, pred: (e: El) => boolean): El | null {
  for (const e of walk(el)) if (pred(e)) return e;
  return null;
}

/** The raw (non-decoded) text of an element: for `<script>` it is the script source. */
export function rawText(el: El): string {
  return el.children.map((c) => (typeof c === 'string' ? c : rawText(c))).join('');
}

const SKIP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'head', 'nav', 'footer', 'form', 'button', 'select', 'iframe', 'object', 'canvas', 'textarea', 'title']);
const BLOCK = new Set([
  'p', 'div', 'section', 'article', 'main', 'header', 'aside', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'table', 'tr', 'td', 'th',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'hr', 'blockquote', 'pre', 'figure', 'figcaption', 'address',
]);

/** Readable text: block elements become line breaks (no blank lines), list items get «• », runs of whitespace collapse. */
export function textOf(el: El, opts: { skip?: ReadonlySet<string> } = {}): string {
  const skip = opts.skip ?? SKIP;
  const out: string[] = [];
  const visit = (node: Node) => {
    if (typeof node === 'string') {
      out.push(node.replace(/\s+/g, ' '));
      return;
    }
    if (skip.has(node.tag) || node.attrs.hidden !== undefined || node.attrs['aria-hidden'] === 'true') return;
    const block = BLOCK.has(node.tag);
    if (block) out.push('\n');
    if (node.tag === 'li') out.push('• ');
    node.children.forEach(visit);
    if (block) out.push('\n');
  };
  el.children.forEach(visit);
  return out
    .join('')
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter((l) => l !== '')
    .join('\n')
    .trim();
}

/** HTML fragment (a JSON-LD `description`, an ATS `content`) → readable text. */
export function htmlToText(fragment: string): string {
  if (!/[<&]/.test(fragment)) return fragment.trim();
  return textOf(parseHtml(fragment), { skip: new Set(['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'object']) });
}

export interface PageParts {
  title: string | null;
  canonical: string | null;
  meta: Record<string, string>;
  jsonLd: string[];
  /** The element carrying schema.org JobPosting microdata, if any. */
  microdataRoot: El | null;
  text: string;
}

const META_KEYS = /^(og:|twitter:|description$|article:published_time$)/;

/** Everything the extractors read from one page, in one pass over the tree. */
export function pageParts(html: string): PageParts {
  const root = parseHtml(html);
  let title: string | null = null;
  let canonical: string | null = null;
  const meta: Record<string, string> = {};
  const jsonLd: string[] = [];
  let microdataRoot: El | null = null;
  for (const e of walk(root)) {
    if (e.tag === 'title' && title === null) title = rawText(e).replace(/\s+/g, ' ').trim() || null;
    else if (e.tag === 'link' && /\bcanonical\b/i.test(e.attrs.rel ?? '') && e.attrs.href && canonical === null) canonical = e.attrs.href;
    else if (e.tag === 'meta') {
      const key = (e.attrs.property ?? e.attrs.name ?? '').toLowerCase();
      if (key && META_KEYS.test(key) && e.attrs.content && !(key in meta) && Object.keys(meta).length < 60) meta[key] = e.attrs.content.slice(0, 5000);
    } else if (e.tag === 'script' && (e.attrs.type ?? '').trim().toLowerCase() === 'application/ld+json') jsonLd.push(rawText(e));
    if (!microdataRoot && e.attrs.itemscope !== undefined && /schema\.org\/JobPosting/i.test(e.attrs.itemtype ?? '')) microdataRoot = e;
  }
  const main = find(root, (e) => e.tag === 'main') ?? find(root, (e) => e.tag === 'article') ?? microdataRoot ?? find(root, (e) => e.tag === 'body') ?? root;
  return { title, canonical, meta, jsonLd, microdataRoot, text: textOf(main) };
}

/**
 * schema.org microdata under `root` → a JSON-LD-like object (`@type` + properties), nested itemscopes included, so the
 * JSON-LD mapper reads both. Values: `content`, then `datetime`, `href`/`src`, then the element's text.
 */
export function microdataObject(root: El): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  const type = /schema\.org\/(\w+)/i.exec(root.attrs.itemtype ?? '')?.[1];
  if (type) obj['@type'] = type;
  const add = (name: string, value: unknown) => {
    const prev = obj[name];
    obj[name] = prev === undefined ? value : Array.isArray(prev) ? [...prev, value] : [prev, value];
  };
  const visit = (el: El) => {
    for (const c of el.children) {
      if (typeof c === 'string') continue;
      const props = (c.attrs.itemprop ?? '').split(/\s+/).filter(Boolean);
      const scoped = c.attrs.itemscope !== undefined;
      if (props.length) {
        const value = scoped
          ? microdataObject(c)
          : (c.attrs.content ?? c.attrs.datetime ?? (c.tag === 'a' || c.tag === 'link' ? c.attrs.href : undefined) ?? (c.tag === 'img' ? c.attrs.src : undefined) ?? (c.tag === 'meta' ? '' : textOf(c, { skip: new Set(['script', 'style']) })));
        for (const p of props) add(p, value);
      }
      if (!scoped) visit(c);
    }
  };
  visit(root);
  return obj;
}

const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string) => escapeText(s).replace(/"/g, '&quot;');

/**
 * An element back to (normalised, escaped) HTML: the browser sends a saved page's JobPosting microdata this way, read
 * with THIS parser (no DOMParser, no live DOM). Raw-text children (script, style) are dropped.
 */
export function serialize(el: El): string {
  const attrs = Object.entries(el.attrs)
    .filter(([k]) => /^[a-z][a-z0-9:_-]*$/.test(k) && !k.startsWith('on'))
    .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
    .join('');
  if (VOID.has(el.tag)) return `<${el.tag}${attrs}>`;
  const inner = RAW.has(el.tag) ? '' : el.children.map((c) => (typeof c === 'string' ? escapeText(c) : serialize(c))).join('');
  return `<${el.tag}${attrs}>${inner}</${el.tag}>`;
}
