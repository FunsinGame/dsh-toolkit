/** Inline SVG glyphs for the image-compare tool. They inherit `currentColor`. */

import type { ReactElement } from 'react'

interface IconProps {
  readonly size?: number
}

export function UploadIcon({ size = 18 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 15.5V4.8m0 0L7.6 9.2M12 4.8l4.4 4.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 14.2v3.2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function ImageGlyph({ size = 20 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4.4" width="18" height="15.2" rx="2.6" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="8.8" cy="9.7" r="1.5" fill="currentColor" />
      <path d="m4.3 17.6 4.9-5 4.2 4.2 2.4-2.3 4 4.1" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function CloseIcon({ size = 16 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}

export function SwapIcon({ size = 18 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 8.4h13.6m0 0-3.4-3.4m3.4 3.4-3.4 3.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 15.6H6.4m0 0 3.4 3.4m-3.4-3.4 3.4-3.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DownloadIcon({ size = 16 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4.6v10.2m0 0 4.2-4.2M12 14.8l-4.2-4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.6 15.6v2.6a2 2 0 0 0 2 2h10.8a2 2 0 0 0 2-2v-2.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function ZoomInIcon({ size = 16 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="10.8" cy="10.8" r="6.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="m15.6 15.6 4.2 4.2M8.2 10.8h5.2M10.8 8.2v5.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function ZoomOutIcon({ size = 16 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="10.8" cy="10.8" r="6.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="m15.6 15.6 4.2 4.2M8.2 10.8h5.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function FitIcon({ size = 16 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.4 9V5.6a1.2 1.2 0 0 1 1.2-1.2H9M15 4.4h3.4a1.2 1.2 0 0 1 1.2 1.2V9M19.6 15v3.4a1.2 1.2 0 0 1-1.2 1.2H15M9 19.6H5.6a1.2 1.2 0 0 1-1.2-1.2V15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function PlayIcon({ size = 15 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8.2 5.7c0-1 1.1-1.6 1.9-1l8.3 6.3c.7.5.7 1.5 0 2L10.1 19.3c-.8.6-1.9 0-1.9-1V5.7Z" />
    </svg>
  )
}

export function PauseIcon({ size = 15 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6.2" y="4.8" width="4.1" height="14.4" rx="1.4" />
      <rect x="13.7" y="4.8" width="4.1" height="14.4" rx="1.4" />
    </svg>
  )
}

export function AlertIcon({ size = 18 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.8 21 20H3L12 3.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 9v5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <circle cx="12" cy="17.1" r="1.1" fill="currentColor" />
    </svg>
  )
}

/* ── mode glyphs ───────────────────────────────────────────────────────── */

export function SplitIcon({ size = 16 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4.6" width="7.4" height="14.8" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.6" y="4.6" width="7.4" height="14.8" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

export function SliderIcon({ size = 16 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4.6" width="18" height="14.8" rx="2.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 3.2v17.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m9.4 10.2-2 1.8 2 1.8M14.6 10.2l2 1.8-2 1.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function FadeIcon({ size = 16 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4.6" width="18" height="14.8" rx="2.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 4.6v14.8" stroke="currentColor" strokeWidth="1.3" opacity=".35" />
      <path d="M15 9.2h3.4M15 12h3.4M15 14.8h3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".8" />
    </svg>
  )
}

export function BlinkIcon({ size = 16 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4.6" width="18" height="14.8" rx="2.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.2 9.4v5.2M15.8 9.4v5.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity=".55" />
      <path d="m10.6 10.2 3 1.8-3 1.8v-3.6Z" fill="currentColor" />
    </svg>
  )
}

export function DifferenceIcon({ size = 16 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9.4" cy="12" r="5.6" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="14.6" cy="12" r="5.6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7.9v8.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".45" />
    </svg>
  )
}

export function HighlightIcon({ size = 16 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 17.6 14.4 7.2l2.4 2.4L6.4 20H4v-2.4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m15.4 6.2 1.6-1.6a1.4 1.4 0 0 1 2 0l1.1 1.1a1.4 1.4 0 0 1 0 2l-1.6 1.6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12.6 17.6h7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}
