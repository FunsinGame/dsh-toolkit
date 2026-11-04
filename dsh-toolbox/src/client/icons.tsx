/**
 * Toolbox shell glyphs.
 *
 * The activity rail only renders the glyph, so it must read at 20 px. Tool icons
 * are drawn in the sidebar's accent tile and in the toolbox brand.
 */

import type { ReactElement } from 'react'

interface IconProps {
  readonly size?: number
}

/** Activity-bar glyph: a toolbox with a handle and a cross-head screwdriver. */
export function ToolboxGlyph({ size = 20, active = false }: IconProps & { active?: boolean }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3.4 9.6h17.2v8.1a2.3 2.3 0 0 1-2.3 2.3H5.7a2.3 2.3 0 0 1-2.3-2.3V9.6Z"
        stroke="currentColor"
        strokeWidth={active ? 1.9 : 1.6}
        strokeLinejoin="round"
      />
      <path
        d="M2.7 7.9a1.9 1.9 0 0 1 1.9-1.9h14.8a1.9 1.9 0 0 1 1.9 1.9v1.7H2.7V7.9Z"
        stroke="currentColor"
        strokeWidth={active ? 1.9 : 1.6}
        strokeLinejoin="round"
      />
      <path
        d="M9.1 6V4.7a1.4 1.4 0 0 1 1.4-1.4h3a1.4 1.4 0 0 1 1.4 1.4V6"
        stroke="currentColor"
        strokeWidth="1.35"
        opacity=".55"
      />
      <path d="M12 11.6v5.2M9.6 14.2h4.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".75" />
    </svg>
  )
}

/** Tool icon: two overlapping image frames, for 图片对比. */
export function CompareGlyph({ size = 20 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.9" y="5.4" width="12.4" height="10.2" rx="2.1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="8.7" y="8.4" width="12.4" height="10.2" rx="2.1" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="7.1" cy="9.1" r="1.15" fill="currentColor" />
      <path d="m3.9 14 3.1-3.1 3.3 3.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m13.9 16.6 3-3 3.2 3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity=".8" />
    </svg>
  )
}

export function ChevronRightIcon({ size = 16 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m9.5 5.5 6.5 6.5-6.5 6.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ShieldIcon({ size = 14 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.4 19.2 6v5.4c0 4.2-3 7.3-7.2 9.2-4.2-1.9-7.2-5-7.2-9.2V6L12 3.4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m8.7 11.8 2.2 2.2 4.4-4.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
