/**
 * Attachment media policy shared by the server and the browser UI.
 *
 * Any file format may be uploaded, but only the MIME types listed here are
 * ever handed to the browser as a renderable resource (an `<img>`/`<audio>`).
 * Everything else is an opaque file: stored by id, downloaded with
 * `application/octet-stream` + `Content-Disposition: attachment`, and never
 * interpreted by the page origin.
 *
 * The server keeps the matching magic-byte checks in `src/server/mime.ts`;
 * this list is the single source of truth for "inline" decisions on both
 * sides, so an uploaded `image/svg+xml` is never treated as a picture.
 */

export const INLINE_IMAGE_MIMES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
]

export const INLINE_AUDIO_MIMES: readonly string[] = [
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/flac',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/webm',
  'audio/opus',
]

const INLINE = new Set<string>([...INLINE_IMAGE_MIMES, ...INLINE_AUDIO_MIMES])

export function isInlineMime(mime: string): boolean {
  return INLINE.has(mime)
}

export function isInlineImageMime(mime: string): boolean {
  return INLINE_IMAGE_MIMES.includes(mime)
}

export function isInlineAudioMime(mime: string): boolean {
  return INLINE_AUDIO_MIMES.includes(mime)
}

/** Markdown snippet that references an attachment; images stay inline. */
export function attachmentMarkdown(filename: string, mime: string, id: string): string {
  const label = filename.replace(/[[\]]/gu, (ch) => (ch === '[' ? '\\[' : '\\]'))
  return isInlineImageMime(mime)
    ? `![${label}](api/attachments/${id})`
    : `[${label}](api/attachments/${id})`
}
