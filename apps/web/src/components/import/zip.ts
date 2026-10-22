/**
 * A minimal, read-only ZIP reader for the browser (and Node, for tests), with no dependency: the platform's
 * `DecompressionStream('deflate-raw')` inflates, everything else is reading the archive's own index.
 *
 * Privacy by construction: `listEntries` reads ONLY the end record and the central directory (the list of names, at
 * the end of the file) through `Blob.slice`; `readEntry` reads the bytes of ONE named entry. An entry the caller never
 * asks for (a LinkedIn archive's messages, connections, invitations ...) is never read, decompressed or kept. (Only an
 * archive with a trailing comment makes the reader scan its last 64 KiB for the end record; those bytes are searched
 * for the record's signature and dropped, never decompressed.)
 *
 * Supported: stored (0) and deflate (8) entries, ZIP64 sizes and offsets. Refused: encrypted entries, other methods.
 * Caps: archive size, entry count, and the inflated size of each entry (a «zip bomb» stops at the cap); every
 * inflated entry is checked against its CRC-32.
 */

export interface BlobLike {
  readonly size: number;
  slice(start?: number, end?: number): { arrayBuffer(): Promise<ArrayBuffer> };
}

export interface ZipLimits {
  /** Largest archive accepted (bytes). Only its index and the mapped entries are ever read. */
  maxArchiveBytes: number;
  /** Most entries in the index. */
  maxEntries: number;
  /** Largest inflated size of one entry that is read (bytes). */
  maxEntryBytes: number;
}

export const ZIP_LIMITS: ZipLimits = { maxArchiveBytes: 300 * 1024 * 1024, maxEntries: 20_000, maxEntryBytes: 8 * 1024 * 1024 };

export type ZipErrorCode = 'too_large' | 'not_zip' | 'too_many_entries' | 'unsupported' | 'entry_too_large' | 'corrupt';

export class ZipError extends Error {
  readonly code: ZipErrorCode;
  constructor(code: ZipErrorCode) {
    super(`zip: ${code}`);
    this.code = code;
  }
}

export interface ZipEntry {
  name: string;
  method: number;
  encrypted: boolean;
  crc: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

const EOCD = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_EOCD = 0x06064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX32 = 0xffffffff;

async function bytes(file: BlobLike, start: number, end: number): Promise<DataView> {
  if (start < 0 || end > file.size || end < start) throw new ZipError('corrupt');
  return new DataView(await file.slice(start, end).arrayBuffer());
}

function u64(v: DataView, at: number): number {
  const n = v.getBigUint64(at, true);
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new ZipError('unsupported');
  return Number(n);
}

/** The archive's index: names and sizes only. Throws ZipError. */
export async function listEntries(file: BlobLike, limits: ZipLimits = ZIP_LIMITS): Promise<ZipEntry[]> {
  if (file.size > limits.maxArchiveBytes) throw new ZipError('too_large');
  if (file.size < 22) throw new ZipError('not_zip');
  // The end-of-central-directory record: the last 22 bytes when the archive has no comment (the usual case; the 20
  // bytes before it may be the ZIP64 locator). Only with a comment is the last 22 + 65535 bytes searched.
  let tail = await bytes(file, Math.max(0, file.size - 42), file.size);
  let eocd = tail.getUint32(tail.byteLength - 22, true) === EOCD ? tail.byteLength - 22 : -1;
  if (eocd < 0) {
    tail = await bytes(file, Math.max(0, file.size - (22 + 0xffff)), file.size);
    for (let i = tail.byteLength - 22; i >= 0; i -= 1) {
      if (tail.getUint32(i, true) === EOCD) {
        eocd = i;
        break;
      }
    }
  }
  if (eocd < 0) throw new ZipError('not_zip');
  let count = tail.getUint16(eocd + 10, true);
  let cdSize = tail.getUint32(eocd + 12, true);
  let cdOffset = tail.getUint32(eocd + 16, true);
  if (count === 0xffff || cdSize === MAX32 || cdOffset === MAX32) {
    const loc = eocd - 20;
    if (loc < 0 || tail.getUint32(loc, true) !== ZIP64_LOCATOR) throw new ZipError('corrupt');
    const z64At = u64(tail, loc + 8);
    const z64 = await bytes(file, z64At, z64At + 56);
    if (z64.getUint32(0, true) !== ZIP64_EOCD) throw new ZipError('corrupt');
    count = u64(z64, 32);
    cdSize = u64(z64, 40);
    cdOffset = u64(z64, 48);
  }
  if (count > limits.maxEntries) throw new ZipError('too_many_entries');
  const cd = await bytes(file, cdOffset, cdOffset + cdSize);
  const decoder = new TextDecoder('utf-8');
  const entries: ZipEntry[] = [];
  let p = 0;
  for (let n = 0; n < count; n += 1) {
    if (p + 46 > cd.byteLength || cd.getUint32(p, true) !== CENTRAL) throw new ZipError('corrupt');
    const flags = cd.getUint16(p + 8, true);
    const method = cd.getUint16(p + 10, true);
    const crc = cd.getUint32(p + 16, true);
    let compressedSize = cd.getUint32(p + 20, true);
    let size = cd.getUint32(p + 24, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    let localOffset = cd.getUint32(p + 42, true);
    if (p + 46 + nameLen + extraLen > cd.byteLength) throw new ZipError('corrupt');
    const name = decoder.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen));
    // ZIP64 extra field (0x0001): the 64-bit values, in order, of exactly the fields that are 0xFFFFFFFF.
    let e = p + 46 + nameLen;
    const extraEnd = e + extraLen;
    while (e + 4 <= extraEnd) {
      const id = cd.getUint16(e, true);
      const len = cd.getUint16(e + 2, true);
      if (id === 0x0001) {
        let q = e + 4;
        const end = e + 4 + len;
        if (size === MAX32 && q + 8 <= end) {
          size = u64(cd, q);
          q += 8;
        }
        if (compressedSize === MAX32 && q + 8 <= end) {
          compressedSize = u64(cd, q);
          q += 8;
        }
        if (localOffset === MAX32 && q + 8 <= end) localOffset = u64(cd, q);
      }
      e += 4 + len;
    }
    entries.push({ name, method, encrypted: (flags & 1) === 1, crc, compressedSize, size, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

let crcTable: Uint32Array | null = null;
/** CRC-32 (IEEE), as ZIP stores it. */
export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[i] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function inflateRaw(data: Uint8Array, max: number): Promise<Uint8Array> {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  }).pipeThrough(new DecompressionStream('deflate-raw') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel().catch(() => undefined);
        throw new ZipError('entry_too_large');
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof ZipError) throw err;
    throw new ZipError('corrupt');
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** The bytes of ONE entry, inflated and CRC-checked. Throws ZipError. */
export async function readEntry(file: BlobLike, entry: ZipEntry, limits: ZipLimits = ZIP_LIMITS): Promise<Uint8Array> {
  if (entry.encrypted) throw new ZipError('unsupported');
  if (entry.method !== 0 && entry.method !== 8) throw new ZipError('unsupported');
  if (entry.size > limits.maxEntryBytes) throw new ZipError('entry_too_large');
  const head = await bytes(file, entry.localOffset, entry.localOffset + 30);
  if (head.getUint32(0, true) !== LOCAL) throw new ZipError('corrupt');
  const start = entry.localOffset + 30 + head.getUint16(26, true) + head.getUint16(28, true);
  const raw = new Uint8Array(await file.slice(start, start + entry.compressedSize).arrayBuffer());
  if (raw.byteLength !== entry.compressedSize) throw new ZipError('corrupt');
  const out = entry.method === 0 ? raw : await inflateRaw(raw, limits.maxEntryBytes);
  if (out.byteLength !== entry.size || crc32(out) !== entry.crc) throw new ZipError('corrupt');
  return out;
}

/** The entry text as UTF-8 (a BOM is kept for the CSV reader to strip). */
export async function readEntryText(file: BlobLike, entry: ZipEntry, limits: ZipLimits = ZIP_LIMITS): Promise<string> {
  return new TextDecoder('utf-8').decode(await readEntry(file, entry, limits));
}
