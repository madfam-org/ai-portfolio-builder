/**
 * Test-only: a valid multi-page PDF (PDF 1.4, Helvetica, WinAnsiEncoding) with text runs at given positions and sizes,
 * for the LinkedIn profile PDF import (test/fixtures/import/linkedin-pdf.ts). Latin-1 text only. Synthetic content only.
 */
import type { PlacedRun } from './fixtures/import/linkedin-pdf.ts';

export function buildLayoutPdf(pages: readonly PlacedRun[][], size: { width: number; height: number } = { width: 612, height: 792 }): Uint8Array {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const objects: string[] = [];
  const add = (body: string) => objects.push(body);
  const n = pages.length;
  // 1 catalog, 2 pages, 3 font, then per page: page object, content stream.
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add(`<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${n} >>`);
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  for (const [i, runs] of pages.entries()) {
    const text = runs.map((r) => `BT /F1 ${r.size} Tf 1 0 0 1 ${r.x} ${r.y.toFixed(2)} Tm (${esc(r.text)}) Tj ET`).join('\n');
    const stream = Buffer.from(text, 'latin1');
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size.width} ${size.height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    add(`<< /Length ${stream.length} >>\nstream\n${stream.toString('latin1')}\nendstream`);
  }
  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, 'latin1'));
}
