/**
 * Runtime resolution of optional dependencies.
 *
 * Two packages are deliberately not bundled: `@huggingface/transformers` (hundreds
 * of megabytes of weights plus native ONNX runtimes) and `ffmpeg-static` (a binary).
 * They are found at runtime from the plugin's own `node_modules`, the reference
 * SoundDesk checkout, or a configured directory — and the plugin must still work when
 * neither exists.
 *
 * Resolution has three explicit steps, because each one alone gets a real case wrong:
 *   1. the *package directory* comes from the CommonJS resolver's entry (walking up to
 *      the `package.json` whose `name` matches, never assuming the entry's parent is
 *      the root — transformers ships `dist/transformers.node.cjs`);
 *   2. the *entry* is chosen through the package's own `exports` map with the
 *      `node`/`import`/`default` conditions, so a dual package gets its ESM build.
 *      `import.meta.resolve` cannot help here: Node's implementation always resolves
 *      from the calling module, so it cannot be anchored at another directory;
 *   3. `module`/`main` are the fallback for packages without an `exports` map.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export interface ResolvedPackage {
  /** Directory holding the package's `package.json`. */
  dir: string
  /** URL of the entry module, resolved through the package's exports when present. */
  url: string
}

/** CommonJS entry URL from `root`, or null when the package is not installed there. */
function requireEntryUrl(root: string, specifier: string): string | null {
  try {
    const localRequire = createRequire(join(root, 'package.json'))
    return pathToFileURL(localRequire.resolve(specifier)).href
  } catch {
    return null
  }
}

/** Walk up from an entry file to the package directory that owns it. */
export function packageRootOf(entryUrl: string, specifier: string): string | null {
  const target = fileURLToPath(entryUrl)
  let dir = target
  try {
    if (!statSync(target).isDirectory()) dir = dirname(target)
  } catch {
    dir = dirname(target)
  }
  for (let depth = 0; depth < 8; depth += 1) {
    try {
      const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: unknown }
      if (manifest.name === specifier) return dir
    } catch {
      /* no manifest here; keep walking */
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

/** Walk an `exports` value, honouring condition order and skipping subpath keys. */
function pickExportTarget(value: unknown, conditions: ReadonlySet<string>): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    for (const entry of value) {
      const picked = pickExportTarget(entry, conditions)
      if (picked !== null) return picked
    }
    return null
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (key.startsWith('.')) continue
      if (key === 'default' || conditions.has(key)) {
        const picked = pickExportTarget(nested, conditions)
        if (picked !== null) return picked
      }
    }
  }
  return null
}

/** The package's own idea of its Node-ESM entry, or null when it does not ship one. */
export function esmEntryPath(dir: string): string | null {
  let manifest: Record<string, unknown>
  try {
    manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
  const conditions: ReadonlySet<string> = new Set(['node', 'import', 'default'])

  const exportsField = manifest.exports
  if (exportsField !== undefined && exportsField !== null) {
    const rootExport =
      typeof exportsField === 'object' && !Array.isArray(exportsField) && '.' in (exportsField as object)
        ? (exportsField as Record<string, unknown>)['.']
        : exportsField
    const target = pickExportTarget(rootExport, conditions)
    if (target !== null) return resolve(dir, target)
  }

  const fallback = manifest.module ?? manifest.main
  return typeof fallback === 'string' ? resolve(dir, fallback) : null
}

/** First root that can resolve `specifier` wins. */
export function resolvePackage(specifier: string, roots: readonly string[]): ResolvedPackage | null {
  for (const root of roots) {
    const entry = requireEntryUrl(root, specifier)
    if (entry === null) continue
    const dir = packageRootOf(entry, specifier)
    if (dir === null) continue
    const esm = esmEntryPath(dir)
    const url = esm !== null && existsSync(esm) ? pathToFileURL(esm).href : entry
    return { dir, url }
  }
  return null
}
