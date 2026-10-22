import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '..', '..', '..');
// Assembled so this file does not contain the string it forbids.
const FORBIDDEN = ['madfam', 'com'].join('.');

function trackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' });
  return out.split('\0').filter((f) => f !== '');
}

test('the .com domain that is not MADFAM\'s appears nowhere in the tree (madfam.io is canonical)', () => {
  const files = trackedFiles();
  const hits: string[] = [];
  let read = 0;
  for (const f of files) {
    let text: string;
    try {
      text = readFileSync(join(root, f), 'utf8');
    } catch {
      continue; // deleted in the working tree
    }
    read += 1;
    if (text.toLowerCase().includes(FORBIDDEN)) hits.push(f);
  }
  // Read-proof: a scan that read nothing must not pass.
  assert.ok(read >= 20, `scanned only ${read} files`);
  assert.deepEqual(hits, []);
});

test('no legacy platform artefacts in the tree (Supabase, Prisma, Vercel, Railway, Stripe, HF; next-auth only as the pinned Janua client)', () => {
  const files = trackedFiles();
  const banned = /(^|\/)(vercel\.json|railway\.toml|supabase|prisma|schema\.prisma|\.env\.staging)($|\/)/i;
  assert.deepEqual(files.filter((f) => banned.test(f)), []);
  const pkg = readFileSync(join(root, 'apps', 'web', 'package.json'), 'utf8');
  for (const dep of ['@supabase', 'prisma', 'stripe', '@huggingface', '@vercel', '@madfam/']) {
    assert.ok(!pkg.includes(`"${dep}`), dep);
  }
  // next-auth is back for W2, as the Janua OIDC client only, pinned exactly (lane J §3.1); never the legacy major.
  const deps = (JSON.parse(pkg) as { dependencies: Record<string, string> }).dependencies;
  assert.equal(deps['next-auth'], '5.0.0-beta.32');
});

/** Source files under apps/web/src (read-proof counted). */
function sourceFiles(ext: RegExp): string[] {
  return trackedFiles().filter((f) => f.startsWith('apps/web/src/') && ext.test(f));
}

test('user content renders as React text only: no dangerouslySetInnerHTML and no style attribute in the source (lane X §4)', () => {
  const files = sourceFiles(/\.(tsx|ts)$/);
  assert.ok(files.length >= 40, `scanned only ${files.length} files`);
  const danger = ['dangerously', 'SetInnerHTML'].join('');
  const hits: string[] = [];
  for (const f of files) {
    const text = readFileSync(join(root, f), 'utf8');
    if (text.includes(danger)) hits.push(`${f}: raw HTML`);
    // JSX style props and string style attributes are both blocked by the nonce CSP (no 'unsafe-inline').
    if (/\sstyle\s*=\s*[{"']/.test(text)) hits.push(`${f}: style attribute`);
  }
  assert.deepEqual(hits, []);
});

test('renderers invent nothing: no Math.random under src/components/render (R85, lane X §1.3)', () => {
  const files = sourceFiles(/^apps\/web\/src\/components\/render\/.+\.tsx?$/);
  assert.ok(files.length >= 1, 'no renderer scanned');
  const random = ['Math', 'random'].join('.');
  assert.deepEqual(files.filter((f) => readFileSync(join(root, f), 'utf8').includes(random)), []);
});
