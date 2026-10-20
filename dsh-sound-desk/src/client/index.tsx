/**
 * dsh-sound-desk browser entry.
 *
 * Contributes the left activity-bar glyph, the full workbench page it opens, and a
 * shortcut for jumping to the page. The engine and the audio graph are
 * host/browser singletons, so switching back to the conversation does not stop a
 * playing sound.
 */

import React from 'react'

import { SoundDeskGlyph } from './ui/icons.tsx'
import { Workbench } from './ui/Workbench.tsx'

const ACTIVITY_ID = 'sound-desk'
const SHORTCUT_OPEN = 'sound-desk.open' as never

interface ClientContext {
  effect: (factory: () => () => void, label?: string) => void
  inject: (deps: string[], callback: (child: ClientContext & Record<string, any>) => void) => void
  slots?: {
    inject: (slot: string, callback: () => unknown) => void
    register: (options: Record<string, unknown>, component: React.ComponentType<any>) => unknown
  }
  layout?: { selectActivity: (id: string) => void }
  shortcuts?: {
    register: (options: Record<string, unknown>) => () => void
  }
}

/** Rail entries render only the glyph; the shell owns the button around it. */
function ActivityGlyph({ size = 20, active = false }: { size?: number; active?: boolean }): React.ReactElement {
  return <SoundDeskGlyph size={size} active={active} />
}

function ActivityPage(): React.ReactElement {
  return <Workbench />
}

function openWorkbench(ctx: ClientContext): void {
  try {
    ctx.layout?.selectActivity(ACTIVITY_ID)
  } catch {
    // The layout service is absent in a headless composition; the rail still works
    // wherever it is registered.
  }
}

export function apply(ctx: ClientContext): void {
  ctx.inject(['slots'], (child) => {
    child.slots?.inject('shell.activitybar.items', () =>
      child.slots?.register(
        {
          name: 'shell.activitybar.items',
          id: ACTIVITY_ID,
          order: 130,
          label: () => '音效工作台',
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
        ActivityPage,
      ),
    )
  })

  ctx.inject(['shortcuts'], (child) => {
    child.effect(() => {
      try {
        return (
          child.shortcuts?.register({
            id: SHORTCUT_OPEN,
            label: () => '音效：打开工作台',
            aliases: ['sound desk', 'sfx', '音效', '素材库'],
            defaults: {
              'web:windows': { code: 'KeyS', modifiers: ['primary', 'alt'] },
              'web:macos': { code: 'KeyS', modifiers: ['primary', 'alt'] },
              'desktop:windows': { code: 'KeyS', modifiers: ['primary', 'alt'] },
              'desktop:macos': { code: 'KeyS', modifiers: ['primary', 'alt'] },
            },
            regions: ['page', 'editable', 'terminal'],
            modals: [],
            resolve: () => ({
              status: 'handled',
              run: () => openWorkbench(ctx),
            }),
          }) ?? (() => undefined)
        )
      } catch (error) {
        console.warn('[dsh-sound-desk] shortcut registration failed', error)
        return () => undefined
      }
    }, 'dsh-sound-desk: shortcut open')
  })
}
