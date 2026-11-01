/**
 * dsh-design-mind browser entry.
 *
 * Contributes one activity-bar entry and the page it opens. The picture and the
 * comments live in a module-level store, so switching back to the conversation
 * pauses the view but keeps the canvas, the selection and the unsent comments
 * for the next visit.
 */

import type { ReactElement } from 'react'

import { App } from './ui/App.tsx'
import { DesignMindStore } from './store.ts'
import { CSS, STYLE_ID } from './styles.ts'
import { DesignGlyph } from './icons.tsx'

const ACTIVITY_ID = 'design-mind'
const SHORTCUT_OPEN = 'design-mind.open' as never

interface ClientContext {
  effect: (factory: () => () => void, label?: string) => void
  inject: (deps: string[], callback: (child: ClientContext & Record<string, any>) => void) => void
  slots?: {
    inject: (slot: string, callback: () => unknown) => void
    register: (options: Record<string, unknown>, component: (props: any) => ReactElement) => unknown
  }
  layout?: { selectActivity: (id: string) => void }
  shortcuts?: {
    register: (options: Record<string, unknown>) => () => void
  }
}

let store: DesignMindStore | null = null

function getStore(): DesignMindStore {
  if (store === null) store = new DesignMindStore()
  return store
}

/** The rail renders only the glyph; the shell owns the button chrome. */
function ActivityGlyph({ size = 20, active = false }: { size?: number; active?: boolean }): ReactElement {
  return <DesignGlyph size={size} active={active} />
}

function DesignMindPage(): ReactElement {
  return <App store={getStore()} />
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID) !== null) return
  const element = document.createElement('style')
  element.id = STYLE_ID
  element.textContent = CSS
  document.head.append(element)
}

function openDesignMind(ctx: ClientContext): void {
  try {
    ctx.layout?.selectActivity(ACTIVITY_ID)
  } catch {
    // The layout service is absent in a headless composition; the rail still
    // works wherever the activity is registered.
  }
}

export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => {
      ensureStyles()
      return () => {
        document.getElementById(STYLE_ID)?.remove()
      }
    },
    'dsh-design-mind: styles',
  )

  ctx.inject(['slots'], (child) => {
    child.slots?.inject('shell.activitybar.items', () =>
      child.slots?.register(
        {
          name: 'shell.activitybar.items',
          id: ACTIVITY_ID,
          order: 115,
          label: () => '设计批注',
        },
        ActivityGlyph,
      ),
    )

    child.slots?.inject('shell.activity', () =>
      child.slots?.register(
        {
          name: 'shell.activity',
          key: ACTIVITY_ID,
        },
        DesignMindPage,
      ),
    )
  })

  ctx.inject(['shortcuts'], (child) => {
    child.effect(() => {
      try {
        return (
          child.shortcuts?.register({
            id: SHORTCUT_OPEN,
            label: () => '设计批注：打开标注画布',
            aliases: ['design', 'annotation', '标注', '评论', '设计'],
            defaults: {
              'web:windows': { code: 'KeyD', modifiers: ['primary', 'alt'] },
              'web:macos': { code: 'KeyD', modifiers: ['primary', 'alt'] },
              'desktop:windows': { code: 'KeyD', modifiers: ['primary', 'alt'] },
              'desktop:macos': { code: 'KeyD', modifiers: ['primary', 'alt'] },
            },
            regions: ['page', 'editable', 'terminal'],
            modals: [],
            resolve: () => ({
              status: 'handled',
              run: () => openDesignMind(ctx),
            }),
          }) ?? (() => undefined)
        )
      } catch (error) {
        console.warn('[dsh-design-mind] shortcut registration failed', error)
        return () => undefined
      }
    }, 'dsh-design-mind: shortcut open')
  })
}

export { App } from './ui/App.tsx'
export { DesignMindStore } from './store.ts'
