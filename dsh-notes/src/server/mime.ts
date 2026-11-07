/**
 * Attachment type policy.
 *
 * Any file format can be uploaded and stored. The media allowlist below is the
 * only thing the server will ever hand to a browser as a renderable resource;
 * every other format is served as `application/octet-stream` with
 * `Content-Disposition: attachment`, so an uploaded HTML/SVG/JS file can never
 * run in the notes origin. Image/audio uploads still have their magic bytes
 * verified, so a file that merely claims `image/png` is rejected.
 */

import { INLINE_AUDIO_MIMES, INLINE_IMAGE_MIMES } from '../shared/media.ts'

type MediaPolicy = { extensions: string[]; matches: (b: Buffer) => boolean }

const MEDIA = new Map<string, MediaPolicy>([
  ['image/png', { extensions: ['png'], matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47]) }],
  ['image/jpeg', { extensions: ['jpg', 'jpeg'], matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) }],
  ['image/gif', { extensions: ['gif'], matches: (b) => b.subarray(0, 4).toString('ascii') === 'GIF8' }],
  ['image/webp', { extensions: ['webp'], matches: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' }],
  ['image/avif', { extensions: ['avif'], matches: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' && /avi[fs]/u.test(b.subarray(8, 16).toString('ascii')) }],
  ['audio/mpeg', { extensions: ['mp3'], matches: (b) => startsWith(b, [0x49, 0x44, 0x33]) || (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) }],
  ['audio/wav', { extensions: ['wav'], matches: (b) => isRiffWave(b) }],
  ['audio/x-wav', { extensions: ['wav'], matches: (b) => isRiffWave(b) }],
  ['audio/ogg', { extensions: ['ogg', 'oga', 'opus'], matches: (b) => b.subarray(0, 4).toString('ascii') === 'OggS' }],
  ['audio/flac', { extensions: ['flac'], matches: (b) => b.subarray(0, 4).toString('ascii') === 'fLaC' }],
  ['audio/mp4', { extensions: ['m4a', 'mp4'], matches: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' }],
  ['audio/x-m4a', { extensions: ['m4a'], matches: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' }],
  ['audio/aac', { extensions: ['aac'], matches: (b) => b.length >= 2 && b[0] === 0xff && (b[1] === 0xf1 || b[1] === 0xf9) }],
  ['audio/webm', { extensions: ['webm', 'weba'], matches: (b) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]) }],
  ['audio/opus', { extensions: ['opus', 'ogg'], matches: (b) => b.subarray(0, 4).toString('ascii') === 'OggS' || startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]) }],
])

const EXTENSION_TO_MIME = new Map<string, string>()
for (const [mime, policy] of MEDIA) {
  for (const extension of policy.extensions) {
    if (!EXTENSION_TO_MIME.has(extension)) EXTENSION_TO_MIME.set(extension, mime)
  }
}

/**
 * Extensions with no reliably sniffable magic bytes map to `text/plain` when
 * the client sends no useful type. This is metadata only: the response for a
 * non-media attachment is always an opaque octet-stream download.
 */
const TEXT_EXTENSIONS = new Set([
  'txt', 'text', 'md', 'markdown', 'mdx', 'rst', 'log', 'csv', 'tsv', 'json', 'jsonc',
  'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env', 'xml', 'html', 'htm', 'css',
  'scss', 'less', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'svelte', 'py',
  'rb', 'go', 'rs', 'java', 'kt', 'kts', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'php',
  'swift', 'scala', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd', 'sql', 'graphql', 'gql',
  'diff', 'patch', 'tex', 'bib',
])

const MIME_ALIASES = new Map<string, string>([
  ['image/jpg', 'image/jpeg'],
  ['audio/wave', 'audio/wav'],
  ['audio/m4a', 'audio/mp4'],
  ['audio/mp3', 'audio/mpeg'],
])

const MIME_TOKEN = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,127}$/u

export const MAX_FILENAME_LENGTH = 180
export const OPAQUE_MIME = 'application/octet-stream'

export function declaredMime(raw: string | undefined): string {
  return String(raw ?? '').split(';', 1)[0]?.trim().toLowerCase() ?? ''
}

/**
 * Resolve the MIME type stored with an upload.
 *
 * A usable declared type wins (normalised, or replaced by
 * `application/octet-stream` when it is not a valid media type token); an
 * empty/octet-stream declaration falls back to the filename extension. The
 * result is always a string: arbitrary formats are accepted by design.
 */
export function resolveUploadMime(filename: string, rawMime: string | undefined): string {
  const declared = declaredMime(rawMime)
  if (declared !== '' && declared !== OPAQUE_MIME) return normalizeMime(declared)
  const extension = filenameExtension(filename)
  return EXTENSION_TO_MIME.get(extension) ?? (TEXT_EXTENSIONS.has(extension) ? 'text/plain' : OPAQUE_MIME)
}

export function validateMagic(mime: string, head: Buffer): boolean {
  const policy = MEDIA.get(mime)
  if (policy === undefined) return false
  return policy.matches(head)
}

/** True for the image/audio types that may be rendered inline. */
export function isMediaMime(mime: string): boolean {
  return MEDIA.has(mime)
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

function normalizeMime(mime: string): string {
  const normalized = MIME_ALIASES.get(mime) ?? mime
  return MIME_TOKEN.test(normalized) ? normalized : OPAQUE_MIME
}

function isRiffWave(buffer: Buffer): boolean {
  return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WAVE'
}

function startsWith(buffer: Buffer, bytes: number[]): boolean {
  if (buffer.length < bytes.length) return false
  for (let index = 0; index < bytes.length; index += 1) {
    if (buffer[index] !== bytes[index]) return false
  }
  return true
}

// Keep the shared policy and the magic-byte table in step: both are exported
// lists of the same MIME strings, and a drift would silently disable a check.
if (
  INLINE_IMAGE_MIMES.some((mime) => !MEDIA.has(mime))
  || INLINE_AUDIO_MIMES.some((mime) => !MEDIA.has(mime))
) {
  throw new Error('inline media policy and magic-byte table disagree')
}
