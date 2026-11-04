/**
 * Inline SVG glyphs. They inherit `currentColor`, so the activity rail and the
 * controls keep DSH's theme colors without a second icon set.
 */

import type { ReactElement } from 'react'

interface IconProps {
  readonly size?: number
}

/** Activity-bar glyph: a film frame with a play triangle. */
export function VideoGlyph({ size = 20, active = false }: IconProps & { active?: boolean }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="2.6"
        y="4.4"
        width="18.8"
        height="15.2"
        rx="2.6"
        stroke="currentColor"
        strokeWidth={active ? 1.9 : 1.6}
        opacity={active ? 1 : 0.92}
      />
      <path d="M7.1 4.6v14.8M16.9 4.6v14.8" stroke="currentColor" strokeWidth="1.35" opacity=".48" />
      <path d="M10.3 8.7 15.9 12l-5.6 3.3V8.7Z" fill="currentColor" />
    </svg>
  )
}

export function PlayIcon({ size = 20 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8.2 5.7c0-1 1.1-1.6 1.9-1l8.3 6.3c.7.5.7 1.5 0 2L10.1 19.3c-.8.6-1.9 0-1.9-1V5.7Z" />
    </svg>
  )
}

export function PauseIcon({ size = 20 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6.2" y="4.8" width="4.1" height="14.4" rx="1.4" />
      <rect x="13.7" y="4.8" width="4.1" height="14.4" rx="1.4" />
    </svg>
  )
}

export function StepBackIcon({ size = 18 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.1 5.6c0-1-1.1-1.6-1.9-1L9.7 9.3V5.4H7.1v13.2h2.6v-3.9l6.5 4.7c.8.6 1.9 0 1.9-1V5.6Z" />
    </svg>
  )
}

export function StepForwardIcon({ size = 18 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M5.9 5.6c0-1 1.1-1.6 1.9-1l6.5 4.7V5.4h2.6v13.2h-2.6v-3.9L7.8 19.4c-.8.6-1.9 0-1.9-1V5.6Z" />
    </svg>
  )
}

export function JumpStartIcon({ size = 18 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="4.4" y="5" width="2.5" height="14" rx="1" />
      <path d="M17.9 4.4 7.9 12l10 7.6V4.4Z" />
    </svg>
  )
}

export function JumpEndIcon({ size = 18 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="17.1" y="5" width="2.5" height="14" rx="1" />
      <path d="M6.1 4.4 16.1 12l-10 7.6V4.4Z" />
    </svg>
  )
}

export function ReverseIcon({ size = 18 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M11.6 6.4 5.4 12l6.2 5.6V6.4Z"
        fill="currentColor"
      />
      <path
        d="M19.6 6.4 13.4 12l6.2 5.6V6.4Z"
        fill="currentColor"
        opacity=".48"
      />
    </svg>
  )
}

export function VolumeIcon({ size = 18 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 9.3v5.4h3.3l4.4 3.7V5.6L7.3 9.3H4Z" fill="currentColor" />
      <path d="M15.2 8.7a4.6 4.6 0 0 1 0 6.6M17.7 6.2a8.1 8.1 0 0 1 0 11.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

export function MutedIcon({ size = 18 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 9.3v5.4h3.3l4.4 3.7V5.6L7.3 9.3H4Z" fill="currentColor" />
      <path d="m15 9 5 6M20 9l-5 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

export function UploadIcon({ size = 20 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 15.5V4.8m0 0L7.6 9.2M12 4.8l4.4 4.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 14.2v3.2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function FrameIcon({ size = 15 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.2" y="5.2" width="17.6" height="13.6" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 5.2v13.6M16 5.2v13.6M3.2 12h17.6" stroke="currentColor" strokeWidth="1.2" opacity=".45" />
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

export function CloseIcon({ size = 16 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}
