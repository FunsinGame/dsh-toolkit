/**
 * Attachment type policy.
 *
 * Only image and audio formats that a browser can safely render are accepted.
 * The declared MIME type is checked first, then a magic-byte sniff verifies the
 * bytes. Executable/HTML/SVG content is never accepted, stored or served as
 * such; files live outside the web root and are served through an authenticated
 * route with nosniff.
 */

const IMAGE_AUDIO = new Map<string, { extensions: string[]; matches: (b: Buffer) => boolean }>([
  ['image/png', { extensions: ['png'], matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47]) }],
  ['image/jpeg', { extensions: ['jpg', 'jpeg'], matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) }],
  ['image/gif', { extensions: ['gif'], matches: (b) => b.subarray(0, 4).toString('ascii') === 'GIF8' }],
  ['image/webp', { extensions: ['webp'], matches: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' }],
  ['image/avif', { extensions: ['avif'], matches: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' && /avi[fs]/u.test(b.subarray(8, 16).toString('ascii')) }],
  ['audio/mpeg', { extensions: ['mp3'], matches: (b) => startsWith(b, [0x49, 0x44, 0x33]) || (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) }],
  ['audio/wav', { extensions: ['wav'], matches: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WAVE' }],
  ['audio/x-wav', { extensions: ['wav'], matches: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WAVE' }],
  ['audio/ogg', { extensions: ['ogg', 'oga', 'opus'], matches: (b) => b.subarray(0, 4).toString('ascii') === 'OggS' }],
  ['audio/flac', { extensions: ['flac'], matches: (b) => b.subarray(0, 4).toString('ascii') === 'fLaC' }],
  ['audio/mp4', { extensions: ['m4a', 'mp4'], matches: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' }],
  ['audio/x-m4a', { extensions: ['m4a'], matches: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' }],
  ['audio/aac', { extensions: ['aac'], matches: (b) => b.length >= 2 && b[0] === 0xff && (b[1] === 0xf1 || b[1] === 0xf9) }],
  ['audio/webm', { extensions: ['webm', 'weba'], matches: (b) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]) }],
  ['audio/opus', { extensions: ['opus', 'ogg'], matches: (b) => b.subarray(0, 4).toString('ascii') === 'OggS' || startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]) }],
])

const EXTENSION_TO_MIME = new Map<string, string>()
for (const [mime, policy] of IMAGE_AUDIO) {
  for (const extension of policy.extensions) {
    if (!EXTENSION_TO_MIME.has(extension)) EXTENSION_TO_MIME.set(extension, mime)
  }
}

export const MAX_FILENAME_LENGTH = 180

export function declaredMime(raw: string | undefined): string {
  return String(raw ?? '').split(';', 1)[0]?.trim().toLowerCase() ?? ''
}

export function resolveUploadMime(filename: string, rawMime: string | undefined): string | null {
  let mime = declaredMime(rawMime)
  if (mime === 'image/jpg') mime = 'image/jpeg'
  if (mime === 'audio/wave') mime = 'audio/wav'
  if (mime === 'audio/m4a') mime = 'audio/mp4'
  if (mime === 'video/webm') return null
  if (IMAGE_AUDIO.has(mime)) return mime
  if (mime === '' || mime === 'application/octet-stream') {
    const extension = filenameExtension(filename)
    return EXTENSION_TO_MIME.get(extension) ?? null
  }
  return null
}

export function validateMagic(mime: string, head: Buffer): boolean {
  const policy = IMAGE_AUDIO.get(mime)
  if (policy === undefined) return false
  return policy.matches(head)
}

export function isAllowedMime(mime: string): boolean {
  return IMAGE_AUDIO.has(mime)
}

export function filenameExtension(filename: string): string {
  const index = filename.lastIndexOf('.')
  if (index < 0) return ''
  return filename.slice(index + 1).toLowerCase()
}

/** Strip path separators and control characters from a display filename. */
export function safeFilename(filename: string): string {
  const base = filename.replace(/^.*[\\/]/u, '').replace(/[\u0000-\u001f\u007f]/gu, '').trim()
  const cleaned = base === '' ? 'attachment' : base
  return Array.from(cleaned).slice(0, MAX_FILENAME_LENGTH).join('')
}

export function attachmentStorageKey(id: string): string {
  return `${id.slice(0, 2)}/${id}`
}

export function isInlineMime(mime: string): boolean {
  return IMAGE_AUDIO.has(mime)
}

function startsWith(buffer: Buffer, bytes: number[]): boolean {
  if (buffer.length < bytes.length) return false
  for (let index = 0; index < bytes.length; index += 1) {
    if (buffer[index] !== bytes[index]) return false
  }
  return true
}
