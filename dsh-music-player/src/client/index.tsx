/**
 * dsh-music-player browser entry.
 *
 * Contributes three surfaces that share one controller:
 *  - the left activity-bar glyph and its full player page;
 *  - a compact status-bar item;
 *  - global play/pause, previous, and next shortcuts.
 *
 * The controller and its <audio> element live outside React, so switching back
 * to the conversation does not interrupt playback.
 */

import React from 'react'
import { PlayerController } from './player'
import { CSS, STYLE_ID } from './styles'
import { App } from './ui/App'
import { MusicGlyph } from './icons'
import { StatusItem } from './ui/StatusItem'

const ACTIVITY_ID = 'music-player'
const SHORTCUT_PLAY = 'music-player.playPause' as never
const SHORTCUT_NEXT = 'music-player.next' as never
const SHORTCUT_PREV = 'music-player.previous' as never

let controller: PlayerController | null = null

function getController(): PlayerController {
  if (controller === null) throw new Error('dsh-music-player: controller is not ready')
  return controller
}

function ActivityPage(): React.ReactElement {
  return <App controller={getController()} />
}

/** The activity rail renders only the glyph; the shell owns the button chrome. */
function ActivityGlyph({ size = 20, active = false }: { size?: number; active?: boolean }): React.ReactElement {
  return <MusicGlyph size={size} active={active} />
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.append(style)
}

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

export function apply(ctx: ClientContext): void {
  ensureStyles()
  const player = new PlayerController()
  controller = player
  Object.defineProperty(window, '__DSH_MUSIC_PLAYER__', {
    configurable: true,
    get: () => ({
      controller: player,
      audio: player.audioElement,
      open: () => { player.openPage() },
    }),
  })
  player.setOpenHandler(() => {
    try {
      ctx.layout?.selectActivity(ACTIVITY_ID)
    } catch {
      // The activity may not be registered yet; the page is still reachable
      // through the rail once registration settles.
    }
  })
  ctx.effect(() => {
    player.start()
    return () => {
      player.dispose()
      if (controller === player) {
        controller = null
        delete (window as unknown as Record<string, unknown>).__DSH_MUSIC_PLAYER__
      }
    }
  }, 'dsh-music-player: controller')

  ctx.inject(['slots'], (child) => {
    child.slots?.inject('shell.activitybar.items', () => child.slots?.register({
      name: 'shell.activitybar.items',
      id: ACTIVITY_ID,
      order: 120,
      label: () => '音乐播放器',
    }, ActivityGlyph))

    child.slots?.inject('shell.activity', () => child.slots?.register({
      name: 'shell.activity',
      key: ACTIVITY_ID,
    }, ActivityPage))

    child.slots?.inject('shell.statusbar.left', () => child.slots?.register({
      name: 'shell.statusbar.left',
      id: 'dsh-music-player.status',
      order: 60,
      inject: () => ({
        controller: getController(),
        open: () => {
          try {
            ctx.layout?.selectActivity(ACTIVITY_ID)
          } catch {
            // Ignore a layout that is not ready.
          }
        },
      }),
    }, StatusItem))
  })

  ctx.inject(['shortcuts'], (child) => {
    const register = (options: Record<string, unknown>): void => {
      child.effect(() => {
        try {
          return child.shortcuts?.register(options) ?? (() => undefined)
        } catch (error) {
          console.warn('[dsh-music-player] shortcut registration failed', error)
          return () => undefined
        }
      }, `dsh-music-player: shortcut ${String(options.id)}`)
    }
    const modifiers = ['primary', 'alt']
    register({
      id: SHORTCUT_PLAY,
      label: () => '音乐：播放 / 暂停',
      aliases: ['music', 'play', 'pause', '音乐'],
      defaults: {
        'web:windows': { code: 'Space', modifiers },
        'web:macos': { code: 'Space', modifiers },
        'desktop:windows': { code: 'Space', modifiers },
        'desktop:macos': { code: 'Space', modifiers },
      },
      regions: ['page', 'editable', 'terminal'],
      modals: [],
      resolve: () => ({
        status: 'handled',
        run: () => {
          const player = getController()
          if (player.player.getSnapshot().needsGesture) player.restoreSound()
          else void player.toggle()
        },
      }),
    })
    register({
      id: SHORTCUT_NEXT,
      label: () => '音乐：下一首',
      aliases: ['music next', '下一首'],
      defaults: {
        'web:windows': { code: 'ArrowRight', modifiers },
        'web:macos': { code: 'ArrowRight', modifiers },
        'desktop:windows': { code: 'ArrowRight', modifiers },
        'desktop:macos': { code: 'ArrowRight', modifiers },
      },
      regions: ['page', 'editable', 'terminal'],
      modals: [],
      resolve: () => ({ status: 'handled', run: () => { void getController().next(false) } }),
    })
    register({
      id: SHORTCUT_PREV,
      label: () => '音乐：上一首',
      aliases: ['music previous', '上一首'],
      defaults: {
        'web:windows': { code: 'ArrowLeft', modifiers },
        'web:macos': { code: 'ArrowLeft', modifiers },
        'desktop:windows': { code: 'ArrowLeft', modifiers },
        'desktop:macos': { code: 'ArrowLeft', modifiers },
      },
      regions: ['page', 'editable', 'terminal'],
      modals: [],
      resolve: () => ({ status: 'handled', run: () => { void getController().previous() } }),
    })
  })
}
