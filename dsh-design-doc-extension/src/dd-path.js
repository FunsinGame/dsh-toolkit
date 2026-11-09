/**
 * dsh-design-doc extension: the coordinate rule, computed from the DOM.
 *
 * The DSH plugin derives `data-dd-path` from a byte-offset parse of the `.html`
 * source (`lib/host.js`). A browser extension cannot see those bytes — it only
 * has the rendered document — so this file reimplements the same rule over the
 * element tree. The rule is:
 *
 *     <scope>|<tag><n>     e.g. job-10-2|p3
 *     <scope>|.            the scope element itself (usually a chapter heading)
 *
 * where `<scope>` is the nearest `id` in a specific search order and `<n>` is
 * the running count of same-tag selectable blocks inside that scope.
 *
 * Two details are easy to get wrong, and both are load-bearing:
 *
 * 1. The scope is NOT "the nearest preceding id in document order". An id
 *    inside a preceding *subtree* does not leak out of it — only that subtree's
 *    own root id does. So the search is: self, then preceding siblings, then the
 *    parent's own id (and the parent's preceding siblings), and so on upward.
 *    `walk()` below reproduces the host's recursion exactly, which makes the
 *    distinction fall out for free.
 * 2. `<n>` is per scope and per tag, counting only selectable blocks — not
 *    siblings. A `<p>` inside a `<td>` and the `<td>` itself both count, in
 *    their own tag's sequence.
 *
 * Kept dependency-free and DOM-shape-only (`children`, `id`, `localName`) so
 * tests can feed it a tree built from the host's own parser.
 */

(function (root) {
  'use strict'

  /** Tags the host offers as editable blocks (mirrors host.js EDITABLE). */
  var EDITABLE = {
    p: 1, li: 1, td: 1, th: 1, h2: 1, h3: 1, h4: 1, h5: 1,
    dd: 1, dt: 1, blockquote: 1, pre: 1, figcaption: 1, summary: 1,
    caption: 1, aside: 1,
  }

  /** Containers selectable only when they hold no editable block (image wrappers). */
  var CONTAINER = { div: 1, figure: 1 }

  function tagOf(element) {
    var name = element.localName || element.tagName || ''
    return String(name).toLowerCase()
  }

  /**
   * Builds the coordinate map for one document.
   *
   * @param rootElement - `document.documentElement` (or a stand-in with the same
   *   `children` / `id` / `localName` shape).
   * @param options - `{skip}`: `skip(element)` returns true for a subtree the
   *   page built at runtime. Such a subtree has no source counterpart, so it is
   *   left out of both passes entirely: it gets no coordinate of its own and,
   *   crucially, it does not advance the per-scope counters — the host never
   *   counted it either.
   * @returns {{paths: Map, scopes: Map, entries: Function, pathOf: Function}}
   *   `paths` maps Element → coordinate string, in document order.
   */
  function createIndex(rootElement, options) {
    var paths = new Map()
    var scopes = new Map()
    var hasEditable = new Map()
    var counters = new Map()
    var skip = options !== undefined && options !== null && typeof options.skip === 'function'
      ? options.skip
      : null

    /**
     * Post-order pass: does this element hold an editable block anywhere below
     * it? `div`s and `figure`s need that answer before they can be classified.
     */
    function mark(element) {
      var kids = element.children || []
      var descendant = false
      for (var index = 0; index < kids.length; index += 1) {
        if (skip !== null && skip(kids[index])) continue
        if (mark(kids[index])) descendant = true
      }
      hasEditable.set(element, descendant)
      return descendant || EDITABLE[tagOf(element)] === 1
    }

    /**
     * Pre-order pass: the host's own `walkRegion`. `scope` is the caller's
     * current scope, which the recursion must never write back to — that is
     * what keeps an inner subtree's ids from leaking past it.
     */
    function walk(parent, scope) {
      var current = scope
      var kids = parent.children || []
      for (var index = 0; index < kids.length; index += 1) {
        var child = kids[index]
        if (skip !== null && skip(child)) continue
        var name = tagOf(child)
        var id = typeof child.id === 'string' ? child.id : ''
        if (id !== '') current = id

        if (current !== null) {
          var selectable = EDITABLE[name] === 1
            || (CONTAINER[name] === 1 && hasEditable.get(child) !== true)
          if (selectable) {
            var path
            if (id !== '' && id === current) {
              path = current + '|.'
            } else {
              var byTag = counters.get(current)
              if (byTag === undefined) {
                byTag = new Map()
                counters.set(current, byTag)
              }
              var next = (byTag.get(name) || 0) + 1
              byTag.set(name, next)
              path = current + '|' + name + next
            }
            paths.set(child, path)
          }
        }

        scopes.set(child, current)
        walk(child, current)
      }
    }

    mark(rootElement)
    // The host starts one level above <html>; only <html>'s own id can matter
    // there, and it is the starting scope rather than a path of its own.
    var initial = typeof rootElement.id === 'string' && rootElement.id !== '' ? rootElement.id : null
    walk(rootElement, initial)

    return {
      paths: paths,
      scopes: scopes,
      entries: function () {
        var out = []
        paths.forEach(function (ddPath, element) {
          out.push({ element: element, ddPath: ddPath })
        })
        return out
      },
      pathOf: function (element) {
        return paths.get(element) || null
      },
    }
  }

  /**
   * Nearest ancestor-or-self that carries a coordinate.
   *
   * @param index - result of `createIndex`.
   * @param element - the element under the pointer.
   * @returns the block element, or null.
   */
  function blockOf(index, element) {
    var node = element
    while (node !== null && node !== undefined && node.nodeType === 1) {
      if (index.paths.has(node)) return node
      node = node.parentElement
    }
    return null
  }

  /** Rendered text with tags dropped and whitespace collapsed. */
  function squash(text) {
    return String(text === null || text === undefined ? '' : text)
      .replace(/\s+/g, ' ')
      .replace(/\u200b/g, '')
      .trim()
  }

  function clip(text, limit) {
    var value = String(text === null || text === undefined ? '' : text)
    if (value.length <= limit) return value
    return value.slice(0, limit) + '…'
  }

  /**
   * Renders one coordinate as the text to put on the clipboard.
   *
   * @param description - `{ddPath, text, chapter, section, docTitle, docPath}`.
   * @param format - `'coord'`, `'coord-text'`, or `'context'`.
   * @returns the clipboard payload.
   */
  function payload(description, format) {
    var ddPath = String(description.ddPath || '')
    if (format === 'coord-text') {
      return ddPath + '\n' + clip(squash(description.text), 400)
    }
    if (format === 'context') {
      var lines = ['【设计文档·坐标】' + ddPath]
      var title = String(description.docTitle || '').trim()
      var docPath = String(description.docPath || '').trim()
      if (title !== '' || docPath !== '') {
        lines.push('文档：' + (title === '' ? docPath : title + (docPath === '' ? '' : '（' + docPath + '）')))
      }
      var where = [description.chapter, description.section].filter(function (part) {
        return typeof part === 'string' && part.trim() !== ''
      }).join(' › ')
      if (where !== '') lines.push('章节：' + where)
      lines.push('原文：' + clip(squash(description.text), 400))
      return lines.join('\n')
    }
    return ddPath
  }

  var api = {
    createIndex: createIndex,
    blockOf: blockOf,
    payload: payload,
    squash: squash,
    EDITABLE: EDITABLE,
    CONTAINER: CONTAINER,
  }

  root.DDPath = api
  if (typeof module === 'object' && module !== null && module.exports) module.exports = api
})(typeof globalThis !== 'undefined' ? globalThis : this)
