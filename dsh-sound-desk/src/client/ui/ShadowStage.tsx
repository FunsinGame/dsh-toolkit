/**
 * Shadow-root stage.
 *
 * The workbench is a full editor UI with its own controls, dialogs and design
 * language. Rendering it inside a shadow root does two things a class prefix cannot:
 * it makes the vendored stylesheet unable to leak into DSH's shell (`.pane`,
 * `.section`, `.badge` are generic names), and it keeps DSH's global rules from
 * restyling controls this UI never intended to inherit. Theme tokens still cross the
 * boundary, because custom properties inherit.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export function ShadowStage({ css, children }: { css: string; children: React.ReactNode }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [mount, setMount] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' })

    let style = shadow.querySelector('style[data-plugin="dsh-sound-desk"]') as HTMLStyleElement | null
    if (style === null) {
      style = document.createElement('style')
      style.dataset.plugin = 'dsh-sound-desk'
      shadow.append(style)
    }
    style.textContent = css

    const node = document.createElement('div')
    node.className = 'dsh-sdk-mount'
    shadow.append(node)
    setMount(node)

    return () => {
      setMount(null)
      node.remove()
    }
  }, [css])

  return (
    <div ref={hostRef} style={{ height: '100%', minHeight: 0, display: 'block' }}>
      {mount === null ? null : createPortal(children, mount)}
    </div>
  )
}
