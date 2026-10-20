/**
 * Editor selection to a 1-based inclusive line range. A collapsed selection
 * names the cursor's line; a selection that ends at column 0 does not include
 * that trailing line.
 */

import type { TextEditor } from 'vscode'

/** One 1-based inclusive line range. */
export interface LineRange {
  readonly startLine: number
  readonly endLine: number
}

/**
 * Read the line range a send command should reference.
 * @param editor - the active text editor.
 * @returns the 1-based inclusive range.
 */
export function lineRangeOf(editor: TextEditor): LineRange {
  const selection = editor.selection
  if (selection.isEmpty) {
    const line = selection.active.line + 1
    return { startLine: line, endLine: line }
  }
  const startLine = selection.start.line + 1
  const lastLine = selection.end.line + (selection.end.character === 0 && selection.end.line > selection.start.line ? 0 : 1)
  return { startLine, endLine: Math.max(startLine, lastLine) }
}

/**
 * Normalize one path for comparison across separator and drive-letter spellings.
 * @param value - native path.
 * @returns the compared spelling.
 */
export function normalizedPath(value: string): string {
  return value.replace(/\\/gu, '/').replace(/\/+$/u, '')
}

/**
 * Whether two workspace paths name the same directory.
 * @param left - first path.
 * @param right - second path.
 * @returns whether they match.
 */
export function samePath(left: string, right: string): boolean {
  const a = normalizedPath(left)
  const b = normalizedPath(right)
  return /^[a-zA-Z]:\//u.test(a) ? a.toLowerCase() === b.toLowerCase() : a === b
}
