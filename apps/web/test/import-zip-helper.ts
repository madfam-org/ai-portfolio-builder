/**
 * Test-only ZIP writer (stored or deflate, optional ZIP64 records) and a Blob wrapper that records every byte range
 * read, so a test can prove an entry was never touched.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { crc32, type BlobLike } from '../src/components/import/zip.ts';

export interface ZipInput {
  name: string;
  data: Uint8Array;
  method?: 0 | 8;
  /** Lie in the central directory (tests): a different crc or size than the real data. */
  crc?: number;
  size?: number;
  encrypted?: boolean;
}

export function buildZip(files: readonly ZipInput[], opts: { zip64?: boolean } = {}): Uint8Array {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const method = f.method ?? 8;
    const body = method === 8 ? deflateRawSync(f.data) : Buffer.from(f.data);
    const name = Buffer.from(f.name, 'utf8');
    const crc = f.crc ?? crc32(f.data);
    const size = f.size ?? f.data.byteLength;
    const flags = 0x0800 | (f.encrypted ? 1 : 0);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.byteLength, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.byteLength, 26);
    chunks.push(local, name, body);
    let extra = Buffer.alloc(0);
    if (opts.zip64) {
      extra = Buffer.alloc(4 + 24);
      extra.writeUInt16LE(0x0001, 0);
      extra.writeUInt16LE(24, 2);
      extra.writeBigUInt64LE(BigInt(size), 4);
      extra.writeBigUInt64LE(BigInt(body.byteLength), 12);
      extra.writeBigUInt64LE(BigInt(offset), 20);
    }
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(45, 4);
    c.writeUInt16LE(45, 6);
    c.writeUInt16LE(flags, 8);
    c.writeUInt16LE(method, 10);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(opts.zip64 ? 0xffffffff : body.byteLength, 20);
    c.writeUInt32LE(opts.zip64 ? 0xffffffff : size, 24);
    c.writeUInt16LE(name.byteLength, 28);
    c.writeUInt16LE(extra.byteLength, 30);
    c.writeUInt32LE(opts.zip64 ? 0xffffffff : offset, 42);
    central.push(c, name, extra);
    offset += 30 + name.byteLength + body.byteLength;
  }
  const cd = Buffer.concat(central);
  const tail: Buffer[] = [];
  if (opts.zip64) {
    const z = Buffer.alloc(56);
    z.writeUInt32LE(0x06064b50, 0);
    z.writeBigUInt64LE(44n, 4);
    z.writeBigUInt64LE(BigInt(files.length), 24);
    z.writeBigUInt64LE(BigInt(files.length), 32);
    z.writeBigUInt64LE(BigInt(cd.byteLength), 40);
    z.writeBigUInt64LE(BigInt(offset), 48);
    const loc = Buffer.alloc(20);
    loc.writeUInt32LE(0x07064b50, 0);
    loc.writeBigUInt64LE(BigInt(offset + cd.byteLength), 8);
    loc.writeUInt32LE(1, 16);
    tail.push(z, loc);
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(opts.zip64 ? 0xffff : files.length, 8);
  eocd.writeUInt16LE(opts.zip64 ? 0xffff : files.length, 10);
  eocd.writeUInt32LE(opts.zip64 ? 0xffffffff : cd.byteLength, 12);
  eocd.writeUInt32LE(opts.zip64 ? 0xffffffff : offset, 16);
  return new Uint8Array(Buffer.concat([...chunks, cd, ...tail, eocd]));
}

/** Every file of a fixture directory, under `prefix/`. */
export function dirFiles(dir: string, prefix = ''): ZipInput[] {
  return readdirSync(dir)
    .sort()
    .map((name) => ({ name: `${prefix}${name}`, data: new Uint8Array(readFileSync(join(dir, name))) }));
}

/** A BlobLike over bytes that records each [start, end) range read. */
export class RecordingBlob implements BlobLike {
  readonly reads: [number, number][] = [];
  readonly bytes: Uint8Array;
  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }
  get size(): number {
    return this.bytes.byteLength;
  }
  slice(start = 0, end = this.bytes.byteLength) {
    this.reads.push([start, end]);
    const part = this.bytes.slice(start, end);
    return { arrayBuffer: async () => part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength) as ArrayBuffer };
  }
}

/** Where an entry's local record and data sit in an archive built by buildZip (by scanning local headers). */
export function entrySpan(zip: Uint8Array, name: string): [number, number] {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let p = 0;
  while (v.getUint32(p, true) === 0x04034b50) {
    const nameLen = v.getUint16(p + 26, true);
    const comp = v.getUint32(p + 18, true);
    const n = new TextDecoder().decode(zip.subarray(p + 30, p + 30 + nameLen));
    const end = p + 30 + nameLen + comp;
    if (n === name) return [p, end];
    p = end;
  }
  throw new Error(`no entry ${name}`);
}
