import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { APP_VERSION } from '../src/lib/brand.ts';
import { ConfigError, HOST_TABLE, loadConfig } from '../src/lib/config.ts';

test('defaults are the three owner-named hosts, noindex, no revision', () => {
  const c = loadConfig({});
  assert.deepEqual(c.hosts, { landing: 'cv.madfam.io', app: 'cv-app.madfam.io', api: 'cv-api.madfam.io' });
  assert.equal(c.byHost.get('cv.madfam.io'), 'landing');
  assert.equal(c.byHost.get('cv-app.madfam.io'), 'app');
  assert.equal(c.byHost.get('cv-api.madfam.io'), 'api');
  assert.equal(c.byHost.size, 3);
  assert.equal(c.indexable, false);
  assert.equal(c.revision, null);
});

test('the host table is the single source: one row per role, only the landing is index-eligible', () => {
  assert.deepEqual(
    HOST_TABLE.map((r) => r.role),
    ['landing', 'app', 'api'],
  );
  assert.deepEqual(
    HOST_TABLE.filter((r) => r.indexEligible).map((r) => r.role),
    ['landing'],
  );
});

test('hosts are overridable from env', () => {
  const c = loadConfig({ CV_HOST_LANDING: 'cv.localhost', CV_HOST_APP: 'cv-app.localhost', CV_HOST_API: 'cv-api.localhost' });
  assert.equal(c.byHost.get('cv-api.localhost'), 'api');
});

test('malformed hosts fail loudly', () => {
  for (const bad of ['CV.madfam.io', 'cv.madfam.io:443', 'cv', 'https://cv.madfam.io', 'cv.madfam.io.', '*.madfam.io', ' cv.madfam.io']) {
    assert.throws(() => loadConfig({ CV_HOST_LANDING: bad }), ConfigError, bad);
  }
});

test('a host repeated across roles fails', () => {
  assert.throws(() => loadConfig({ CV_HOST_APP: 'cv.madfam.io' }), /repeats host/);
});

test('CV_INDEXABLE accepts only true/false/unset', () => {
  assert.equal(loadConfig({ CV_INDEXABLE: 'true' }).indexable, true);
  assert.equal(loadConfig({ CV_INDEXABLE: 'false' }).indexable, false);
  assert.equal(loadConfig({ CV_INDEXABLE: '' }).indexable, false);
  for (const bad of ['1', 'yes', 'TRUE', 'on']) assert.throws(() => loadConfig({ CV_INDEXABLE: bad }), ConfigError);
});

test('CV_REVISION must be a hex commit', () => {
  assert.equal(loadConfig({ CV_REVISION: 'abc1234' }).revision, 'abc1234');
  assert.throws(() => loadConfig({ CV_REVISION: 'main' }), ConfigError);
  assert.throws(() => loadConfig({ CV_REVISION: 'ABC1234' }), ConfigError);
});

test('APP_VERSION matches apps/web/package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  assert.equal(APP_VERSION, pkg.version);
});
