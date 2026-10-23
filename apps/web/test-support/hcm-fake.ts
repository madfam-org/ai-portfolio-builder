/**
 * A local, SYNTHETIC stand-in for Symbiosis HCM (W5-H): Janua's client-credentials token endpoint and HCM's
 * `GET /api/v1/market-benchmarks/`, on one loopback port. Used by the unit tests, the pg suite and the e2e server
 * launcher. Every figure here is invented for tests and labelled SINTÉTICO; none is INEGI data.
 *
 * Titles drive the answer: «desarroll…»/«software» → ok (SINCO 2271; state cell for MX-CMX, national fallback for any
 * other state), «contador…» → insufficient_data (n = 12), «falla» → 503, anything else → occupation_unresolved.
 * Retail (W7 segment view): «advisor»/«asesor»/«vendedor» → 4211 (state cell for MX-CMX); «subgerente»/«assistant»/
 * «jefa de piso» → 1711 (national, quartiles only); «manager»/«gerente» → 1411 (national). `sinco=` answers the same
 * occupations. `segment=retail_apparel_personal`: 4211 → its own synthetic cells (CDMX n = 30, quartiles only),
 * 1411 → insufficient_data (n = 12), 1711 → 503; any other segment id → 400, as HCM's allowlist does.
 * It records every request so tests can prove what cv sent (title or SINCO, state, segment; never a person).
 */
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';

export const FAKE_CLIENT_ID = 'cv-hcm-test-client';

export interface FakeHcmRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

export interface FakeHcm {
  url: string;
  env: Record<string, string>;
  requests: FakeHcmRequest[];
  tokensIssued: () => number;
  close: () => Promise<void>;
}

const PERCENTILES = { p10: 10_950, p25: 12_450, p50: 14_950, p75: 17_450, p90: 18_950 };
const NATIONAL = { p10: 11_150, p25: 12_950, p50: 15_950, p75: 18_950, p90: 30_000 };
export const FAKE_SEGMENT = 'retail_apparel_personal';
/** Synthetic retail figures (invented; the source block says SINTÉTICO). */
const RETAIL = {
  '4211': {
    title: 'Empleados de ventas, despachadores y dependientes en comercios',
    state: { n: 140, p: { p10: 4_000, p25: 5_500, p50: 8_000, p75: 10_000, p90: 13_000 } },
    national: { n: 6_000, p: { p10: 3_300, p25: 5_200, p50: 7_700, p75: 10_000, p90: 12_800 } },
    segmentState: { n: 30, p: { p10: null, p25: 4_400, p50: 6_400, p75: 8_400, p90: null } },
    segmentNational: { n: 1_200, p: { p10: 2_600, p25: 4_500, p50: 7_000, p75: 9_000, p90: 10_700 } },
  },
  '1411': {
    title: 'Directores y gerentes de ventas, comercialización y alquiler',
    state: null,
    national: { n: 350, p: { p10: 10_000, p25: 13_000, p50: 16_500, p75: 26_000, p90: 45_000 } },
    segmentState: null,
    segmentNational: null,
  },
  '1711': {
    title: 'Coordinadores y jefes de área de ventas, comercialización y alquiler',
    state: null,
    national: { n: 97, p: { p10: null, p25: 12_000, p50: 14_000, p75: 20_000, p90: null } },
    segmentState: null,
    segmentNational: null,
  },
} as const;
const SEGMENT_BLOCK = {
  id: FAKE_SEGMENT,
  available: true,
  label:
    'Comercio al por menor en tiendas de ropa, calzado, bisutería y accesorios de vestir (incluye artículos de piel), y de artículos de uso personal (incluye perfumería, cosméticos, joyería y relojes); no solo lujo',
  label_en:
    'Retail stores selling clothing, footwear, costume jewellery and accessories (including leather goods), and personal items (including perfume, cosmetics, jewellery and watches); not only luxury',
  scope_note: 'SINTÉTICO: nota de alcance de prueba. La ENOE no identifica marcas ni distingue tiendas de lujo.',
  industry_classification: 'SCIAN 2018, versión hogares (catálogo p4a de la ENOE)',
  industries: [
    { code: '4631', title: 'Comercio al por menor de productos textiles, bisutería, accesorios de vestir y calzado' },
    { code: '4651', title: 'Comercio al por menor de artículos de papelería, para el esparcimiento y otros artículos de uso personal' },
  ],
};

function envelope() {
  return {
    data_kind: 'public_official_aggregate',
    period: { label: '2031-Q3', start: '2031-07-01', end: '2031-09-30' },
    source: {
      name: 'SINTÉTICO de pruebas (no es INEGI)',
      dataset_id: 'MEX-INEGI.SYNTHETIC-ENOE-2031-III',
      url: 'https://www.inegi.org.mx/contenidos/programas/enoe/15ymas/datosabiertos/2031/conjunto_de_datos_enoe_2031_3t_csv.zip',
      program_url: 'https://www.inegi.org.mx/programas/enoe/15ymas/',
      licence_url: 'https://www.inegi.org.mx/inegi/terminos.html',
      retrieved_at: '2031-11-01T12:00:00+00:00',
      citation: 'SINTÉTICO — datos inventados para pruebas, no son de INEGI.',
    },
    methodology: { minimum_n: 30, tails_minimum_n: 100, notes: ['SINTÉTICO: nota metodológica de prueba.'] },
  };
}

const geography = (requested: string | null, scope: 'state' | 'national' | null, reason: string | null, n: number | null) => ({
  requested_state: requested,
  state: scope === 'state' ? requested : null,
  scope,
  fallback_reason: reason,
  requested_state_n: n,
});

function retailCode(t: string, sinco: string | null): '4211' | '1411' | '1711' | null {
  if (sinco) return sinco in RETAIL ? (sinco as '4211' | '1411' | '1711') : null;
  if (t.includes('advisor') || t.includes('asesor') || t.includes('vendedor')) return '4211';
  if (t.includes('subgerente') || t.includes('assistant') || t.includes('jefa de piso')) return '1711';
  if (t.includes('manager') || t.includes('gerente')) return '1411';
  return null;
}

type Cell = { n: number; p: Record<'p10' | 'p25' | 'p50' | 'p75' | 'p90', number | null> } | null;

function retailBenchmark(code: '4211' | '1411' | '1711', state: string | null, segment: string | null): { status: number; body: unknown } {
  const r = RETAIL[code];
  if (segment && code === '1711') return { status: 503, body: { status: 'unavailable' } };
  const local: Cell = segment ? r.segmentState : r.state;
  const national: Cell = segment ? r.segmentNational : r.national;
  const useState = state === 'MX-CMX' && local !== null;
  const cell = useState ? local : national;
  const occupation = {
    sinco: code,
    title: r.title,
    taxonomy: 'SINCO 2019 (catálogo p3 de la ENOE)',
    aliases_version: 'synthetic',
    match: { method: 'alias_exact', confidence: 0.8, matched_phrase: 'sintético', ignored_terms: [], alternatives: [] },
  };
  const geo = useState ? geography(state, 'state', null, cell!.n) : geography(state, cell ? 'national' : null, state ? 'state_cell_below_minimum_n' : null, state ? 14 : null);
  const base = { ...envelope(), occupation, segment: segment ? SEGMENT_BLOCK : null, geography: geo };
  if (!cell) {
    return { status: 200, body: { ...base, status: 'insufficient_data', income: null, suppression: { reason: 'below_minimum_n', n: 12, minimum_n: 30 } } };
  }
  const income = { currency: 'MXN', period: 'month', concept: 'declared_monthly_income_main_job', percentiles: cell.p, n: cell.n, weighted_population: cell.n * 400, income_reporting_share: '0.600' };
  return { status: 200, body: { ...base, status: 'ok', income, suppression: null } };
}

export function fakeBenchmark(title: string, state: string | null, sinco: string | null = null, segment: string | null = null): { status: number; body: unknown } {
  const t = title.toLowerCase();
  if (segment !== null && segment !== FAKE_SEGMENT) return { status: 400, body: { status: 'invalid_query' } };
  if (t.includes('falla')) return { status: 503, body: { status: 'unavailable' } };
  const retail = retailCode(t, sinco);
  if (retail) return retailBenchmark(retail, state, segment);
  if (segment) return { status: 200, body: { ...envelope(), status: 'insufficient_data', occupation: null, segment: SEGMENT_BLOCK, geography: geography(state, null, null, null), income: null, suppression: { reason: 'below_minimum_n', n: 0, minimum_n: 30 } } };
  if (t.includes('desarroll') || t.includes('software')) {
    const local = state === 'MX-CMX';
    return {
      status: 200,
      body: {
        ...envelope(),
        status: 'ok',
        occupation: {
          sinco: '2271',
          title: 'Desarrolladores y analistas de software y multimedia',
          taxonomy: 'SINCO 2019 (catálogo p3 de la ENOE)',
          aliases_version: 'synthetic',
          match: { method: 'alias_fuzzy', confidence: 0.74, matched_phrase: 'desarrollador', ignored_terms: ['sr'], alternatives: [] },
        },
        geography: local ? geography(state, 'state', null, 100) : geography(state, 'national', state ? 'state_cell_below_minimum_n' : null, state ? 20 : null),
        income: {
          currency: 'MXN',
          period: 'month',
          concept: 'declared_monthly_income_main_job',
          percentiles: local ? PERCENTILES : NATIONAL,
          n: local ? 100 : 120,
          weighted_population: local ? 10_100 : 12_100,
          income_reporting_share: '0.990',
        },
        suppression: null,
      },
    };
  }
  if (t.includes('contador')) {
    return {
      status: 200,
      body: {
        ...envelope(),
        status: 'insufficient_data',
        occupation: {
          sinco: '2121',
          title: 'Contadores y auditores',
          taxonomy: 'SINCO 2019 (catálogo p3 de la ENOE)',
          aliases_version: 'synthetic',
          match: { method: 'alias_exact', confidence: 0.95, matched_phrase: 'contador', ignored_terms: [], alternatives: [] },
        },
        geography: geography(state, null, state ? 'state_cell_below_minimum_n' : null, state ? 3 : null),
        income: null,
        suppression: { reason: 'below_minimum_n', n: 12, minimum_n: 30 },
      },
    };
  }
  return {
    status: 200,
    body: { ...envelope(), status: 'occupation_unresolved', occupation: null, candidates: [], geography: geography(state, null, null, null), income: null, suppression: null },
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c: string) => (body += c));
    req.on('end', () => resolve(body));
  });
}

/** Starts the fake on a loopback port (0 = any free port). */
export async function startFakeHcm(port = 0): Promise<FakeHcm> {
  const secret = randomBytes(24).toString('hex');
  const tokens = new Set<string>();
  const requests: FakeHcmRequest[] = [];
  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://fake.local');
      const body = await readBody(req);
      requests.push({ method: req.method ?? '', path: url.pathname, query: Object.fromEntries(url.searchParams), headers: req.headers, body });
      const send = (status: number, payload: unknown) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(payload));
      if (req.method === 'POST' && url.pathname === '/api/v1/oauth/token') {
        const expected = `Basic ${Buffer.from(`${FAKE_CLIENT_ID}:${secret}`).toString('base64')}`;
        const form = new URLSearchParams(body);
        if (req.headers.authorization !== expected || form.get('grant_type') !== 'client_credentials') return send(401, { error: 'invalid_client' });
        if (form.get('scope') !== 'hcm-benchmarks:read') return send(400, { error: 'invalid_scope' });
        const token = randomBytes(32).toString('base64url');
        tokens.add(token);
        return send(200, { access_token: token, token_type: 'Bearer', expires_in: 3600, scope: 'hcm-benchmarks:read' });
      }
      if (req.method === 'GET' && url.pathname === '/api/v1/market-benchmarks/') {
        const bearer = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
        if (!tokens.has(bearer)) return send(401, { detail: 'not authenticated' });
        const answer = fakeBenchmark(url.searchParams.get('title') ?? '', url.searchParams.get('state'), url.searchParams.get('sinco'), url.searchParams.get('segment'));
        return send(answer.status, answer.body);
      }
      return send(404, { detail: 'not found' });
    })().catch(() => res.writeHead(500).end());
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const address = server.address();
  const actual = typeof address === 'object' && address ? address.port : port;
  const url = `http://127.0.0.1:${actual}`;
  return {
    url,
    env: { HCM_API_URL: url, HCM_TOKEN_URL: `${url}/api/v1/oauth/token`, HCM_CLIENT_ID: FAKE_CLIENT_ID, HCM_CLIENT_SECRET: secret },
    requests,
    tokensIssued: () => tokens.size,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
