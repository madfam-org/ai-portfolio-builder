/**
 * W5-J: the typed seam for what the intake does NOT do yet. Nothing in this file calls a network or a model.
 *
 * OCR is no longer a seam: scanned PDFs, photos and screenshots of a posting are read through tlacuilo, the
 * ecosystem's document-intelligence service (`server/tlacuilo/`: its `text_document` lane, one page per call, rules
 * and a local engine only, nothing kept). cv ships no OCR engine of its own. It is dormant until its three settings
 * exist (docs/DEPLOYMENT.md), and the app says «aún no leemos imágenes» until then.
 *
 * Still off — AI structuring of a posting's free text. The LLM path is Selva `/v1` with `X-Sensitivity: restricted`
 * (personal data); its restricted backend answers 503 `local_backend_unavailable` today. A later wave implements this
 * seam; cv never holds a provider key or SDK.
 */
import type { DraftFields } from './types.ts';

export interface PostingStructurer {
  readonly name: 'selva';
  /** Fields the text states; the caller marks them for review and never overwrites a field a parser found. */
  structure(text: string, locale: 'es-MX' | 'en'): Promise<DraftFields>;
}

/** Off until Selva's restricted tier is live and the owner turns AI parsing on (decisions/2026-10-22-cv-import.md). */
export const POSTING_STRUCTURER: PostingStructurer | null = null;
