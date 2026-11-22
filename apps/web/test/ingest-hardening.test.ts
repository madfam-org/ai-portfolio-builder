/**
 * Job-link intake on hostile input: robots.txt rules are matched in linear time with the documented semantics, the HTML
 * reader stays linear and shallow on malformed pages, and DNS sits inside the request deadline.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FetchError, safeFetch, type Resolver, type Transport } from '../src/server/ingest/fetcher.ts';
import { MAX_DEPTH, pageParts, parseHtml, textOf, walk, type El } from '../src/server/ingest/html.ts';
import { ROBOTS_RULE_LIMITS, parseRobots, robotsAllows } from '../src/server/ingest/robots.ts';

const allows = (rules: string, path: string) => robotsAllows(parseRobots(`User-agent: *\n${rules}\n`), path);

test('robots: `*` and `$` keep their meaning', () => {
  assert.equal(allows('Disallow: /*.pdf$', '/doc/vacante.pdf'), false);
  assert.equal(allows('Disallow: /*.pdf$', '/doc/vacante.pdf?x=1'), true);
  assert.equal(allows('Disallow: /a*b*c', '/a-x-b-y-c-z'), false);
  assert.equal(allows('Disallow: /a*b*c', '/a-x-c-y-b'), true, 'segments must appear in order');
  assert.equal(allows('Disallow: /ab*b$', '/ab'), true, 'first and last segment may not overlap');
  assert.equal(allows('Disallow: /ab*b$', '/abb'), false);
  assert.equal(allows('Disallow: /exact$', '/exact'), false);
  assert.equal(allows('Disallow: /exact$', '/exactly'), true);
  assert.equal(allows('Disallow: /a.b', '/aXb'), true, 'a dot is literal');
  assert.equal(allows('Disallow: /*\nAllow: /empleos/*$', '/empleos/1'), true, 'longest match wins');
});

test('robots: a rule with many wildcards is matched in linear time', () => {
  const wild = `/${'*a'.repeat(ROBOTS_RULE_LIMITS.maxWildcards)}b`;
  const path = `/${'a'.repeat(20_000)}`;
  const started = performance.now();
  assert.equal(allows(`Disallow: ${wild}`, path), true);
  assert.equal(allows(`Disallow: ${wild}`, `${path}b`), false);
  const ms = performance.now() - started;
  assert.ok(ms < 200, `matched in ${ms.toFixed(1)} ms`);
});

test('robots: past the limits a Disallow refuses everything and an Allow is ignored', () => {
  const tooWild = `/${'*x'.repeat(ROBOTS_RULE_LIMITS.maxWildcards + 1)}`;
  const tooLong = `/${'y'.repeat(ROBOTS_RULE_LIMITS.maxLength)}`;
  assert.equal(allows(`Disallow: ${tooWild}`, '/empleos/1'), false);
  assert.equal(allows(`Disallow: ${tooLong}`, '/empleos/1'), false);
  assert.equal(allows(`Disallow: /empleos\nAllow: ${tooWild}`, '/empleos/1'), false, 'an over-limit Allow never allows');
  assert.equal(allows(`Allow: ${tooWild}`, '/empleos/1'), true, 'nothing disallowed: still allowed');
});

/** Time one call; the bounds are generous (CI machines vary) but far below what quadratic behaviour costs here. */
function timed<T>(fn: () => T): { value: T; ms: number } {
  const started = performance.now();
  const value = fn();
  return { value, ms: performance.now() - started };
}

test('html: long tag names and attribute runs without `>` stay linear', () => {
  const page = `<p>Vacante</p>${`<a${'x'.repeat(3_000)} `.repeat(300)}<p>fin</p>`;
  const { value, ms } = timed(() => pageParts(page));
  assert.ok(ms < 2_000, `parsed ${page.length} chars in ${ms.toFixed(0)} ms`);
  assert.match(value.text, /Vacante/);
});

test('html: unclosed nesting is capped, closing tags stay cheap, and the readers never overflow the stack', () => {
  const page = `${'<div>'.repeat(200_000)}texto${'</b>'.repeat(200_000)}`;
  const { value: root, ms } = timed(() => parseHtml(page));
  assert.ok(ms < 3_000, `parsed in ${ms.toFixed(0)} ms`);
  let depth = 0;
  for (let el: El | undefined = root; el; el = el.children.find((c): c is El => typeof c !== 'string')) depth += 1;
  assert.ok(depth <= MAX_DEPTH + 2, `depth ${depth}`);
  assert.equal(textOf(root), 'texto');
  assert.ok([...walk(root)].length >= 200_000, 'every element is still in the tree');
  // Everything the intake reads from such a page (four walks of the tree) stays linear too.
  const parts = timed(() => pageParts(page));
  assert.ok(parts.ms < 3_000, `pageParts in ${parts.ms.toFixed(0)} ms`);
  assert.equal(parts.value.text, 'texto');
});

test('html: walk keeps document order', () => {
  const root = parseHtml('<div id="1"><p id="2"><b id="3"></b></p><p id="4"></p></div><i id="5"></i>');
  assert.deepEqual([...walk(root)].map((e) => e.attrs.id), ['1', '2', '3', '4', '5']);
});

test('html: ordinary markup is read as before', () => {
  const parts = pageParts('<html><head><title> Gerente </title><link rel="canonical" href="https://x.example/1"></head><body><main><h1>Gerente</h1><ul><li>Uno<li>Dos</ul></main></body></html>');
  assert.equal(parts.title, 'Gerente');
  assert.equal(parts.canonical, 'https://x.example/1');
  assert.equal(parts.text, 'Gerente\n• Uno\n• Dos');
});

test('fetch: a name server that never answers ends the request as a timeout, on time', async () => {
  const resolver: Resolver = () => new Promise(() => undefined);
  const transport: Transport = () => Promise.reject(new Error('never reached'));
  const started = Date.now();
  await assert.rejects(
    safeFetch('https://slow.example.org/empleo', { accept: ['text/html'], resolver, transport, deadline: started + 150 }),
    (err: unknown) => err instanceof FetchError && err.code === 'timeout',
  );
  assert.ok(Date.now() - started < 1_000, 'gave up at the deadline');
});

test('fetch: a failing lookup before the deadline is still dns_failed', async () => {
  const resolver: Resolver = () => Promise.reject(new Error('ENOTFOUND'));
  const transport: Transport = () => Promise.reject(new Error('never reached'));
  await assert.rejects(
    safeFetch('https://missing.example.org/empleo', { accept: ['text/html'], resolver, transport, deadline: Date.now() + 5_000 }),
    (err: unknown) => err instanceof FetchError && err.code === 'dns_failed',
  );
});
