/**
 * The in-browser ZIP reader (src/components/import/zip.ts): stored, deflate and ZIP64 archives; the caps (archive
 * size, entry count, inflated size, zip bomb); CRC and corruption; and — the privacy claim — that reading one entry
 * never touches another entry's bytes.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ZIP_LIMITS, ZipError, crc32, listEntries, readEntry, readEntryText } from '../src/components/import/zip.ts';
import { RecordingBlob, buildZip, entrySpan } from './import-zip-helper.ts';

const enc = new TextEncoder();
const text = (s: string) => enc.encode(s);

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (err) {
    assert.ok(err instanceof ZipError, String(err));
    return err.code;
  }
}

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(text('123456789')), 0xcbf43926);
});

test('lists and reads stored and deflated entries, with UTF-8 names', async () => {
  const big = 'línea, con coma\n'.repeat(500);
  const zip = new RecordingBlob(buildZip([
    { name: 'Positions.csv', data: text(big), method: 8 },
    { name: 'carpeta/Educación.csv', data: text('a,b\n1,2\n'), method: 0 },
  ]));
  const entries = await listEntries(zip);
  assert.deepEqual(entries.map((e) => [e.name, e.method, e.size]), [['Positions.csv', 8, enc.encode(big).byteLength], ['carpeta/Educación.csv', 0, 8]]);
  assert.equal(await readEntryText(zip, entries[0]!), big);
  assert.equal(await readEntryText(zip, entries[1]!), 'a,b\n1,2\n');
});

test('ZIP64 records (sizes and offsets in the extra field) read the same', async () => {
  const zip = new RecordingBlob(buildZip([{ name: 'a.csv', data: text('x\n1\n') }, { name: 'b.csv', data: text('y\n2\n') }], { zip64: true }));
  const entries = await listEntries(zip);
  assert.deepEqual(entries.map((e) => e.name), ['a.csv', 'b.csv']);
  assert.equal(await readEntryText(zip, entries[1]!), 'y\n2\n');
});

test('reading one entry never reads another entry\'s bytes (only the index and that entry)', async () => {
  const bytes = buildZip([
    { name: 'messages.csv', data: text('SENTINEL\n'.repeat(1000)) },
    { name: 'Skills.csv', data: text('Name\nSQL\n') },
    { name: 'Connections.csv', data: text('SENTINEL\n'.repeat(1000)) },
  ]);
  const zip = new RecordingBlob(bytes);
  const entries = await listEntries(zip);
  await readEntry(zip, entries.find((e) => e.name === 'Skills.csv')!);
  assert.ok(zip.reads.length >= 2, 'read-proof: the index and the entry were read');
  for (const name of ['messages.csv', 'Connections.csv']) {
    const [start, end] = entrySpan(bytes, name);
    const touching = zip.reads.filter(([s, e]) => s < end && e > start);
    assert.deepEqual(touching, [], `${name} was read`);
  }
});

test('refuses what is not a ZIP, too large, too many entries, encrypted, other methods', async () => {
  assert.equal(await code(listEntries(new RecordingBlob(text('no soy un zip, solo texto con más de 22 bytes')))), 'not_zip');
  assert.equal(await code(listEntries(new RecordingBlob(new Uint8Array(10)))), 'not_zip');
  const two = buildZip([{ name: 'a', data: text('1') }, { name: 'b', data: text('2') }]);
  assert.equal(await code(listEntries(new RecordingBlob(two), { ...ZIP_LIMITS, maxArchiveBytes: two.byteLength - 1 })), 'too_large');
  assert.equal(await code(listEntries(new RecordingBlob(two), { ...ZIP_LIMITS, maxEntries: 1 })), 'too_many_entries');
  const enc1 = new RecordingBlob(buildZip([{ name: 'a', data: text('1'), encrypted: true }]));
  assert.equal(await code(readEntry(enc1, (await listEntries(enc1))[0]!)), 'unsupported');
  const odd = new RecordingBlob(buildZip([{ name: 'a', data: text('1'), method: 0 }]));
  const [entry] = await listEntries(odd);
  assert.equal(await code(readEntry(odd, { ...entry!, method: 12 })), 'unsupported');
});

test('caps the inflated size (declared and actual: a zip bomb stops at the cap) and checks the CRC', async () => {
  const data = text('A'.repeat(200_000));
  const honest = new RecordingBlob(buildZip([{ name: 'big.csv', data }]));
  const [e1] = await listEntries(honest);
  assert.equal(await code(readEntry(honest, e1!, { ...ZIP_LIMITS, maxEntryBytes: 1000 })), 'entry_too_large');
  // A lying index: says 10 bytes, inflates to 200 000.
  const bomb = new RecordingBlob(buildZip([{ name: 'bomb.csv', data, size: 10 }]));
  const [e2] = await listEntries(bomb);
  assert.equal(await code(readEntry(bomb, e2!, { ...ZIP_LIMITS, maxEntryBytes: 1000 })), 'entry_too_large');
  assert.equal(await code(readEntry(bomb, e2!)), 'corrupt', 'size mismatch under the cap');
  const badCrc = new RecordingBlob(buildZip([{ name: 'a.csv', data: text('hola'), crc: 1234 }]));
  assert.equal(await code(readEntry(badCrc, (await listEntries(badCrc))[0]!)), 'corrupt');
});

test('a truncated archive is corrupt, never a partial read', async () => {
  const bytes = buildZip([{ name: 'a.csv', data: text('x'.repeat(5000)) }]);
  const cut = new Uint8Array([...bytes.slice(0, 40), ...bytes.slice(bytes.byteLength - 22 - 46 - 5)]);
  assert.notEqual(await code((async () => readEntry(new RecordingBlob(cut), (await listEntries(new RecordingBlob(cut)))[0]!))()), 'ok');
});
