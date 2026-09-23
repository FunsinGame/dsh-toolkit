/**
 * Development module resolver.
 *
 * This project is ESM + NodeNext TypeScript, so source files import each other
 * with explicit `.js` specifiers (that is what the compiler emits, and what the
 * built output needs). Node's `--experimental-strip-types` will happily run a
 * `.ts` entry point, but it will not rewrite `./db.js` to `./db.ts`, so running
 * from source fails with ERR_MODULE_NOT_FOUND.
 *
 * This loader adds exactly that rewrite and nothing else. It is ~20 lines and
 * dependency-free, which is preferable to adding a whole dev runner for one
 * resolution rule. It is only ever installed for `dev` and `test`; production
 * runs against compiled `dist/`, where the plain Node resolver is correct.
 */

import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const TS_EXTENSIONS = ['.ts', '.tsx', '.mts'];

export async function resolve(specifier, context, nextResolve) {
  const isRelativeTs =
    (specifier.startsWith('./') || specifier.startsWith('../')) && /\.(js|mjs|cjs)$/.test(specifier);

  if (isRelativeTs) {
    const base = new URL(specifier, context.parentURL);
    const stem = fileURLToPath(base).replace(/\.(js|mjs|cjs)$/, '');
    for (const ext of TS_EXTENSIONS) {
      const candidate = `${stem}${ext}`;
      try {
        await access(candidate);
        // Do NOT set `format`: Node decides it from the extension, and forcing
        // 'module' here suppresses the TypeScript type-stripping transform.
        return { url: new URL(`file://${candidate.replace(/\\/g, '/')}`).href, shortCircuit: true };
      } catch {
        // try the next extension
      }
    }
  }

  return nextResolve(specifier, context);
}
