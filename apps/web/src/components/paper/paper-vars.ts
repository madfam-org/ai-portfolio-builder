/**
 * The paper custom properties as CSS text (W5-P phase 2): `[data-paper-stock="<id>"]{--paper-face:…;--paper-edge:…}`
 * for each stock, from Pliego's cards (`lib/pliego/paper.ts`). Used where the page must look like paper WITHOUT script:
 * the pages host renders it in a nonce'd `<style>` (PaperStyle.tsx). Every value is checked here as well as at the
 * source (a #rrggbb colour, a whole number of pixels, a known stock id), so nothing else can reach the stylesheet.
 */
import type { PaperStockView } from '../../lib/pliego/paper.ts';

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HEX = /^#[0-9a-f]{6}$/;

export function paperVarsCss(stocks: readonly PaperStockView[]): string {
  return stocks
    .filter((s) => ID.test(s.id) && HEX.test(s.look.face) && Number.isInteger(s.look.edgePx) && s.look.edgePx >= 1 && s.look.edgePx <= 3)
    .map((s) => `[data-paper-stock="${s.id}"]{--paper-face:${s.look.face};--paper-edge:${s.look.edgePx}px}`)
    .join('');
}

/** The nonce of the request's CSP (the proxy sets the policy on the request; Next.js stamps its scripts from it). */
export function cspNonce(policy: string | null | undefined): string | null {
  return /'nonce-([A-Za-z0-9+/=_-]{16,})'/.exec(policy ?? '')?.[1] ?? null;
}
