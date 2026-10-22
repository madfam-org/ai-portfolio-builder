/** W5-P phase 2: the server-rendered paper properties (pages host) carry only checked values. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cspNonce, paperVarsCss } from '../src/components/paper/paper-vars.ts';
import { paperStock, paperStocks } from '../src/lib/pliego/paper.ts';

test('paperVarsCss: one rule per stock from the cards', () => {
  assert.equal(paperVarsCss([paperStock('copy-80')]), '[data-paper-stock="copy-80"]{--paper-face:#f7f7f2;--paper-edge:1px}');
  assert.equal(
    paperVarsCss(paperStocks()),
    '[data-paper-stock="copy-80"]{--paper-face:#f7f7f2;--paper-edge:1px}[data-paper-stock="cardstock-160"]{--paper-face:#f4efe6;--paper-edge:2px}',
  );
});

test('paperVarsCss: anything that is not a checked value never reaches the stylesheet', () => {
  const bond = paperStock('copy-80');
  for (const bad of [
    { ...bond, look: { face: 'red;}body{display:none', edgePx: 1 } },
    { ...bond, look: { face: '#F7F7F2', edgePx: 1 } },
    { ...bond, look: { face: '#f7f7f2', edgePx: 1.5 } },
    { ...bond, look: { face: '#f7f7f2', edgePx: 40 } },
    { ...bond, id: 'x"]{}*{color:red' as 'copy-80' },
  ]) {
    assert.equal(paperVarsCss([bad]), '');
  }
});

test('cspNonce: reads the request policy, refuses a missing or short nonce', () => {
  assert.equal(cspNonce("default-src 'none'; style-src 'self' 'nonce-AbC123+/=_-xyzXYZ09'"), 'AbC123+/=_-xyzXYZ09');
  assert.equal(cspNonce("default-src 'none'"), null);
  assert.equal(cspNonce("style-src 'nonce-short'"), null);
  assert.equal(cspNonce(null), null);
});
