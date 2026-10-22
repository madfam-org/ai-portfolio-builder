/**
 * W5-J: typed seams for what the intake does NOT do yet, both OFF. Nothing in this file calls a network or a model.
 *
 * 1. OCR (scanned PDFs, photos, screenshots of a posting). The ecosystem's OCR platform is tlacuilo (internal-devops
 *    RFC 0040, ACCEPTED 2026-09-05). On 2026-10-22 it is beta: its extraction API has never served in production, its
 *    in-cluster NetworkPolicy admits only dhanam and karafiel, it reads text-layer PDFs only (OCR is its M1), and its
 *    `document-extraction/v1` contract has no job-posting or résumé document type. cv must not ship its own OCR engine,
 *    so the app says «aún no leemos imágenes» and this seam waits for tlacuilo (Janua client-credentials token,
 *    aud `tlacuilo`, `POST /v1/extractions`, header `X-Sensitivity`).
 * 2. AI structuring of a posting's free text. The LLM path is Selva `/v1` with `X-Sensitivity: restricted` (personal
 *    data); its restricted backend answers 503 `local_backend_unavailable` today. A later wave implements this seam;
 *    cv never holds a provider key or SDK.
 */
import type { DraftFields } from './types.ts';

export interface OcrRequest {
  bytes: Uint8Array;
  mediaType: 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp';
  /** Personal data: always `restricted`. */
  sensitivity: 'restricted';
}
export interface OcrResult {
  text: string;
  pages: number;
}
export interface OcrProvider {
  readonly name: 'tlacuilo';
  extract(request: OcrRequest): Promise<OcrResult>;
}

export interface PostingStructurer {
  readonly name: 'selva';
  /** Fields the text states; the caller marks them for review and never overwrites a field a parser found. */
  structure(text: string, locale: 'es-MX' | 'en'): Promise<DraftFields>;
}

/** Off until tlacuilo serves OCR to cv (owner + RFC 0040 amendment). */
export const OCR_PROVIDER: OcrProvider | null = null;
/** Off until Selva's restricted tier is live and the owner turns AI parsing on (decisions/2026-10-22-cv-import.md). */
export const POSTING_STRUCTURER: PostingStructurer | null = null;
