/**
 * Path helpers for deciding what to index.
 *
 * Extracted so the custom editor and the commands cannot drift apart, and so the
 * logic is unit-testable without a VSCode host.
 */

/**
 * The folder to register as a library for a given file.
 *
 * Sound libraries are usually laid out as `Library/Category/Sub/File.wav`, so
 * indexing the file's own directory would catalogue a single file while
 * indexing a drive root would swallow everything. Walking up exactly one level
 * is the useful unit — but never past a usable folder.
 *
 * Preserves the platform's separator style:
 *   `/lib/doors/wood.wav`   → `/lib/doors`
 *   `/lib/wood.wav`         → `/lib`
 *   `C:/a/b.wav`            → `C:/a`   (not `C:/`, which is a drive root)
 *   `C:\a\b.wav`            → `C:\a`
 */
export function topLevelFolder(filePath: string): string | null {
  if (!filePath) return null;

  // Detect Windows style from either the drive prefix or the separators in use,
  // because `C:/a/b.wav` and `C:\a\b.wav` are both valid ways to write it.
  const isWindows = /^[A-Za-z]:[\\/]/.test(filePath) || filePath.includes('\\');
  const normalized = filePath.replace(/\\/g, '/');
  const isAbsolute = normalized.startsWith('/');

  // Drop the drive prefix so it does not count as a directory level.
  const driveMatch = /^([A-Za-z]:)(.*)$/.exec(normalized);
  const drive = driveMatch ? driveMatch[1]! : '';
  const remainder = driveMatch ? driveMatch[2]! : normalized;

  const segments = remainder.split('/').filter(Boolean);
  // need a filename plus at least one directory
  if (segments.length < 2) return null;

  const withoutFile = segments.slice(0, -1);
  // Prefer walking up one level; if the file sits directly in a folder that is
  // already as high as we can go, use that folder instead. `segments.length >= 2`
  // above guarantees `withoutFile` is non-empty, so this never yields the root.
  const upOne = withoutFile.slice(0, -1);
  const chosen = upOne.length > 0 ? upOne : withoutFile;

  const joined = chosen.join('/');
  const prefix = drive ? `${drive}/` : isAbsolute ? '/' : '';
  const result = `${prefix}${joined}`;
  // Windows paths are normalised to backslashes regardless of the input style,
  // since that is what the OS APIs downstream expect.
  return isWindows ? result.replace(/\//g, '\\') : result;
}

/** Last path segment, tolerant of both separators and trailing slashes. */
export function baseName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}
