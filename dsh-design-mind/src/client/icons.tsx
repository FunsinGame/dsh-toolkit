/** Inline SVG glyphs; the rail renders only the mark, the shell owns the chrome. */

import type { ReactElement } from 'react'

export function DesignGlyph({ size = 20, active = false }: { size?: number; active?: boolean }): ReactElement {
  const stroke = active ? 1.9 : 1.6
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="2.9"
        y="3.4"
        width="18.2"
        height="13.6"
        rx="2.6"
        stroke="currentColor"
        strokeWidth={stroke}
      />
      <path
        d="M6.8 8.1h6.2M6.8 11.5h4.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.75"
      />
      <path d="M15.4 11.6h4.6v3.8l-1.9-1.2h-2.7z" fill="currentColor" />
      <path d="M9.7 17.2v2.3M14.3 17.2v2.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

export type IconName =
  | 'image'
  | 'clipboard'
  | 'fit'
  | 'zoomIn'
  | 'zoomOut'
  | 'trash'
  | 'download'
  | 'copy'
  | 'plus'
  | 'folder'
  | 'broom'

export function Icon({ name, size = 16 }: { name: IconName; size?: number }): ReactElement {
  const stroke = {
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {name === 'image' ? (
        <>
          <rect x="3.2" y="4.2" width="17.6" height="15.6" rx="2.4" {...stroke} />
          <circle cx="8.6" cy="9.6" r="1.6" {...stroke} />
          <path d="M4.4 17.4l4.6-4.6 3.6 3.6 2.8-2.8 4.2 4.2" {...stroke} />
        </>
      ) : null}
      {name === 'clipboard' ? (
        <>
          <rect x="6" y="4.4" width="12" height="16.2" rx="2.2" {...stroke} />
          <rect x="9" y="2.6" width="6" height="3.4" rx="1.2" {...stroke} />
          <path d="M9 10.4h6M9 14h6" {...stroke} />
        </>
      ) : null}
      {name === 'fit' ? (
        <>
          <path d="M4 9V5.4A1.4 1.4 0 0 1 5.4 4H9" {...stroke} />
          <path d="M15 4h3.6A1.4 1.4 0 0 1 20 5.4V9" {...stroke} />
          <path d="M20 15v3.6a1.4 1.4 0 0 1-1.4 1.4H15" {...stroke} />
          <path d="M9 20H5.4A1.4 1.4 0 0 1 4 18.6V15" {...stroke} />
        </>
      ) : null}
      {name === 'zoomIn' ? (
        <>
          <circle cx="10.8" cy="10.8" r="6.2" {...stroke} />
          <path d="M19.8 19.8l-4.3-4.3M8.2 10.8h5.2M10.8 8.2v5.2" {...stroke} />
        </>
      ) : null}
      {name === 'zoomOut' ? (
        <>
          <circle cx="10.8" cy="10.8" r="6.2" {...stroke} />
          <path d="M19.8 19.8l-4.3-4.3M8.2 10.8h5.2" {...stroke} />
        </>
      ) : null}
      {name === 'trash' ? (
        <>
          <path d="M4.6 7h14.8M9.4 7V4.8h5.2V7M6.6 7l.8 12.2h9.2L17.4 7" {...stroke} />
          <path d="M10.2 10.6v5.2M13.8 10.6v5.2" {...stroke} />
        </>
      ) : null}
      {name === 'download' ? (
        <>
          <path d="M12 3.8v10.6M7.8 10.4l4.2 4.2 4.2-4.2" {...stroke} />
          <path d="M4.6 17.4v1.4a1.4 1.4 0 0 0 1.4 1.4h12a1.4 1.4 0 0 0 1.4-1.4v-1.4" {...stroke} />
        </>
      ) : null}
      {name === 'copy' ? (
        <>
          <rect x="8.4" y="8.4" width="11.2" height="11.2" rx="2" {...stroke} />
          <path d="M15.6 5.4a2 2 0 0 0-2-1.4H6.4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 1.4 2" {...stroke} />
        </>
      ) : null}
      {name === 'plus' ? <path d="M12 5v14M5 12h14" {...stroke} /> : null}
      {name === 'folder' ? (
        <>
          <path d="M3.4 7.4a1.6 1.6 0 0 1 1.6-1.6h4l1.9 2.1h8.1a1.6 1.6 0 0 1 1.6 1.6v8.4a1.6 1.6 0 0 1-1.6 1.6H5a1.6 1.6 0 0 1-1.6-1.6z" {...stroke} />
          <path d="M3.6 9.4h16.8" {...stroke} opacity=".6" />
        </>
      ) : null}
      {name === 'broom' ? (
        <>
          <path d="M15.6 3.6 9.4 9.8" {...stroke} />
          <path d="M8.2 8.6l5.2 5.2" {...stroke} />
          <path d="M6.4 12.2l5.4 5.4-2.6 2.6-5.4-5.4z" {...stroke} />
          <path d="M9.2 17.6l-1.4 2.8M11.8 18.4l-.6 2.9" {...stroke} />
        </>
      ) : null}
    </svg>
  )
}
