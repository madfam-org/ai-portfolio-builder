/**
 * W5-J browser-side intake pieces, in Node: the bookmarklet (its exact code runs in a sandbox with a fake page and
 * produces a fragment the capture page decodes), the fragment codec and its caps, the capture trimming under the API
 * body cap, the DOCX reader (built from the synthetic fixture), the file sniffing, and the preview → job body mapping.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { bookmarkletCode, bookmarkletHref } from '../src/components/jobs/intake/bookmarklet.ts';
import { CaptureError, decodeFragment, encodeFragment, fitCapture, type CapturePayload } from '../src/components/jobs/intake/capture.ts';
import { jobFromPreview, previewFromDraft } from '../src/components/jobs/intake/client.ts';
import { docxXmlToText, readDocxText, NotDocxError } from '../src/components/jobs/intake/docx.ts';
import { decodeTextFile, fileKind, htmlFileToInput } from '../src/components/jobs/intake/files.ts';
import { draftFromCapture } from '../src/server/ingest/extract.ts';
import { parseHtml, serialize } from '../src/server/ingest/html.ts';
import { buildZip } from './import-zip-helper.ts';
import { buildPdf } from './ingest-pdf-helper.ts';

const TARGET = 'https://cv-app.madfam.io/empleos/capturar';

function fakePage(opts: { compression: boolean }) {
  const opened: string[] = [];
  const el = (attrs: Record<string, string>, text = '') => ({ getAttribute: (k: string) => attrs[k] ?? null, textContent: text, outerHTML: `<div ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}>${text}</div>`, innerText: text, href: attrs.href });
  const ld = el({ type: 'application/ld+json' }, '{"@type":"JobPosting","title":"Cocinera"}');
  const other = el({ type: 'application/ld+json' }, '{"@type":"BreadcrumbList"}');
  const document = {
    title: 'Cocinera | Bolsa',
    body: el({}, 'cuerpo'),
    querySelectorAll: (sel: string) => (sel.startsWith('script') ? [ld, other] : sel.startsWith('meta') ? [el({ property: 'og:title', content: 'Cocinera' })] : []),
    querySelector: (sel: string) => (sel === 'main' ? el({}, 'Cocinera\nRestaurante Ejemplo\nSueldo: $12,000 mensuales') : sel.startsWith('link') ? el({ href: 'https://bolsa.example.org/v/1' }) : null),
  };
  const window: Record<string, unknown> = { open: (u: string) => (opened.push(u), {}) };
  if (opts.compression) window.CompressionStream = CompressionStream;
  const context = vm.createContext({ document, window, location: { href: 'https://bolsa.example.org/v/1?utm=x' }, alert: (m: string) => opened.push(`alert:${m}`), TextEncoder, Blob, Response, CompressionStream, btoa, String, JSON });
  return { context, opened };
}

for (const compression of [true, false]) {
  test(`the bookmarklet reads the open page and opens cv-app with a decodable fragment (${compression ? 'compressed' : 'plain'})`, async () => {
    const page = fakePage({ compression });
    const code = bookmarkletCode(TARGET, 'fallo');
    const href = bookmarkletHref(TARGET, 'fallo');
    assert.equal(decodeURIComponent(href.slice('javascript:'.length)), code.slice('javascript:'.length), 'the href is the URI-encoded code');
    assert.ok(!/[\s#%"<>]/.test(href.slice('javascript:'.length).replace(/%[0-9A-F]{2}/g, '')), 'no raw space, #, %, quotes or angle brackets');
    vm.runInContext(code.slice('javascript:'.length), page.context);
    for (let i = 0; i < 50 && page.opened.length === 0; i += 1) await new Promise((r) => setTimeout(r, 10));
    assert.equal(page.opened.length, 1, page.opened.join());
    const [url, fragment] = page.opened[0]!.split('#') as [string, string];
    assert.equal(url, TARGET);
    assert.ok(fragment.startsWith(compression ? 'z.' : 'j.'));
    const p = await decodeFragment(`#${fragment}`);
    assert.deepEqual(p.jsonLd, ['{"@type":"JobPosting","title":"Cocinera"}'], 'only JSON-LD that mentions JobPosting');
    assert.equal(p.url, 'https://bolsa.example.org/v/1?utm=x');
    assert.equal(p.canonical, 'https://bolsa.example.org/v/1');
    assert.equal(p.title, 'Cocinera | Bolsa');
    assert.deepEqual(p.meta, { 'og:title': 'Cocinera' });
    assert.match(p.text, /Sueldo: \$12,000 mensuales/);
  });
}

test('a broken page: the bookmarklet alerts instead of throwing', () => {
  const opened: string[] = [];
  const context = vm.createContext({ document: null, window: {}, location: {}, alert: (m: string) => opened.push(m) });
  vm.runInContext(bookmarkletCode(TARGET, 'No se pudo capturar').slice('javascript:'.length), context);
  assert.deepEqual(opened, ['No se pudo capturar']);
});

const payload = (over: Partial<CapturePayload> = {}): CapturePayload => ({ v: 1, url: 'https://x.example.org/v', canonical: null, title: 'T', jsonLd: [], meta: {}, microdata: '', text: 'Texto de la vacante', ...over });

test('fragment codec: round trip, untrusted shapes sanitised, corrupt and oversized input refused', async () => {
  assert.deepEqual(await decodeFragment(await encodeFragment(payload())), payload());
  assert.deepEqual(await decodeFragment(await encodeFragment(payload(), false)), payload());
  const weird = await decodeFragment(`j.${Buffer.from(JSON.stringify({ text: 'x', jsonLd: [1, 'a'], meta: { k: 2, og: 'v' }, ownerSub: 'janua|other', url: 5 })).toString('base64url')}`);
  assert.deepEqual(weird, { v: 1, url: null, canonical: null, title: '', jsonLd: ['a'], meta: { og: 'v' }, microdata: '', text: 'x' });
  const code = async (h: string) => {
    try {
      await decodeFragment(h);
      return 'ok';
    } catch (err) {
      return err instanceof CaptureError ? err.code : 'other';
    }
  };
  assert.equal(await code(''), 'empty');
  assert.equal(await code('#'), 'empty');
  assert.equal(await code('#x.abc'), 'corrupt');
  assert.equal(await code('#z.!!!!'), 'corrupt');
  assert.equal(await code('#j.bm90IGpzb24'), 'corrupt');
  assert.equal(await code(`#j.${Buffer.from('{"text":""}').toString('base64url')}`), 'empty');
  const bomb = await encodeFragment(payload({ text: ' '.repeat(110_000), jsonLd: Array(10).fill('a'.repeat(190_000)) }));
  assert.equal(await code(bomb), 'too_large', 'inflated size is capped');
});

test('fitCapture keeps the intake body under the cap: microdata first, then text, then JSON-LD', () => {
  const big = payload({ microdata: 'm'.repeat(150_000), text: 't'.repeat(110_000), jsonLd: ['{"@type":"JobPosting"}', 'x'.repeat(100_000)] });
  const fitted = fitCapture(big);
  const size = Buffer.byteLength(JSON.stringify({ source: 'capture', kind: 'capture', capture: fitted }));
  assert.ok(size <= 240_000, String(size));
  assert.equal(fitted.microdata, '');
  assert.deepEqual(fitted.jsonLd, ['{"@type":"JobPosting"}']);
  assert.ok(fitted.text.length > 1000);
  const small = fitCapture(payload());
  assert.equal(small.text, 'Texto de la vacante');
});

test('DOCX: paragraphs, list bullets, tabs, breaks and entities; only word/document.xml is read', async () => {
  const dir = join(import.meta.dirname, 'fixtures', 'ingest', 'docx');
  const file = (name: string) => ({ name, data: new Uint8Array(readFileSync(join(dir, name))) });
  const zip = buildZip([file('[Content_Types].xml'), file('word/document.xml')]);
  const text = await readDocxText(new Blob([zip as BlobPart]));
  assert.equal(
    text,
    [
      'Auxiliar Contable',
      'Empresa: Contadores Ejemplo & Asociados',
      'Ubicación: Mérida, Yucatán',
      'Sueldo: $14,000 mensuales',
      'Modalidad:\tPresencial',
      '• Registro de pólizas en CONTPAQi.',
      '• Conciliaciones bancarias.',
      'Requisitos: carrera trunca o terminada en Contaduría, manejo de Excel intermedio.\nHorario de lunes a viernes.',
    ].join('\n'),
  );
  assert.equal(docxXmlToText('<w:p><w:r><w:t>&#241;&#x00E1;&lt;b&gt;</w:t></w:r></w:p>'), 'ñá<b>');
  await assert.rejects(readDocxText(new Blob([buildZip([{ name: 'content.xml', data: new Uint8Array([1]) }]) as BlobPart])), NotDocxError);
  await assert.rejects(readDocxText(new Blob([new Uint8Array([1, 2, 3, 4]) as BlobPart])), NotDocxError);
});

test('file sniffing by the first bytes, then the name; text files in UTF-8 or Windows-1252', () => {
  const head = (b: number[]) => new Uint8Array([...b, ...Array(12).fill(0)]);
  assert.equal(fileKind('vacante.pdf', 'application/pdf', buildPdf(['x']).slice(0, 16)), 'pdf');
  assert.equal(fileKind('sin-extension', '', head([0x25, 0x50, 0x44, 0x46])), 'pdf');
  assert.equal(fileKind('foto.png', 'image/png', head([0x89, 0x50, 0x4e, 0x47])), 'image');
  assert.equal(fileKind('foto.jpg', '', head([0xff, 0xd8, 0xff])), 'image');
  assert.equal(fileKind('captura.heic', 'image/heic', head([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70])), 'image');
  assert.equal(fileKind('vacante.docx', '', head([0x50, 0x4b, 0x03, 0x04])), 'docx');
  assert.equal(fileKind('vacante.zip', '', head([0x50, 0x4b, 0x03, 0x04])), 'unsupported');
  assert.equal(fileKind('vacante.html', 'text/html', head([0x3c])), 'html');
  assert.equal(fileKind('vacante.txt', '', head([0x50])), 'text');
  assert.equal(fileKind('vacante.doc', 'application/msword', head([0xd0, 0xcf])), 'unsupported');
  assert.equal(decodeTextFile(new Uint8Array(Buffer.from('﻿Año', 'utf8'))), 'Año');
  assert.equal(decodeTextFile(new Uint8Array(Buffer.from('Año', 'latin1'))), 'Año');
});

test('preview → job body: strings to typed fields, empty to null, codes upper-cased, source kind kept', () => {
  const values = previewFromDraft({
    sourceKind: 'capture',
    sourceUrl: 'https://x.example.org/v',
    provider: null,
    fields: { title: { value: 'Cocinera', from: 'json-ld' }, salaryMin: { value: 12000, from: 'labeled-text' }, stateCode: { value: 'MX-YUC', from: 'json-ld' } },
    sourceText: 'Texto',
    sourceTextFrom: 'text',
    notes: [],
  });
  assert.equal(values.salaryMin, '12000');
  const body = jobFromPreview({ ...values, salaryMax: '15,000', salaryCurrency: 'mxn', countryCode: 'mx' }, 'capture');
  assert.deepEqual(
    { ...body },
    {
      title: 'Cocinera',
      company: '',
      location: '',
      sourceUrl: 'https://x.example.org/v',
      sourceText: 'Texto',
      status: 'saved',
      sourceKind: 'capture',
      countryCode: 'MX',
      stateCode: 'MX-YUC',
      employmentType: null,
      workMode: null,
      salaryMin: 12000,
      salaryMax: 15000,
      salaryCurrency: 'MXN',
      salaryPeriod: null,
      datePosted: null,
      validThrough: null,
    },
  );
});

test('a saved .html page becomes a capture with cv\'s own parser (no DOMParser); microdata survives the round trip', () => {
  const input = htmlFileToInput(readFileSync(join(import.meta.dirname, 'fixtures', 'ingest', 'microdata.html'), 'utf8'));
  assert.equal(input.source, 'capture');
  if (input.source !== 'capture') return;
  assert.match(input.capture.microdata ?? '', /itemtype="https:\/\/schema.org\/JobPosting"/);
  const d = draftFromCapture({ url: null, canonical: null, title: '', jsonLd: [], meta: {}, microdata: '', text: '', ...input.capture }, 'file')!;
  assert.equal(d.fields.company!.value, 'Servicios Ejemplo del Bajío');
  assert.equal(d.fields.stateCode!.value, 'MX-GUA');
  assert.equal(serialize(parseHtml('<p onclick="x()" title="a&quot;b">1 &lt; 2<script>alert(1)</script></p>').children[0] as never), '<p title="a&quot;b">1 &lt; 2<script></script></p>');
  assert.equal(parseHtml('<!-- a --!><p>visible</p>').children.length, 1, '--!> ends a comment');
});
