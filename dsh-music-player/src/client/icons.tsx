/** Inline SVG icon set (stroke follows currentColor). */

import React from 'react'

export interface IconProps {
  size?: number
  className?: string
  strokeWidth?: number
}

function Svg({
  size = 18,
  className,
  strokeWidth = 1.8,
  children,
  viewBox = '0 0 24 24',
}: IconProps & { children: React.ReactNode; viewBox?: string }): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export function IconSearch(props: IconProps): React.ReactElement {
  return <Svg {...props}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></Svg>
}

export function IconHeart(props: IconProps): React.ReactElement {
  return <Svg {...props}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></Svg>
}

export function IconQueue(props: IconProps): React.ReactElement {
  return <Svg {...props}><path d="M4 6h12M4 12h12M4 18h8" /><path d="M18 15v5l3-2.5-3-2.5Z" /></Svg>
}

export function IconUser(props: IconProps): React.ReactElement {
  return <Svg {...props}><circle cx="12" cy="8" r="3.6" /><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" /></Svg>
}

export function IconSettings(props: IconProps): React.ReactElement {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9L4.2 7A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </Svg>
  )
}

export function IconPlay(props: IconProps): React.ReactElement {
  return <Svg {...props}><path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" stroke="none" /></Svg>
}

export function IconPause(props: IconProps): React.ReactElement {
  return <Svg {...props}><rect x="6.5" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" stroke="none" /><rect x="13.9" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" stroke="none" /></Svg>
}

export function IconPrev(props: IconProps): React.ReactElement {
  return <Svg {...props}><path d="M18 6v12L9 12l9-6Z" fill="currentColor" stroke="none" /><rect x="5" y="6" width="2.4" height="12" rx="1" fill="currentColor" stroke="none" /></Svg>
}

export function IconNext(props: IconProps): React.ReactElement {
  return <Svg {...props}><path d="M6 6v12l9-6-9-6Z" fill="currentColor" stroke="none" /><rect x="16.6" y="6" width="2.4" height="12" rx="1" fill="currentColor" stroke="none" /></Svg>
}

export function IconVolume(props: IconProps): React.ReactElement {
  return (
    <Svg {...props}>
      <path d="M4 10v4h3.2L12 18V6L7.2 10H4Z" fill="currentColor" stroke="none" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </Svg>
  )
}

export function IconVolumeMute(props: IconProps): React.ReactElement {
  return (
    <Svg {...props}>
      <path d="M4 10v4h3.2L12 18V6L7.2 10H4Z" fill="currentColor" stroke="none" />
      <path d="m16 10 4 4m0-4-4 4" />
    </Svg>
  )
}

export function IconRepeat(props: IconProps): React.ReactElement {
  return <Svg {...props}><path d="m17 2 3 3-3 3" /><path d="M20 5H8a4 4 0 0 0-4 4v1" /><path d="m7 22-3-3 3-3" /><path d="M4 19h12a4 4 0 0 0 4-4v-1" /></Svg>
}

export function IconRepeatOne(props: IconProps): React.ReactElement {
  return <Svg {...props}><path d="m17 2 3 3-3 3" /><path d="M20 5H8a4 4 0 0 0-4 4v1" /><path d="m7 22-3-3 3-3" /><path d="M4 19h12a4 4 0 0 0 4-4v-1" /><path d="M12 9.5v5M12 9.5l-1.5 1" /></Svg>
}

export function IconShuffle(props: IconProps): React.ReactElement {
  return <Svg {...props}><path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="m15 15 6 6M4 4l5 5" /></Svg>
}

export function IconListPlus(props: IconProps): React.ReactElement {
  return <Svg {...props}><path d="M4 6h11M4 12h9M4 18h7" /><path d="M18 14v6M15 17h6" /></Svg>
}

export function IconPlus(props: IconProps): React.ReactElement {
  return <Svg {...props}><path d="M12 5v14M5 12h14" /></Svg>
}

export function IconCheck(props: IconProps): React.ReactElement {
  return <Svg {...props}><path d="m5 12.5 4.4 4.4L19 7.3" /></Svg>
}

export function IconTrash(props: IconProps): React.ReactElement {
  return <Svg {...props}><path d="M4 7h16M9 7V4.8h6V7M6.5 7l.8 13h9.4l.8-13M10 11v5M14 11v5" /></Svg>
}

export function IconBack(props: IconProps): React.ReactElement {
  return <Svg {...props}><path d="m15 5-7 7 7 7" /></Svg>
}

export function IconChevronRight(props: IconProps): React.ReactElement {
  return <Svg {...props}><path d="m9 5 7 7-7 7" /></Svg>
}

export function IconRefresh(props: IconProps): React.ReactElement {
  return <Svg {...props}><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></Svg>
}

export function IconMore(props: IconProps): React.ReactElement {
  return <Svg {...props}><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" /></Svg>
}

export function IconMusic(props: IconProps): React.ReactElement {
  return <Svg {...props}><path d="M9 18V5l10-2v13" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></Svg>
}

export function IconSpinner(props: IconProps): React.ReactElement {
  return (
    <svg
      width={props.size ?? 18}
      height={props.size ?? 18}
      viewBox="0 0 24 24"
      fill="none"
      className={`dmp-spin ${props.className ?? ''}`}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2.4" />
      <path d="M20.5 12a8.5 8.5 0 0 0-8.5-8.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

export function IconClose(props: IconProps): React.ReactElement {
  return <Svg {...props}><path d="m6 6 12 12M18 6 6 18" /></Svg>
}

export function IconFolder(props: IconProps): React.ReactElement {
  return <Svg {...props}><path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3.2l1.8 2.2H18a2.5 2.5 0 0 1 2.5 2.5v7.3A2.5 2.5 0 0 1 18 19.5H6a2.5 2.5 0 0 1-2.5-2.5V7.5Z" /></Svg>
}

export function IconDisc(props: IconProps): React.ReactElement {
  return <Svg {...props}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="2" /></Svg>
}

export function IconDownload(props: IconProps): React.ReactElement {
  return <Svg {...props}><path d="M12 4v10m0 0 3.5-3.5M12 14l-3.5-3.5" /><path d="M5 17.5v1A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-1" /></Svg>
}

export function IconWifi(props: IconProps): React.ReactElement {
  return <Svg {...props}><path d="M3.5 8.5a13 13 0 0 1 17 0" /><path d="M6.5 12a8.5 8.5 0 0 1 11 0" /><path d="M9.5 15.5a4 4 0 0 1 5 0" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" /></Svg>
}

export function IconLogin(props: IconProps): React.ReactElement {
  return <Svg {...props}><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M10 8l4 4-4 4M14 12H4" /></Svg>
}

export function IconGrip(props: IconProps): React.ReactElement {
  return <Svg {...props} strokeWidth={2}><path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" /></Svg>
}

export function IconClock(props: IconProps): React.ReactElement {
  return <Svg {...props}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>
}

export function IconSparkles(props: IconProps): React.ReactElement {
  return <Svg {...props}><path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" /><path d="m18.5 15 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" /></Svg>
}

export function IconInfo(props: IconProps): React.ReactElement {
  return <Svg {...props}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></Svg>
}

/** Activity-bar glyph: a music note with a small equalizer. */
export function MusicGlyph({ size = 20, active = false }: { size?: number; active?: boolean }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M9.5 17.2V6.4l8-1.6v10.6"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6.6" cy="17.6" r="2.6" fill="currentColor" opacity={active ? 1 : 0.9} />
      <circle cx="14.6" cy="15.8" r="2.6" fill="currentColor" opacity={active ? 1 : 0.9} />
      {active ? (
        <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M19.3 10.5v5" opacity="0.75" />
          <path d="M21.4 8.8v8.4" opacity="0.45" />
        </g>
      ) : null}
    </svg>
  )
}
