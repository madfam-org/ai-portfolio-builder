/**
 * The e2e suite's PDF reader (e2e/documents-pdf.ts) must read a stream whose compressed bytes end in CR or LF, and must
 * fail loudly on a stream it cannot decode. Before this test, a stream ending in 0x0D lost its last byte, inflate
 * failed, and that page's text silently vanished (the flaky «Puesto NN is printed (nothing clipped)»).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';
import { readPdf } from '../e2e/documents-pdf.ts';

/** A one-page PDF in the shape Chromium writes: `<dict> stream\n<data>\nendstream`, one font with a ToUnicode map. */
function pdfWith(content: Buffer): Buffer {
  const cmap = Buffer.from('/CIDInit /ProcSet findresource begin\nbegincmap\n1 beginbfchar\n<0041> <0041>\nendbfchar\nendcmap\n', 'latin1');
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const stream = (n: number, dict: string, data: Buffer) =>
    parts.push(Buffer.from(`${n} 0 obj\n<<${dict} /Length ${data.length}>> stream\n`, 'latin1'), data, Buffer.from('\nendstream\nendobj\n', 'latin1'));
  stream(1, '/Filter /FlateDecode', content);
  parts.push(Buffer.from('2 0 obj\n<</Type /Font /ToUnicode 3 0 R>>\nendobj\n', 'latin1'));
  stream(3, '', cmap);
  parts.push(Buffer.from('4 0 obj\n<</Type /Page /MediaBox [0 0 612 792] /Resources <</Font <</F1 2 0 R>>>> /Contents 1 0 R>>\nendobj\n', 'latin1'));
  return Buffer.concat(parts);
}

/**
 * A content stream drawing «A» whose compressed form ends in `lastByte`. The last byte is the low byte of the Adler-32
 * sum of the input, so three printable padding characters (sums 99..378, every residue mod 256) reach any value.
 */
const found = new Map<number, Buffer>();
function compressedEndingIn(lastByte: number): Buffer {
  const cached = found.get(lastByte);
  if (cached) return Buffer.from(cached);
  for (let a = 33; a < 127; a += 1) {
    for (let b = 33; b < 127; b += 1) {
      for (let c = 33; c < 127; c += 1) {
        const data = deflateSync(Buffer.from(`BT /F1 12 Tf <0041> Tj ET\n% ${String.fromCharCode(a, b, c)}\n`, 'latin1'));
        if (data[data.length - 1] === lastByte) {
          found.set(lastByte, data);
          return Buffer.from(data);
        }
      }
    }
  }
  throw new Error(`no padding gave a stream ending in ${lastByte}`);
}

for (const [label, byte] of [
  ['CR', 0x0d],
  ['LF', 0x0a],
  ['another byte', 0x41],
] as const) {
  test(`readPdf reads a compressed stream whose last byte is ${label}`, () => {
    const facts = readPdf(pdfWith(compressedEndingIn(byte)));
    assert.equal(facts.pages, 1);
    assert.deepEqual(facts.sizes, [[612, 792]]);
    assert.equal(facts.text.replace(/\s/g, ''), 'A');
  });
}

test('readPdf throws on a stream it cannot decode instead of reading no text', () => {
  const data = Buffer.from(compressedEndingIn(0x41));
  data.writeUInt8(data.readUInt8(data.length - 1) ^ 0xff, data.length - 1); // a wrong checksum: inflate refuses it
  assert.throws(() => readPdf(pdfWith(data)), /incorrect data check|invalid|unexpected end/i);
});

test('readPdf throws when /Length does not end at endstream', () => {
  const pdf = pdfWith(compressedEndingIn(0x41)).toString('latin1').replace(/\/Length (\d+)>> stream/, (_, n) => `/Length ${Number(n) - 3}>> stream`);
  assert.throws(() => readPdf(Buffer.from(pdf, 'latin1')), /does not end at endstream/);
});
