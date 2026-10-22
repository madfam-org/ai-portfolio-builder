/**
 * TEST-ONLY: reads what a Chromium `page.pdf()` contains, to prove the print view yields REAL text (the text layer ATS
 * parsers read) on the chosen paper. Minimal on purpose: FlateDecode streams, ToUnicode CMaps (bfchar/bfrange) and
 * hex-string text operators per font; enough for Skia's output, not a general PDF parser.
 */
import { inflateSync } from 'node:zlib';

interface PdfObject {
  dict: string;
  stream: Buffer | null;
}

function objects(pdf: Buffer): Map<number, PdfObject> {
  const text = pdf.toString('latin1');
  const out = new Map<number, PdfObject>();
  for (const m of text.matchAll(/(\d+) 0 obj([\s\S]*?)endobj/g)) {
    const body = m[2]!;
    const at = body.search(/stream\r?\n/);
    if (at === -1) {
      out.set(Number(m[1]), { dict: body, stream: null });
      continue;
    }
    const start = body.indexOf('\n', at) + 1;
    const end = body.lastIndexOf('endstream');
    const raw = Buffer.from(body.slice(start, end).replace(/\r?\n$/, ''), 'latin1');
    let stream: Buffer | null = raw;
    if (/FlateDecode/.test(body.slice(0, at))) {
      try {
        stream = inflateSync(raw);
      } catch {
        stream = null;
      }
    }
    out.set(Number(m[1]), { dict: body.slice(0, at), stream });
  }
  return out;
}

function cmap(source: string): Map<string, string> {
  const map = new Map<string, string>();
  const hex = (h: string) => String.fromCodePoint(...(h.match(/.{4}/g) ?? []).map((c) => parseInt(c, 16)));
  for (const block of source.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) map.set(m[1]!.toUpperCase(), hex(m[2]!));
  }
  for (const block of source.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of block[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const width = m[1]!.length;
      const from = parseInt(m[1]!, 16);
      const to = parseInt(m[2]!, 16);
      const base = parseInt(m[3]!, 16);
      for (let c = from; c <= to; c += 1) map.set(c.toString(16).toUpperCase().padStart(width, '0'), String.fromCodePoint(base + c - from));
    }
  }
  return map;
}

export interface PdfFacts {
  pages: number;
  /** Width × height of each page, in points. */
  sizes: [number, number][];
  /** The text the content streams draw, in order (spacing approximate). */
  text: string;
  images: number;
}

export function readPdf(pdf: Buffer): PdfFacts {
  const objs = objects(pdf);
  const cmaps = new Map<number, Map<string, string>>();
  for (const [n, o] of objs) if (o.stream && o.stream.includes('begincmap')) cmaps.set(n, cmap(o.stream.toString('latin1')));
  const fontCmap = new Map<number, Map<string, string>>();
  for (const [n, o] of objs) {
    const ref = /\/ToUnicode (\d+) 0 R/.exec(o.dict);
    if (ref && cmaps.has(Number(ref[1]))) fontCmap.set(n, cmaps.get(Number(ref[1]))!);
  }
  const names = new Map<string, Map<string, string>>();
  for (const o of objs.values()) {
    for (const m of o.dict.matchAll(/\/([A-Za-z][A-Za-z0-9_.+-]*) (\d+) 0 R/g)) {
      const map = fontCmap.get(Number(m[2]));
      if (map) names.set(m[1]!, map);
    }
  }
  const sizes: [number, number][] = [];
  for (const o of objs.values()) {
    if (!/\/Type\s*\/Page\b/.test(o.dict)) continue;
    const box = /\/MediaBox\s*\[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*\]/.exec(o.dict);
    if (box) sizes.push([Number(box[3]) - Number(box[1]), Number(box[4]) - Number(box[2])]);
  }
  let text = '';
  for (const o of objs.values()) {
    if (!o.stream || o.stream.includes('begincmap')) continue;
    const s = o.stream.toString('latin1');
    if (!/T[Jj]/.test(s)) continue;
    let font: Map<string, string> | undefined;
    for (const m of s.matchAll(/\/([A-Za-z][A-Za-z0-9_.+-]*)\s+[\d.]+\s+Tf|<([0-9A-Fa-f\s]*)>|(ET)\b/g)) {
      if (m[1]) font = names.get(m[1]);
      else if (m[3]) text += '\n';
      else if (m[2] !== undefined && font) {
        const hex = m[2].replace(/\s/g, '').toUpperCase();
        const width = [...font.keys()][0]?.length ?? 4;
        for (let i = 0; i < hex.length; i += width) text += font.get(hex.slice(i, i + width)) ?? '';
      }
    }
  }
  const images = [...objs.values()].filter((o) => /\/Subtype\s*\/Image/.test(o.dict)).length;
  return { pages: sizes.length, sizes, text, images };
}
