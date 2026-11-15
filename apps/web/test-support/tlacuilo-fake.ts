/**
 * A local, SYNTHETIC stand-in for tlacuilo's `text_document` lane: Janua's client-credentials token endpoint and
 * `POST /v1/extractions`, on one loopback port. Used by the unit tests. It reads no image: every answer is the fixed
 * synthetic posting below (an invented employer on `.example`), shaped as `document-extraction/v1` with the `text`
 * block.
 *
 * The uploaded bytes drive the answer, by an ASCII marker anywhere in them: `FAKE-BLANK` → 422 `unreadable_scan`,
 * `FAKE-BUSY` → 503 `ocr_busy`, `FAKE-DOWN` → 500, `FAKE-SHAPE` → 200 with an unexpected body, `FAKE-POOR` → a poor
 * reading; anything else → the posting. It records every request (never the image itself: its size and what the
 * multipart said) so tests can prove what cv sent.
 */
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';

export const FAKE_TLACUILO_CLIENT_ID = 'cv-tlacuilo-test-client';
export const FAKE_POSTING_LINES = [
  'Vacante: Asesora de ventas bilingue',
  'Empresa: Boutique Ejemplo',
  'Ubicacion: Ciudad de Mexico',
  'Sueldo: $14,000 mensuales',
  'Atencion a clientes en espanol e ingles, seguimiento de cartera y metas de venta mensuales.',
  'Contacto: empleos@boutique-ejemplo.example',
];

export interface FakeTlacuiloRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  /** Token calls: the form body. Extraction calls: empty (the image is never kept). */
  body: string;
  bytes: number;
  documentType: string | null;
  mode: string | null;
  filename: string | null;
  fileType: string | null;
}

export interface FakeTlacuilo {
  url: string;
  env: Record<string, string>;
  requests: FakeTlacuiloRequest[];
  tokensIssued: () => number;
  /** Forget every issued token (the next extraction answers 401 once). */
  revokeTokens: () => void;
  close: () => Promise<void>;
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function fakeExtraction(marker: string): { status: number; body: unknown } {
  if (marker.includes('FAKE-BLANK')) return { status: 422, body: { error: 'unreadable_scan', job: 'job_fake', pages: 1 } };
  if (marker.includes('FAKE-BUSY')) return { status: 503, body: { error: 'ocr_busy', job: 'job_fake' } };
  if (marker.includes('FAKE-DOWN')) return { status: 500, body: { detail: 'boom' } };
  if (marker.includes('FAKE-SHAPE')) return { status: 200, body: { contract: 'document-extraction/v1', text: 'not the block' } };
  const poor = marker.includes('FAKE-POOR');
  const conf = poor ? 0.41 : 0.93;
  const lines = FAKE_POSTING_LINES.map((text, i) => ({ text, confidence: conf, bbox: [40, 60 + i * 30, 900, 84 + i * 30] }));
  return {
    status: 200,
    body: {
      contract: 'document-extraction/v1',
      document: { type: 'text_document', mimeType: 'image/jpeg', pages: 1, language: null, sha256: 'a'.repeat(64), sizeBytes: 1, classification: 'restricted' },
      provenance: { service: 'tlacuilo', version: 'fake', engines: { text: null, layout: null, ocr: 'tesseract (synthetic)', vlm: null }, parser: 'text.lines.v1', fingerprintConfidence: 0, durationMs: 1 },
      statement: null,
      text: {
        source: 'ocr',
        pagesRead: 1,
        characters: FAKE_POSTING_LINES.join('').length,
        pages: [{ page: 1, meanWordConfidence: conf, lines: [...lines, { text: '   ', confidence: 0.2, bbox: null }] }],
        quality: { verdict: poor ? 'poor' : 'good' },
      },
      validation: { balanceReconciles: null, sumOfRows: null, expectedDelta: null, unparsedLines: 0, warnings: ['text read by OCR: confirm it against the document'] },
      fields: {},
    },
  };
}

export async function startFakeTlacuilo(port = 0): Promise<FakeTlacuilo> {
  const secret = randomBytes(24).toString('hex');
  const tokens = new Set<string>();
  const requests: FakeTlacuiloRequest[] = [];
  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://fake.local');
      const raw = await readBody(req);
      const send = (status: number, payload: unknown) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(payload));
      const record = (extra: Partial<FakeTlacuiloRequest>) =>
        requests.push({ method: req.method ?? '', path: url.pathname, headers: req.headers, body: '', bytes: raw.byteLength, documentType: null, mode: null, filename: null, fileType: null, ...extra });
      if (req.method === 'POST' && url.pathname === '/api/v1/oauth/token') {
        const body = raw.toString('utf8');
        record({ body });
        const expected = `Basic ${Buffer.from(`${FAKE_TLACUILO_CLIENT_ID}:${secret}`).toString('base64')}`;
        const form = new URLSearchParams(body);
        if (req.headers.authorization !== expected || form.get('grant_type') !== 'client_credentials') return send(401, { error: 'invalid_client' });
        if (form.get('scope') !== 'tlacuilo:extract') return send(400, { error: 'invalid_scope' });
        const token = randomBytes(32).toString('base64url');
        tokens.add(token);
        return send(200, { access_token: token, token_type: 'Bearer', expires_in: 3600, scope: 'tlacuilo:extract' });
      }
      if (req.method === 'POST' && url.pathname === '/v1/extractions') {
        const text = raw.toString('latin1');
        const field = (name: string) => new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`).exec(text)?.[1] ?? null;
        const file = /name="file"; filename="([^"]*)"\r\nContent-Type: ([^\r]*)/.exec(text);
        record({ documentType: field('document_type'), mode: field('mode'), filename: file?.[1] ?? null, fileType: file?.[2] ?? null });
        const bearer = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
        if (!tokens.has(bearer)) return send(401, { detail: { error: 'invalid_token' } });
        if (!req.headers['x-sensitivity']) return send(400, { detail: { error: 'missing_sensitivity' } });
        if (field('document_type') !== 'text_document') return send(400, { detail: { error: 'invalid_document_type' } });
        const answer = fakeExtraction(text);
        return send(answer.status, answer.body);
      }
      record({});
      return send(404, { detail: 'not found' });
    })().catch(() => res.writeHead(500).end());
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const address = server.address();
  const actual = typeof address === 'object' && address ? address.port : port;
  const url = `http://127.0.0.1:${actual}`;
  return {
    url,
    env: { TLACUILO_API_URL: url, TLACUILO_TOKEN_URL: `${url}/api/v1/oauth/token`, TLACUILO_CLIENT_ID: FAKE_TLACUILO_CLIENT_ID, TLACUILO_CLIENT_SECRET: secret },
    requests,
    tokensIssued: () => tokens.size,
    revokeTokens: () => tokens.clear(),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
