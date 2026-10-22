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

test('no legacy platform artefacts in the tree (Supabase, Prisma, Vercel, Railway, next-auth, Stripe, HF)', () => {
  const files = trackedFiles();
  const banned = /(^|\/)(vercel\.json|railway\.toml|supabase|prisma|schema\.prisma|\.env\.staging)($|\/)/i;
  assert.deepEqual(files.filter((f) => banned.test(f)), []);
  const pkg = readFileSync(join(root, 'apps', 'web', 'package.json'), 'utf8');
  for (const dep of ['@supabase', 'prisma', 'next-auth', 'stripe', '@huggingface', '@vercel', '@madfam/']) {
    assert.ok(!pkg.includes(`"${dep}`), dep);
  }
});
