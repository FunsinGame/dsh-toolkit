/**
 * dsh-video-player browser entry.
 *
 * Contributes one activity-bar entry and the page it opens. The player's
 * `<video>` element and its playback state live in a module-level engine, so
 * switching back to the conversation pauses the picture but keeps the file,
 * position, volume, and speed for the next visit.
 */

import type { ComponentType, ReactElement } from 'react'

import { App } from './ui/App'
import { PlayerEngine } from './engine'
import { STYLE_ID, CSS } from './styles'
import { VideoGlyph } from './icons'

const ACTIVITY_ID = 'video-player'
const SHORTCUT_OPEN = 'video-player.open' as never

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

let engine: PlayerEngine | null = null

function getEngine(): PlayerEngine {
  if (engine === null) engine = new PlayerEngine()
  return engine
}

function disposeEngine(): void {
  if (engine === null) return
  engine.dispose()
  engine = null
}

/** The rail renders only the glyph; the shell owns the button chrome. */
function ActivityGlyph({ size = 20, active = false }: { size?: number; active?: boolean }): ReactElement {
  return <VideoGlyph size={size} active={active} />
}

function ActivityPage(): ReactElement {
  return <App engine={getEngine()} />
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.append(style)
}

function openPlayer(ctx: ClientContext): void {
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
      disposeEngine()
    }
  }, 'dsh-video-player: lifecycle')

  ctx.inject(['slots'], (child) => {
    child.slots?.inject('shell.activitybar.items', () => child.slots?.register({
      name: 'shell.activitybar.items',
      id: ACTIVITY_ID,
      order: 125,
      label: () => '视频逐帧播放器',
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
            label: () => '视频：打开逐帧播放器',
            aliases: ['video', 'frame', 'mp4', '视频', '逐帧'],
            defaults: {
              'web:windows': { code: 'KeyV', modifiers: ['primary', 'alt'] },
              'web:macos': { code: 'KeyV', modifiers: ['primary', 'alt'] },
              'desktop:windows': { code: 'KeyV', modifiers: ['primary', 'alt'] },
              'desktop:macos': { code: 'KeyV', modifiers: ['primary', 'alt'] },
            },
            regions: ['page', 'editable', 'terminal'],
            modals: [],
            resolve: () => ({
              status: 'handled',
              run: () => openPlayer(ctx),
            }),
          }) ?? (() => undefined)
        )
      } catch (error) {
        console.warn('[dsh-video-player] shortcut registration failed', error)
        return () => undefined
      }
    }, 'dsh-video-player: shortcut open')
  })
}
