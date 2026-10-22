import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PRODUCT_LABEL } from '../src/lib/brand.ts';
import { ConfigError } from '../src/lib/config.ts';
import { health, meta, readiness } from '../src/lib/meta.ts';
import { R40_AI_CRAWLERS, robotsTxt, sitemapXml } from '../src/lib/robots.ts';
import { cfg } from './helpers.ts';

/** Parses robots.txt into groups (consecutive User-agent lines, then their rules) and returns the rules for `agent`. */
function rulesFor(txt: string, agent: string): string[] {
  const groups: { agents: string[]; rules: string[] }[] = [];
  let current: { agents: string[]; rules: string[] } | null = null;
  for (const line of txt.split('\n')) {
    if (line.startsWith('User-agent: ')) {
      if (!current || current.rules.length) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(line.slice('User-agent: '.length));
    } else if (/^(Allow|Disallow): /.test(line) && current) {
      current.rules.push(line);
    }
  }
  const matching = groups.filter((g) => g.agents.includes(agent));
  assert.equal(matching.length, 1, `exactly one group for ${agent}`);
  return matching[0]!.rules;
}

test('R40: the landing allows every named AI crawler and everyone else, noindex or not', () => {
  for (const c of [cfg(), cfg({ CV_INDEXABLE: 'true' })]) {
    const txt = robotsTxt('landing', c);
    for (const bot of R40_AI_CRAWLERS) assert.deepEqual(rulesFor(txt, bot), ['Allow: /'], bot);
    assert.deepEqual(rulesFor(txt, '*'), ['Allow: /']);
    assert.doesNotMatch(txt, /Disallow/);
  }
  assert.equal(R40_AI_CRAWLERS.length, 9);
});

test('the sitemap line appears only when the landing is indexable', () => {
  assert.doesNotMatch(robotsTxt('landing', cfg()), /Sitemap:/);
  assert.match(robotsTxt('landing', cfg({ CV_INDEXABLE: 'true' })), /^Sitemap: https:\/\/cv\.madfam\.io\/sitemap\.xml$/m);
  const xml = sitemapXml(cfg({ CV_INDEXABLE: 'true' }));
  assert.match(xml, /<loc>https:\/\/cv\.madfam\.io\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/cv\.madfam\.io\/en<\/loc>/);
});

test('R40: app and API hosts disallow everything, AI crawlers named explicitly', () => {
  for (const role of ['app', 'api'] as const) {
    for (const c of [cfg(), cfg({ CV_INDEXABLE: 'true' })]) {
      const txt = robotsTxt(role, c);
      for (const bot of [...R40_AI_CRAWLERS, '*']) assert.deepEqual(rulesFor(txt, bot), ['Disallow: /'], `${role} ${bot}`);
      assert.doesNotMatch(txt, /Allow: |Sitemap:/);
    }
  }
});

test('/api/v1/meta shape', () => {
  const m = meta(cfg({ CV_REVISION: '0123456789abcdef0123456789abcdef01234567' }));
  assert.deepEqual(Object.keys(m).sort(), ['api', 'name', 'revision', 'service', 'version']);
  assert.equal(m.name, PRODUCT_LABEL);
  assert.equal(m.service, 'cv');
  assert.match(m.version, /^\d+\.\d+\.\d+$/);
  assert.equal(m.revision, '0123456789abcdef0123456789abcdef01234567');
  assert.equal(m.api, 'v1');
  assert.equal(meta(cfg()).revision, null);
});

test('liveness is static; readiness is 200 on valid config and 503 with the reason otherwise', async () => {
  assert.deepEqual(health(null), { status: 'ok', service: 'cv', revision: null });
  const ok = await readiness(() => cfg());
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, 'ok');
  const bad = await readiness(() => {
    throw new ConfigError('CV_HOST_API must be an exact lowercase hostname');
  });
  assert.equal(bad.status, 503);
  assert.equal(bad.body.status, 'unavailable');
  assert.match(JSON.stringify(bad.body), /CV_HOST_API/);
});

test('readiness: unconfigured dependencies do not block; a configured database that fails is a 503 (fail closed)', async () => {
  const dormant = await readiness(() => cfg(), { env: {}, pingDatabase: null });
  assert.equal(dormant.status, 200);
  assert.deepEqual(dormant.body.checks, { config: 'ok', signIn: 'not_configured', database: 'not_configured' });
  const up = await readiness(() => cfg(), { env: {}, pingDatabase: async () => undefined });
  assert.equal(up.status, 200);
  assert.deepEqual(up.body.dependencies, ['postgres']);
  const down = await readiness(() => cfg(), {
    env: {},
    pingDatabase: async () => {
      throw new Error('database did not answer within 2000 ms');
    },
  });
  assert.equal(down.status, 503);
  assert.match(JSON.stringify(down.body), /did not answer/);
  const partial = await readiness(() => cfg(), { env: { AUTH_JANUA_ISSUER: 'https://auth.madfam.io' }, pingDatabase: null });
  assert.equal(partial.status, 200);
  assert.deepEqual((partial.body.checks as { signIn: unknown }).signIn, { incomplete: ['AUTH_SECRET', 'AUTH_JANUA_CLIENT_ID', 'AUTH_JANUA_CLIENT_SECRET'] });
});
