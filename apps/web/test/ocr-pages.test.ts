/** The browser side of reading images (components/jobs/intake/ocr-pages.ts): its pure parts and the status call. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LONG_EDGE, joinPages, ocrStatus, sizeFor, worstVerdict, type OcrPageText } from '../src/components/jobs/intake/ocr-pages.ts';
import { INGEST_COPY } from '../src/lib/copy/ingest.ts';

const p = (lines: string[], verdict: OcrPageText['verdict'] = 'good'): OcrPageText => ({ lines, confidence: 0.9, verdict, truncated: false });

test('sizeFor: never enlarges, caps the long edge, keeps the proportion', () => {
  assert.deepEqual(sizeFor(800, 600), { width: 800, height: 600 });
  assert.deepEqual(sizeFor(4800, 3600), { width: LONG_EDGE, height: 1800 });
  assert.deepEqual(sizeFor(3000, 6000, 1000), { width: 500, height: 1000 });
  assert.deepEqual(sizeFor(1, 90_000, 1000), { width: 1, height: 1000 }, 'never a zero edge');
});

test('joinPages: lines as read, a blank line between pages, empty pages dropped', () => {
  assert.equal(joinPages([p(['Vacante: A', 'Empresa: B']), p([]), p(['Requisitos'])]), 'Vacante: A\nEmpresa: B\n\nRequisitos');
  assert.equal(joinPages([p([])]), '');
});

test('worstVerdict: one weak page is what the person must check', () => {
  assert.equal(worstVerdict([p(['a']), p(['b'])]), 'good');
  assert.equal(worstVerdict([p(['a']), p(['b'], 'fair')]), 'fair');
  assert.equal(worstVerdict([p(['a'], 'fair'), p(['b'], 'poor')]), 'poor');
});

test('ocrStatus: on only for a well-formed «enabled»; any failure reads as off', async () => {
  const answer = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });
  assert.deepEqual(await ocrStatus(answer(200, { enabled: true, maxPages: 4, maxBytes: 491_520 })), { enabled: true, maxPages: 4, maxBytes: 491_520 });
  assert.equal((await ocrStatus(answer(200, { enabled: true, maxPages: 99, maxBytes: 491_520 }))).maxPages, 8, 'the page count is bounded here too');
  for (const off of [answer(200, { enabled: false, maxPages: 4, maxBytes: 491_520 }), answer(200, { enabled: true }), answer(200, { enabled: true, maxPages: 4, maxBytes: 10 }), answer(503, { error: 'not_configured' }), answer(401, {})]) {
    assert.equal((await ocrStatus(off)).enabled, false);
  }
  assert.equal(
    (
      await ocrStatus(async () => {
        throw new Error('offline');
      })
    ).enabled,
    false,
  );
});

test('the copy says what is sent, where, and that nothing is kept; same keys in es and en', () => {
  const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v as object).map((s) => `${k}.${s}`) : [k]));
  assert.deepEqual(keys(INGEST_COPY.es.ocr).sort(), keys(INGEST_COPY.en.ocr).sort());
  assert.ok(keys(INGEST_COPY.es.ocr).length >= 14, 'read the whole block');
  assert.match(INGEST_COPY.es.ocr.privacy, /no se guarda/);
  assert.match(INGEST_COPY.en.ocr.privacy, /neither the image nor the text is stored/);
  for (const locale of ['es', 'en'] as const) {
    assert.doesNotMatch(INGEST_COPY[locale].ocr.privacy, /tlacuilo|tesseract/i, 'no service or engine names in the interface');
    assert.ok(INGEST_COPY[locale].notes.ocr_text.length > 40);
    assert.match(INGEST_COPY[locale].ocr.progress(2, 3), /2.*3/);
  }
});
