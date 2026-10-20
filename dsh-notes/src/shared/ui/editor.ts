/** Markdown textarea editing operations shared by web and DSH. */

export interface TextSelection {
  value: string
  start: number
  end: number
}

export interface EditResult extends TextSelection {}

export function wrapSelection(state: TextSelection, before: string, after = before, placeholder = '文本'): EditResult {
  const selected = state.value.slice(state.start, state.end) || placeholder
  const value = `${state.value.slice(0, state.start)}${before}${selected}${after}${state.value.slice(state.end)}`
  const start = state.start + before.length
  const end = start + selected.length
  return { value, start, end }
}

export function prefixLines(state: TextSelection, prefix: string, strip = false): EditResult {
  const { value, start, end } = state
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const lineEndRaw = value.indexOf('\n', end)
  const lineEnd = lineEndRaw < 0 ? value.length : lineEndRaw
  const block = value.slice(lineStart, lineEnd)
  const lines = block.split('\n')
  const next = lines.map((line) => {
    if (strip) return line.replace(new RegExp(`^${escape(prefix)}`), '')
    return line.startsWith(prefix) ? line : `${prefix}${line}`
  })
  const replacement = next.join('\n')
  const result = `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`
  return { value: result, start: lineStart, end: lineStart + replacement.length }
}

export function insertBlock(state: TextSelection, block: string): EditResult {
  const needsLeading = state.start > 0 && state.value[state.start - 1] !== '\n'
  const needsTrailing = state.end < state.value.length && state.value[state.end] !== '\n'
  const text = `${needsLeading ? '\n\n' : ''}${block}${needsTrailing ? '\n\n' : '\n'}`
  const value = `${state.value.slice(0, state.start)}${text}${state.value.slice(state.end)}`
  const cursor = state.start + text.length
  return { value, start: cursor, end: cursor }
}

export function indentSelection(state: TextSelection, outdent = false): EditResult {
  const { value, start, end } = state
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const lineEndRaw = value.indexOf('\n', end)
  const lineEnd = lineEndRaw < 0 ? value.length : lineEndRaw
  const block = value.slice(lineStart, lineEnd)
  const lines = block.split('\n').map((line) => outdent
    ? line.replace(/^( {1,4}|\t)/u, '')
    : `  ${line}`)
  const replacement = lines.join('\n')
  const result = `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`
  return { value: result, start: lineStart, end: lineStart + replacement.length }
}

/** Continue a list/quote prefix after Enter. Returns null when not applicable. */
export function continueLine(state: TextSelection): EditResult | null {
  const { value, start, end } = state
  if (start !== end) return null
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const current = value.slice(lineStart, start)
  const task = /^(\s*)([-*+])\s+\[([ xX])\]\s+/u.exec(current)
  const bullet = /^(\s*)([-*+])\s+/u.exec(current)
  const ordered = /^(\s*)(\d+)[.)]\s+/u.exec(current)
  const quote = /^(\s*)>\s?/u.exec(current)
  let insertion: string | null = null
  if (task !== null) insertion = `\n${task[1]}${task[2]} [ ] `
  else if (bullet !== null) insertion = `\n${bullet[1]}${bullet[2]} `
  else if (ordered !== null) insertion = `\n${ordered[1]}${Number(ordered[2]) + 1}${current.includes(')') ? ')' : '.'} `
  else if (quote !== null) insertion = `\n${quote[1]}> `
  if (insertion === null) return null
  const valueNext = `${value.slice(0, start)}${insertion}${value.slice(end)}`
  const cursor = start + insertion.length
  return { value: valueNext, start: cursor, end: cursor }
}

export function insertAtCursor(state: TextSelection, text: string): EditResult {
  const value = `${state.value.slice(0, state.start)}${text}${state.value.slice(state.end)}`
  const cursor = state.start + text.length
  return { value, start: cursor, end: cursor }
}

export function replaceRange(state: TextSelection, start: number, end: number, text: string): EditResult {
  const value = `${state.value.slice(0, start)}${text}${state.value.slice(end)}`
  const cursor = start + text.length
  return { value, start: cursor, end: cursor }
}

export function findNext(value: string, needle: string, from: number): { start: number; end: number } | null {
  if (needle === '') return null
  const index = value.indexOf(needle, Math.max(0, from))
  if (index >= 0) return { start: index, end: index + needle.length }
  const wrapped = value.indexOf(needle)
  if (wrapped >= 0) return { start: wrapped, end: wrapped + needle.length }
  return null
}

export function replaceAll(value: string, needle: string, replacement: string): string {
  if (needle === '') return value
  return value.split(needle).join(replacement)
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export const TOOLBAR_ACTIONS = [
  { id: 'bold', label: '粗体', title: '粗体 (Ctrl+B)' },
  { id: 'italic', label: '斜体', title: '斜体 (Ctrl+I)' },
  { id: 'strike', label: '删除线', title: '删除线' },
  { id: 'h1', label: 'H1', title: '一级标题' },
  { id: 'h2', label: 'H2', title: '二级标题' },
  { id: 'h3', label: 'H3', title: '三级标题' },
  { id: 'quote', label: '引用', title: '引用' },
  { id: 'ul', label: '列表', title: '无序列表' },
  { id: 'ol', label: '1.', title: '有序列表' },
  { id: 'task', label: '☐', title: '任务列表' },
  { id: 'code', label: '代码', title: '行内代码' },
  { id: 'codeblock', label: '代码块', title: '代码块' },
  { id: 'link', label: '链接', title: '链接 (Ctrl+K)' },
  { id: 'image', label: '图片', title: '图片/附件' },
  { id: 'table', label: '表格', title: '表格' },
  { id: 'hr', label: '分隔线', title: '分隔线' },
] as const
