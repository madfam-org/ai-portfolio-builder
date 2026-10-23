/**
 * W7 (B4): the renderers and bilingual profile text. First, the no-translation guarantee: every (kind, template,
 * locale) renders the same markup, byte for byte, as `main` did before translations existed (hashes written by the
 * same matrix at cab8e0d0; `CV_WRITE_RENDER_BASELINE=1` rewrites them, only ever from that baseline).
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { register } from 'node:module';
import { test } from 'node:test';
import { renderMatrix } from './render-matrix.ts';

register('./render-loader.mjs', import.meta.url);
const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { ArtifactView, templatesFor } = await import('../src/components/render/ArtifactView.tsx');

const BASELINE = join(import.meta.dirname, 'fixtures', 'bilingual', 'render-baseline.json');
// Test-only: the renderer takes the fixture's RenderData.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const render = (d: any) => renderToStaticMarkup(createElement(ArtifactView, { data: d }));

test('without translations, every kind × template × locale renders the markup main rendered (read-proof)', () => {
  const now = renderMatrix(render, templatesFor);
  if (process.env.CV_WRITE_RENDER_BASELINE === '1') {
    writeFileSync(BASELINE, `${JSON.stringify({ source: 'main@cab8e0d0 (before W7-B4)', hashes: now }, null, 2)}\n`);
    return;
  }
  const { hashes } = JSON.parse(readFileSync(BASELINE, 'utf8')) as { hashes: Record<string, string> };
  assert.ok(Object.keys(hashes).length >= 32, `baseline cases: ${Object.keys(hashes).length}`);
  assert.deepEqual(Object.keys(now).sort(), Object.keys(hashes).sort(), 'same cases');
  for (const [key, hash] of Object.entries(hashes)) assert.equal(now[key], hash, `${key}: same markup as main`);
});
