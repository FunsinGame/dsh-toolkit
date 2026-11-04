/**
 * The toolbox page.
 *
 * One activity-bar entry opens this page: tools on the left, the selected
 * tool's own interface on the right. The selection is remembered in
 * `localStorage`, so reopening the toolbox returns to the tool last used.
 */

import { useEffect, useState, type CSSProperties, type ReactElement } from 'react'

import { ChevronRightIcon, ShieldIcon, ToolboxGlyph } from '../icons'
import { findTool, TOOLS } from '../tools/registry'

const STORAGE_KEY = 'dsh-toolbox:active-tool'

function initialTool(): string {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored !== null && TOOLS.some((tool) => tool.id === stored)) return stored
  } catch {
    // Private browsing: fall back to the first tool.
  }
  return TOOLS[0]!.id
}

export function App(): ReactElement {
  const [activeId, setActiveId] = useState<string>(initialTool)
  const active = findTool(activeId)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, activeId)
    } catch {
      // Preference loss is harmless.
    }
  }, [activeId])

  return (
    <div className="dtb-root">
      <aside className="dtb-sidebar" aria-label="工具箱">
        <header className="dtb-brand">
          <span className="dtb-logo"><ToolboxGlyph size={20} /></span>
          <div className="dtb-brand-text">
            <h1>工具箱</h1>
            <p>本地小工具合集</p>
          </div>
        </header>

        <div className="dtb-section-label">
          <span>工具</span>
          <span className="dtb-count">{TOOLS.length}</span>
        </div>

        <nav className="dtb-list" aria-label="工具列表">
          {TOOLS.map((tool) => {
            const Icon = tool.icon
            const selected = tool.id === activeId
            return (
              <button
                key={tool.id}
                type="button"
                className="dtb-tool"
                data-tool={tool.id}
                data-active={selected ? 'true' : 'false'}
                aria-current={selected ? 'true' : undefined}
                title={`${tool.name}：${tool.summary}`}
                style={{ '--dtb-tool-accent': tool.accent } as CSSProperties}
                onClick={() => setActiveId(tool.id)}
              >
                <span className="dtb-tool-glyph"><Icon size={19} /></span>
                <span className="dtb-tool-text">
                  <strong>{tool.name}</strong>
                  <span>{tool.summary}</span>
                </span>
                <span className="dtb-tool-chevron"><ChevronRightIcon size={15} /></span>
              </button>
            )
          })}
        </nav>

        <footer className="dtb-foot">
          <div className="dtb-foot-row">
            <span className="dtb-foot-dot" />
            <ShieldIcon size={13} />
            <span className="dtb-foot-text">全部在本机完成，不上传文件</span>
          </div>
          <div className="dtb-foot-row">
            <span className="dtb-version">v{__DSH_TOOLBOX_VERSION__}</span>
            <span className="dtb-foot-text">· DSH 工具箱</span>
          </div>
        </footer>
      </aside>

      <main className="dtb-main">
        {TOOLS.map((tool) => {
          const Tool = tool.component
          const selected = tool.id === active.id
          return (
            <section
              key={tool.id}
              className="dtb-pane"
              data-tool={tool.id}
              hidden={!selected}
              aria-label={tool.name}
            >
              <Tool active={selected} />
            </section>
          )
        })}
      </main>
    </div>
  )
}
