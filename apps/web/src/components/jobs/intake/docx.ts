/**
 * W5-J: the text of a Word (.docx) posting, read in the browser with the W4-I ZIP reader (no dependency): only
 * `word/document.xml` is opened; paragraphs become lines, list paragraphs get «• », tabs and breaks are kept, and the
 * XML entities are decoded. Formatting, images, comments, headers and macros are never read.
 */
import { listEntries, readEntryText, ZipError, type BlobLike } from '../../import/zip.ts';

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, ref: string) => {
    if (ref[0] !== '#') return XML_ENTITIES[ref] ?? '';
    const code = ref[1] === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
    return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : '';
  });
}

/** WordprocessingML body → plain text. */
export function docxXmlToText(xml: string): string {
  const out: string[] = [];
  let line = '';
  let listItem = false;
  const TOKEN = /<w:p[\s>/]|<\/w:p>|<w:numPr[\s>/]|<w:tab\/>|<w:br\b[^>]*\/>|<w:cr\/>|<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  for (const m of xml.matchAll(TOKEN)) {
    const tok = m[0];
    if (tok.startsWith('<w:p')) {
      line = '';
      listItem = false;
    } else if (tok === '</w:p>') {
      const text = line.replace(/[  ]+/g, ' ').trim();
      if (text) out.push(listItem ? `• ${text}` : text);
      line = '';
    } else if (tok.startsWith('<w:numPr')) listItem = true;
    else if (tok === '<w:tab/>') line += '\t';
    else if (tok.startsWith('<w:br') || tok === '<w:cr/>') line += '\n';
    else line += decodeXml(m[1] ?? '');
  }
  return out.join('\n');
}

export class NotDocxError extends Error {}

/** Caps for a posting document (far above any real one). */
export const DOCX_LIMITS = { maxArchiveBytes: 20 * 1024 * 1024, maxEntries: 2_000, maxEntryBytes: 8 * 1024 * 1024 };

export async function readDocxText(file: BlobLike): Promise<string> {
  let entries;
  try {
    entries = await listEntries(file, DOCX_LIMITS);
  } catch (err) {
    if (err instanceof ZipError && err.code === 'not_zip') throw new NotDocxError('not a docx');
    throw err;
  }
  const body = entries.find((e) => e.name === 'word/document.xml');
  if (!body) throw new NotDocxError('no word/document.xml');
  return docxXmlToText(await readEntryText(file, body, DOCX_LIMITS));
}
