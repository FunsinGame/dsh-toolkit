/**
 * dsh-toolbox browser entry.
 *
 * Contributes one activity-bar entry and the page it opens. The page is a
 * two-column shell: the tool list on the left, the selected tool on the right.
 * Both tools are plain browser code (a local `<video>` and two local images),
 * so the host half stays empty.
 */

import type { ComponentType, ReactElement } from 'react'

import { ToolboxGlyph } from './icons'
import { STYLE_ID, CSS as SHELL_CSS } from './styles'
import { CSS as IMAGE_CSS } from './tools/image/styles'
import { disposeToolbox } from './tools/registry'
import { CSS as VIDEO_CSS } from './tools/video/styles'
import { App } from './ui/App'

const ACTIVITY_ID = 'toolbox'
const SHORTCUT_OPEN = 'toolbox.open' as never
const STYLE_TEXT = `${SHELL_CSS}\n${VIDEO_CSS}\n${IMAGE_CSS}`

interface ClientContext {
  effect: (factory: () => () => void, label?: string) => void
  inject: (deps: string[], callback: (child: ClientContext & Record<string, any>) => void) => void
  slots?: {
    inject: (slot: string, callback: () => unknown) => void
    register: (options: Record<string, unknown>, component: ComponentType<any>) => unknown
  }
  layout?: { selectActivity: (id: string) => void }
  shortcuts?: {
    register: (options: Record<string, unknown>) => () => void
  }
}

/** The rail renders only the glyph; the shell owns the button chrome. */
function ActivityGlyph({ size = 20, active = false }: { size?: number; active?: boolean }): ReactElement {
  return <ToolboxGlyph size={size} active={active} />
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = STYLE_TEXT
  document.head.append(style)
}

function ActivityPage(): ReactElement {
  ensureStyles()
  return <App />
}

function openToolbox(ctx: ClientContext): void {
  try {
    ctx.layout?.selectActivity(ACTIVITY_ID)
  } catch {
    // The layout service is absent in a headless composition; the rail still
    // works wherever the activity is registered.
  }
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    ensureStyles()
    return () => {
      document.getElementById(STYLE_ID)?.remove()
      disposeToolbox()
    }
  }, 'dsh-toolbox: lifecycle')

  ctx.inject(['slots'], (child) => {
    child.slots?.inject('shell.activitybar.items', () => child.slots?.register({
      name: 'shell.activitybar.items',
      id: ACTIVITY_ID,
      order: 120,
      label: () => '工具箱',
    }, ActivityGlyph))

    child.slots?.inject('shell.activity', () => child.slots?.register({
      name: 'shell.activity',
      key: ACTIVITY_ID,
    }, ActivityPage))
  })

  ctx.inject(['shortcuts'], (child) => {
    child.effect(() => {
      try {
        return (
          child.shortcuts?.register({
            id: SHORTCUT_OPEN,
            label: () => '工具箱',
            aliases: ['toolbox', 'tools', '工具箱'],
            defaults: {
              'web:windows': { code: 'KeyT', modifiers: ['primary', 'alt'] },
              'web:macos': { code: 'KeyT', modifiers: ['primary', 'alt'] },
              'desktop:windows': { code: 'KeyT', modifiers: ['primary', 'alt'] },
              'desktop:macos': { code: 'KeyT', modifiers: ['primary', 'alt'] },
            },
            regions: ['page', 'editable', 'terminal'],
            modals: [],
            resolve: () => ({
              status: 'handled',
              run: () => openToolbox(ctx),
            }),
          }) ?? (() => undefined)
        )
      } catch (error) {
        console.warn('[dsh-toolbox] shortcut registration failed', error)
        return () => undefined
      }
    }, 'dsh-toolbox: shortcut open')
  })
}

