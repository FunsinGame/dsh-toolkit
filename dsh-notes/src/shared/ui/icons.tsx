/** Inline SVG icons for the notes surfaces. */

import React from 'react'

function svg(paths: React.ReactNode, props: { size?: number; className?: string } = {}): React.ReactElement {
  const size = props.size ?? 18
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={props.className} aria-hidden="true">
      {paths}
    </svg>
  )
}

export function NotesGlyph({ size = 20, active = false }: { size?: number; active?: boolean }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" style={{ color: active ? 'var(--dsw-alias-state-business-primary)' : 'inherit' }} aria-hidden="true">
      <path d="M6 3.5h8.5L19 8v12.5H6z" />
      <path d="M14 3.5V8h5" />
      <path d="M9 12h7M9 15.5h7M9 19h4" />
    </svg>
  )
}

export const IconPlus = (p: { size?: number }) => svg(<><path d="M12 5v14M5 12h14" /></>, p)
export const IconFolder = (p: { size?: number }) => svg(<><path d="M3.5 6.5h6l2 2h9v10.5h-17z" /></>, p)
export const IconFolderOpen = (p: { size?: number }) => svg(<><path d="M3.5 6.5h6l2 2h9v3H6l-2.5 7.5V6.5z" /><path d="M6 19.5l2.5-8h13l-2.5 8z" /></>, p)
export const IconNote = (p: { size?: number }) => svg(<><path d="M6 3.5h8.5L19 8v12.5H6z" /><path d="M14 3.5V8h5M9 12h7M9 15.5h7" /></>, p)
export const IconChevron = (p: { size?: number; className?: string }) => svg(<path d="M9 6l6 6-6 6" />, p)
export const IconSearch = (p: { size?: number }) => svg(<><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></>, p)
export const IconSync = (p: { size?: number }) => svg(<><path d="M20 11a8 8 0 0 0-14-5L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14 5l2-2" /><path d="M20 20v-4h-4" /></>, p)
export const IconSettings = (p: { size?: number }) => svg(<><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" /></>, p)
export const IconTrash = (p: { size?: number }) => svg(<><path d="M4 7h16M9 7V4.5h6V7M6 7l1 14h10l1-14M10 11v6M14 11v6" /></>, p)
export const IconHistory = (p: { size?: number }) => svg(<><path d="M3.5 12a8.5 8.5 0 1 0 3-6.5L3.5 8" /><path d="M3.5 3.5V8h4.5" /><path d="M12 7.5V12l3 2" /></>, p)
export const IconPaperclip = (p: { size?: number }) => svg(<path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7-7L13 4.5a3.5 3.5 0 0 1 5 5l-7.8 7.8a2 2 0 0 1-2.8-2.8l7.3-7.3" />, p)
export const IconClose = (p: { size?: number }) => svg(<><path d="M6 6l12 12M18 6L6 18" /></>, p)
export const IconPin = (p: { size?: number }) => svg(<><path d="M9 3.5h6l-1 6 4 4v2H6v-2l4-4z" /><path d="M12 15.5V21" /></>, p)
export const IconUpload = (p: { size?: number }) => svg(<><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3.5h16V16" /></>, p)
export const IconDownload = (p: { size?: number }) => svg(<><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 20h16" /></>, p)
export const IconCheck = (p: { size?: number }) => svg(<path d="M4.5 12.5l5 5 10-11" />, p)
export const IconMenu = (p: { size?: number }) => svg(<><path d="M4 7h16M4 12h16M4 17h16" /></>, p)
export const IconPreview = (p: { size?: number }) => svg(<><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" /><circle cx="12" cy="12" r="2.6" /></>, p)
export const IconEdit = (p: { size?: number }) => svg(<><path d="M4 20h4L20 8l-4-4L4 16z" /><path d="M14 6l4 4" /></>, p)
export const IconSplit = (p: { size?: number }) => svg(<><rect x="3.5" y="4.5" width="17" height="15" rx="1.5" /><path d="M12 4.5v15" /></>, p)
export const IconMore = (p: { size?: number }) => svg(<><circle cx="6" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="18" cy="12" r="1" /></>, p)
