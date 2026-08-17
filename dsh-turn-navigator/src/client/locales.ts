/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'nav.aria': '会话轮次导航',
  'marker.aria': '跳转到第 {index} 轮：{preview}',
  'preview.title': '第 {index} 轮',
  'preview.empty': '（无内容）',
} satisfies Record<string, string>

/** The turn-navigator namespace key union. */
export type TurnNavigatorKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'nav.aria': 'Conversation turn navigation',
  'marker.aria': 'Jump to turn {index}: {preview}',
  'preview.title': 'Turn {index}',
  'preview.empty': '(No content)',
} satisfies Record<TurnNavigatorKey, string>
