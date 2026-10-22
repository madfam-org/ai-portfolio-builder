import { headers } from 'next/headers';
import type { PaperStockView } from '@/lib/pliego/paper';
import { cspNonce, paperVarsCss } from './paper-vars';

/**
 * Server-rendered paper custom properties for pages that must not depend on script (the pages host, W5-P phase 2):
 * a `<style>` carrying this request's CSP nonce, so the strict `style-src 'self' 'nonce-…'` admits it and no `style`
 * attribute is ever written. Without a nonce (no policy on the request) it renders nothing and the sheet stays white.
 */
export async function PaperStyle({ stocks }: { stocks: readonly PaperStockView[] }) {
  const nonce = cspNonce((await headers()).get('content-security-policy'));
  const css = paperVarsCss(stocks);
  if (!nonce || !css) return null;
  return <style nonce={nonce}>{css}</style>;
}
