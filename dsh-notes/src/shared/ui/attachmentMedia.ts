/**
 * Attachment bytes, loaded once through the surface transport.
 *
 * `<img src="…/attachments/<id>">` is not a reliable way to show an attachment:
 * a plain subresource request only carries same-origin cookies, while the DSH
 * page runs on the Desktop `dsh-app://` scheme and the standalone server fences
 * direct reads. Reading the bytes through `AppBackend.fetchAttachment` (the
 * pathway every API call already proves works) and exposing them as a `blob:`
 * URL keeps previews, thumbnails and audio players working on both surfaces.
 *
 * Object URLs are cached per attachment id so the preview, the attachment row
 * and the lightbox share a single download.
 */

import type { AppBackend } from './backend.ts'

interface Entry {
  /** Set once the bytes became an object URL. */
  url: string | null
  promise: Promise<string>
}

const cache = new Map<string, Entry>()

function cacheKey(backend: AppBackend, id: string): string {
  return `${backend.kind}:${id}`
}

function revoke(url: string | null): void {
  if (url === null) return
  try {
    URL.revokeObjectURL(url)
  } catch {
    /* A document teardown can drop the object-URL registry first. */
  }
}

/** True when this document can render an object URL at all (jsdom cannot). */
function canUseObjectUrls(): boolean {
  return typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
}

/**
 * Resolve an attachment id to a displayable image URL.
 *
 * Falls back to the surface's direct attachment URL when the bytes cannot be
 * read, so a surface that does allow direct image loads still shows something.
 */
export function loadAttachmentObjectUrl(backend: AppBackend, id: string): Promise<string> {
  if (!canUseObjectUrls()) return Promise.resolve(backend.attachmentUrl(id))
  const key = cacheKey(backend, id)
  const existing = cache.get(key)
  if (existing !== undefined) return existing.promise
  const promise = backend.fetchAttachment(id).then((blob) => {
    const url = URL.createObjectURL(blob)
    const entry = cache.get(key)
    if (entry !== undefined) entry.url = url
    return url
  })
  // A failed read must not be cached: a retry (or a later sync) should re-fetch.
  promise.catch(() => { cache.delete(key) })
  cache.set(key, { url: null, promise })
  return promise
}

/** The already-loaded object URL for an attachment, if any. */
export function cachedAttachmentObjectUrl(backend: AppBackend, id: string): string | null {
  return cache.get(cacheKey(backend, id))?.url ?? null
}

/** Drop one attachment's bytes (after delete) or every attachment's bytes. */
export function forgetAttachmentObjectUrl(backend: AppBackend, id?: string): void {
  if (id !== undefined) {
    const key = cacheKey(backend, id)
    revoke(cache.get(key)?.url ?? null)
    cache.delete(key)
    return
  }
  const prefix = `${backend.kind}:`
  for (const [key, entry] of Array.from(cache.entries())) {
    if (!key.startsWith(prefix)) continue
    revoke(entry.url)
    cache.delete(key)
  }
}
