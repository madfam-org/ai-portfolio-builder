/**
 * W5-J fetcher and robots.txt over a FAKE resolver and transport (no network): DNS answers are vetted (one private
 * answer refuses the name), the socket gets the vetted address, every redirect is re-validated (scheme, port, host,
 * DNS) and capped at 3, no cookie or credential is ever sent, status / media type / size / time are enforced, a gzip
 * bomb stops at the cap, and robots.txt follows RFC 9309.
 */
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { FETCH_LIMITS, FetchError, INTAKE_USER_AGENT, decodeBody, safeFetch, type ResolvedAddress, type Resolver, type Transport, type TransportRequest } from '../src/server/ingest/fetcher.ts';
import { clearRobotsCache, parseRobots, robotsAllows, robotsVerdict } from '../src/server/ingest/robots.ts';

type Reply = { status: number; headers?: Record<string, string>; body?: string | Buffer | Readable };

function fake(dns: Record<string, string[]>, replies: Record<string, Reply | (() => Reply)>) {
  const seen: TransportRequest[] = [];
  const resolver: Resolver = async (host) => {
    const found = dns[host];
    if (!found) throw new Error('ENOTFOUND');
    return found.map((address): ResolvedAddress => ({ address, family: address.includes(':') ? 6 : 4 }));
  };
  const transport: Transport = async (req) => {
    seen.push(req);
    const r = replies[`${req.hostname}${req.path}`];
    if (!r) return { status: 404, headers: {}, body: Readable.from([]) };
    const reply = typeof r === 'function' ? r() : r;
    const body = reply.body instanceof Readable ? reply.body : Readable.from(reply.body === undefined ? [] : [Buffer.from(reply.body)]);
    return { status: reply.status, headers: reply.headers ?? {}, body };
  };
  return { resolver, transport, seen };
}

const html = { 'content-type': 'text/html; charset=utf-8' };
async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (err) {
    return err instanceof FetchError ? `${err.code}${err.status ? `:${err.status}` : ''}` : `other:${String(err)}`;
  }
}

test('a public answer is fetched over the vetted address with cv headers and no cookie or credential', async () => {
  const f = fake({ 'empleos.example.org': ['93.184.215.14'] }, { 'empleos.example.org/v/1?x=1': { status: 200, headers: { ...html, 'set-cookie': 'a=b' }, body: '<p>hola</p>' } });
  const doc = await safeFetch('https://empleos.example.org/v/1?x=1', { accept: ['text/html'], resolver: f.resolver, transport: f.transport });
  assert.equal(decodeBody(doc), '<p>hola</p>');
  assert.equal(f.seen.length, 1);
  const req = f.seen[0]!;
  assert.deepEqual(req.address, { address: '93.184.215.14', family: 4 });
  assert.equal(req.headers['User-Agent'], INTAKE_USER_AGENT);
  assert.match(INTAKE_USER_AGENT, /https:\/\/cv\.madfam\.io\//);
  const names = Object.keys(req.headers).map((h) => h.toLowerCase());
  for (const forbidden of ['cookie', 'authorization', 'proxy-authorization']) assert.ok(!names.includes(forbidden), forbidden);
});

test('DNS: one private answer among public ones refuses the name; no answer and resolver errors are dns_failed', async () => {
  const f = fake({ 'mixed.example.org': ['93.184.215.14', '10.0.0.5'], 'meta.example.org': ['169.254.169.254'], 'v6.example.org': ['::ffff:127.0.0.1'], 'none.example.org': [] }, {});
  const opts = { accept: ['text/html'], resolver: f.resolver, transport: f.transport };
  assert.equal(await code(safeFetch('https://mixed.example.org/', opts)), 'private_address');
  assert.equal(await code(safeFetch('https://meta.example.org/', opts)), 'private_address');
  assert.equal(await code(safeFetch('https://v6.example.org/', opts)), 'private_address');
  assert.equal(await code(safeFetch('https://none.example.org/', opts)), 'dns_failed');
  assert.equal(await code(safeFetch('https://missing.example.org/', opts)), 'dns_failed');
  assert.equal(f.seen.length, 0, 'nothing connected');
});

test('redirects: each hop is re-validated (scheme, port, userinfo, host, DNS) and at most 3 are followed', async () => {
  const dns = { 'a.example.org': ['93.184.215.14'], 'b.example.org': ['93.184.215.15'], 'evil.example.org': ['127.0.0.1'] };
  const to = (location: string): Reply => ({ status: 302, headers: { location } });
  const f = fake(dns, {
    'a.example.org/http': to('http://b.example.org/'),
    'a.example.org/port': to('https://b.example.org:8080/'),
    'a.example.org/creds': to('https://u:p@b.example.org/'),
    'a.example.org/local': to('https://localhost/'),
    'a.example.org/rebind': to('https://evil.example.org/'),
    'a.example.org/ip': to('https://169.254.169.254/latest/meta-data/'),
    'a.example.org/ok': to('/final'),
    'a.example.org/final': { status: 200, headers: html, body: 'fin' },
    'a.example.org/loop1': to('/loop2'),
    'a.example.org/loop2': to('/loop3'),
    'a.example.org/loop3': to('/loop4'),
    'a.example.org/loop4': to('/final'),
  });
  const opts = { accept: ['text/html'], resolver: f.resolver, transport: f.transport };
  assert.equal(await code(safeFetch('https://a.example.org/http', opts)), 'not_https');
  assert.equal(await code(safeFetch('https://a.example.org/port', opts)), 'bad_port');
  assert.equal(await code(safeFetch('https://a.example.org/creds', opts)), 'credentials');
  assert.equal(await code(safeFetch('https://a.example.org/local', opts)), 'blocked_host');
  assert.equal(await code(safeFetch('https://a.example.org/rebind', opts)), 'private_address');
  assert.equal(await code(safeFetch('https://a.example.org/ip', opts)), 'private_address');
  const ok = await safeFetch('https://a.example.org/ok', opts);
  assert.equal(ok.url.toString(), 'https://a.example.org/final');
  assert.equal(await code(safeFetch('https://a.example.org/loop1', opts)), 'too_many_redirects');
  assert.ok(!f.seen.some((r) => r.hostname === 'evil.example.org' || r.hostname === 'localhost'), 'never connected to a refused host');
});

test('status, media type, declared and streamed size, a gzip bomb, and the deadline are enforced', async () => {
  const big = Buffer.alloc(FETCH_LIMITS.maxBytes + 10, 0x61);
  const bomb = gzipSync(Buffer.alloc(20 * 1024 * 1024, 0x20));
  const f = fake(
    { 'a.example.org': ['93.184.215.14'] },
    {
      'a.example.org/403': { status: 403, headers: html, body: 'no' },
      'a.example.org/500': { status: 500, headers: html },
      'a.example.org/pdf': { status: 200, headers: { 'content-type': 'application/pdf' }, body: '%PDF' },
      'a.example.org/notype': { status: 200, headers: {}, body: 'x' },
      'a.example.org/declared': { status: 200, headers: { ...html, 'content-length': String(FETCH_LIMITS.maxBytes + 1) }, body: 'x' },
      'a.example.org/streamed': { status: 200, headers: html, body: big },
      'a.example.org/bomb': { status: 200, headers: { ...html, 'content-encoding': 'gzip' }, body: bomb },
      'a.example.org/gzip': { status: 200, headers: { ...html, 'content-encoding': 'gzip' }, body: gzipSync(Buffer.from('<p>comprimido</p>')) },
      'a.example.org/weird': { status: 200, headers: { ...html, 'content-encoding': 'zstd-unknown' }, body: 'x' },
      'a.example.org/slow': () => ({ status: 200, headers: html, body: new Readable({ read() {} }) }),
    },
  );
  const opts = { accept: ['text/html'], resolver: f.resolver, transport: f.transport };
  assert.equal(await code(safeFetch('https://a.example.org/403', opts)), 'http_status:403');
  assert.equal(await code(safeFetch('https://a.example.org/500', opts)), 'http_status:500');
  assert.equal(await code(safeFetch('https://a.example.org/pdf', opts)), 'unsupported_type');
  assert.equal(await code(safeFetch('https://a.example.org/notype', opts)), 'unsupported_type');
  assert.equal(await code(safeFetch('https://a.example.org/declared', opts)), 'too_large');
  assert.equal(await code(safeFetch('https://a.example.org/streamed', opts)), 'too_large');
  assert.equal(await code(safeFetch('https://a.example.org/bomb', opts)), 'too_large');
  assert.equal(decodeBody(await safeFetch('https://a.example.org/gzip', opts)), '<p>comprimido</p>');
  assert.equal(await code(safeFetch('https://a.example.org/weird', opts)), 'unsupported_type');
  assert.equal(await code(safeFetch('https://a.example.org/slow', { ...opts, deadline: Date.now() + 150 })), 'timeout');
  assert.equal(await code(safeFetch('https://a.example.org/403', { ...opts, deadline: Date.now() - 1 })), 'timeout');
});

test('the wire bytes are capped too: a deflate stream of empty blocks (no output) stops at the cap', async () => {
  const empty = Buffer.concat([Buffer.from([0x78, 0x01]), ...Array.from({ length: 400 }, () => Buffer.from([0x00, 0x00, 0x00, 0xff, 0xff]))]);
  const f = fake({ 'a.example.org': ['93.184.215.14'] }, { 'a.example.org/z': { status: 200, headers: { ...html, 'content-encoding': 'deflate' }, body: Readable.from([empty.subarray(0, 1000), empty.subarray(1000)]) } });
  assert.equal(await code(safeFetch('https://a.example.org/z', { accept: ['text/html'], resolver: f.resolver, transport: f.transport, maxBytes: 1500 })), 'too_large');
});

test('decodeBody: declared charset, then <meta charset>, then UTF-8', () => {
  const latin = Buffer.from('<meta charset="iso-8859-1"><p>Ubicación: León</p>', 'latin1');
  assert.match(decodeBody({ bytes: latin, charset: null, mediaType: 'text/html' }), /Ubicación: León/);
  assert.match(decodeBody({ bytes: Buffer.from('Año', 'latin1'), charset: 'windows-1252', mediaType: 'text/html' }), /Año/);
  assert.equal(decodeBody({ bytes: Buffer.from('ñ'), charset: 'no-such-charset', mediaType: 'text/html' }), 'ñ');
});

test('robots.txt: our token, then *, longest match, Allow wins ties, wildcards and $', () => {
  const groups = parseRobots(
    ['User-agent: *', 'Disallow: /empleos/', 'Allow: /empleos/oferta/', 'Disallow: /*.pdf$', '', 'User-agent: OtherBot', 'Disallow: /', '# comment', 'Sitemap: https://x/s.xml'].join('\n'),
  );
  assert.equal(robotsAllows(groups, '/empleos/buscar?q=x'), false);
  assert.equal(robotsAllows(groups, '/empleos/oferta/123-dev'), true);
  assert.equal(robotsAllows(groups, '/doc/vacante.pdf'), false);
  assert.equal(robotsAllows(groups, '/doc/vacante.pdf?x=1'), true);
  assert.equal(robotsAllows(groups, '/'), true);
  const ours = parseRobots('User-agent: *\nAllow: /\n\nUser-agent: madfam-cv\nDisallow: /jobs\n');
  assert.equal(robotsAllows(ours, '/jobs/1'), false, 'the madfam-cv group wins over *');
  const all = parseRobots('User-agent: *\nDisallow: /\n');
  assert.equal(robotsAllows(all, '/jobs/view/1'), false);
  assert.equal(robotsAllows(parseRobots('User-agent: *\nDisallow:\n'), '/x'), true, 'an empty Disallow allows all');
  assert.equal(robotsAllows(parseRobots(''), '/x'), true);
  const tie = parseRobots('User-agent: *\nDisallow: /a\nAllow: /a\n');
  assert.equal(robotsAllows(tie, '/a/b'), true);
});

test('robots verdicts: 2xx parsed, 4xx allows, 5xx and network failures disallow (RFC 9309)', async () => {
  clearRobotsCache();
  const f = fake(
    { 'ok.example.org': ['93.184.215.14'], 'gone.example.org': ['93.184.215.14'], 'down.example.org': ['93.184.215.14'], 'priv.example.org': ['10.1.1.1'] },
    {
      'ok.example.org/robots.txt': { status: 200, headers: { 'content-type': 'text/plain' }, body: 'User-agent: *\nDisallow: /privado\n' },
      'down.example.org/robots.txt': { status: 503 },
    },
  );
  const net = { resolver: f.resolver, transport: f.transport };
  assert.equal(await robotsVerdict(new URL('https://ok.example.org/vacante/1'), net), 'allowed');
  assert.equal(await robotsVerdict(new URL('https://ok.example.org/privado/1'), net), 'disallowed');
  assert.equal(await robotsVerdict(new URL('https://gone.example.org/v'), net), 'allowed');
  assert.equal(await robotsVerdict(new URL('https://down.example.org/v'), net), 'unreachable');
  assert.equal(await robotsVerdict(new URL('https://priv.example.org/v'), net), 'unreachable');
  const before = f.seen.length;
  await robotsVerdict(new URL('https://ok.example.org/otra'), net);
  assert.equal(f.seen.length, before, 'cached per host');
  clearRobotsCache();
});
