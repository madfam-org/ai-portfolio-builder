/**
 * TEST-ONLY module hooks for test/render*.test.ts: Node strips TypeScript types but cannot read JSX, so the renderer
 * tests register these hooks to (1) transpile .tsx with the repo's own `typescript` (jsx: react-jsx), (2) resolve the
 * `@/` alias and extensionless imports the way Next does, and (3) turn a CSS Module into its class names (`s.cv` is
 * "cv"), so a test reads the real markup of the real components with react-dom/server. Nothing here ships.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const SRC = new URL('../src/', import.meta.url);

function probe(fileUrl) {
  const path = fileURLToPath(fileUrl);
  if (existsSync(path) && !path.endsWith('/')) return fileUrl;
  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) if (existsSync(path + ext)) return pathToFileURL(path + ext).href;
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier.endsWith('.module.css')) {
    const base = specifier.startsWith('@/') ? new URL(specifier.slice(2), SRC).href : new URL(specifier, context.parentURL).href;
    return { url: base, format: 'module', shortCircuit: true };
  }
  if (specifier.startsWith('@/')) {
    const found = probe(new URL(specifier.slice(2), SRC).href);
    if (found) return { url: found, shortCircuit: true };
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    const found = probe(new URL(specifier, context.parentURL).href);
    if (found) return { url: found, shortCircuit: true };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.endsWith('.module.css')) {
    return { format: 'module', shortCircuit: true, source: 'export default new Proxy({}, { get: (_, key) => (typeof key === "string" ? key : undefined) });' };
  }
  if (url.endsWith('.tsx')) {
    const source = await readFile(fileURLToPath(url), 'utf8');
    const out = ts.transpileModule(source, {
      fileName: fileURLToPath(url),
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: true, allowImportingTsExtensions: true, rewriteRelativeImportExtensions: false },
    });
    return { format: 'module', shortCircuit: true, source: out.outputText };
  }
  return next(url, context);
}
