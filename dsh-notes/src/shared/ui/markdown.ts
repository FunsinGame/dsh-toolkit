/** Markdown preview: GFM, sanitisation, attachment URL rewriting, highlighting. */

import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/common'
import { marked } from 'marked'

export interface MarkdownOptions {
  resolveAttachment: (id: string) => string
  attachmentMimes: Map<string, string>
  onOpenNote?: (id: string) => void
}

const ATTACHMENT_PATTERN = /(?:^|\/)(?:api\/attachments|attachments)\/([A-Za-z0-9_-]{8,80})/u
const CUSTOM_ATTACHMENT_PATTERN = /^attachment:\/\/([A-Za-z0-9_-]{8,80})$/u

export function attachmentIdFromHref(href: string): string | null {
  const custom = CUSTOM_ATTACHMENT_PATTERN.exec(href)
  if (custom !== null) return custom[1] ?? null
  const match = ATTACHMENT_PATTERN.exec(href)
  return match?.[1] ?? null
}

export function renderMarkdown(markdown: string, options: MarkdownOptions): string {
  const parsed = marked.parse(markdown, { gfm: true, breaks: false, async: false })
  const html = typeof parsed === 'string' ? parsed : ''
  const template = document.createElement('template')
  template.innerHTML = html
  const root = template.content
  for (const element of Array.from(root.querySelectorAll('img'))) {
    const src = element.getAttribute('src') ?? ''
    const id = attachmentIdFromHref(src)
    element.setAttribute('alt', element.getAttribute('alt') ?? '')
    element.setAttribute('class', `${element.getAttribute('class') ?? ''} dsh-notes-md-image`.trim())
    if (id !== null) {
      // The preview swaps in an object URL read over the API and keeps this
      // direct URL only as a last-resort fallback: pointing `src` here makes the
      // browser issue an unauthenticated subresource request for every image.
      element.removeAttribute('src')
      element.setAttribute('data-attachment-src', options.resolveAttachment(id))
      element.setAttribute('data-attachment-id', id)
      element.setAttribute('title', '双击放大')
      element.removeAttribute('loading')
    } else {
      element.setAttribute('loading', 'lazy')
    }
  }
  for (const element of Array.from(root.querySelectorAll('a'))) {
    const href = element.getAttribute('href') ?? ''
    const id = attachmentIdFromHref(href)
    if (id !== null) {
      element.setAttribute('href', options.resolveAttachment(id))
      element.setAttribute('data-attachment-id', id)
      element.setAttribute('class', 'dsh-notes-attachment-link')
    }
    element.setAttribute('rel', 'noopener noreferrer')
    if (!href.startsWith('#/')) element.setAttribute('target', '_blank')
    if (href.startsWith('#/note/')) {
      element.setAttribute('data-note-link', href.slice('#/note/'.length))
      element.removeAttribute('target')
    }
  }
  for (const element of Array.from(root.querySelectorAll('pre > code'))) {
    const className = element.getAttribute('class') ?? ''
    const language = /language-([\w-]+)/u.exec(className)?.[1] ?? ''
    try {
      const highlighted = language !== '' && hljs.getLanguage(language)
        ? hljs.highlight(element.textContent ?? '', { language }).value
        : hljs.highlightAuto(element.textContent ?? '').value
      element.innerHTML = highlighted
      element.setAttribute('class', `hljs ${className}`.trim())
    } catch {
      /* Keep the unhighlighted code. */
    }
  }
  for (const element of Array.from(root.querySelectorAll('input[type="checkbox"]'))) {
    element.setAttribute('disabled', 'disabled')
  }
  return DOMPurify.sanitize(template.innerHTML, {
    ADD_TAGS: ['input', 'audio', 'video', 'source', 'details', 'summary', 'del', 'ins', 'mark'],
    ADD_ATTR: [
      'checked', 'disabled', 'type', 'class', 'target', 'rel', 'loading', 'data-attachment-id',
      'data-attachment-src', 'data-note-link', 'controls', 'src', 'alt', 'title', 'start', 'colspan',
      'rowspan', 'align',
    ],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'base', 'link', 'meta'],
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick', 'onmouseover'],
  })
}

export function bindPreviewClick(container: HTMLElement, onOpenNote?: (id: string) => void): void {
  container.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const anchor = target.closest('a')
    if (anchor === null) return
    const noteLink = anchor.getAttribute('data-note-link')
    if (noteLink !== null && onOpenNote !== undefined) {
      event.preventDefault()
      onOpenNote(noteLink)
    }
  })
}
