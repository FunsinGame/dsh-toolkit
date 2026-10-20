/** Small browser-safe formatting helpers shared by every surface. */

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  let value = bytes / 1024
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
}

export function formatDateTime(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '—'
  try {
    return new Date(value).toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return new Date(value).toISOString()
  }
}

export function formatRelative(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '—'
  const delta = Date.now() - value
  if (delta < 0) return formatDateTime(value)
  const seconds = Math.floor(delta / 1000)
  if (seconds < 45) return '刚刚'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return formatDateTime(value)
}

export function wordCount(text: string): { words: number; characters: number; lines: number } {
  const characters = Array.from(text).length
  const words = text.trim() === '' ? 0 : text.trim().split(/\s+/u).length
  const lines = text === '' ? 0 : text.split('\n').length
  return { words, characters, lines }
}

export function noteTitleFromContent(content: string, fallback = '未命名笔记'): string {
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (line === '') continue
    const heading = /^#{1,6}\s+(.+)$/u.exec(line)
    const title = (heading?.[1] ?? line).replace(/[*_`~]/gu, '').trim()
    if (title !== '') return title.slice(0, 120)
    break
  }
  return fallback
}

export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of input) {
    if (typeof item !== 'string') continue
    const tag = item.trim().replace(/^#/, '').slice(0, 64)
    if (tag === '' || seen.has(tag)) continue
    seen.add(tag)
    out.push(tag)
    if (out.length >= 32) break
  }
  return out
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
