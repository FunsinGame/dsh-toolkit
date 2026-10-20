/**
 * dsh-notes browser entry.
 *
 * Contributes the left activity-bar glyph and the notes page. All data access
 * goes through the host's same-origin /dsh-notes routes; no remote token or
 * account credential ever reaches the page.
 */

import React from 'react'
import { NotesApp } from '../shared/ui/App.tsx'
import { ensureNotesStyles } from '../shared/ui/styles.ts'
import { NotesGlyph } from '../shared/ui/icons.tsx'
import { DshBackend } from './backend.ts'

const ACTIVITY_ID = 'notes'
const backend = new DshBackend()

interface ClientContext {
  effect: (factory: () => () => void, label?: string) => void
  inject: (deps: string[], callback: (child: ClientContext & Record<string, any>) => void) => void
  slots?: {
    inject: (slot: string, callback: () => unknown) => void
    register: (options: Record<string, unknown>, component: React.ComponentType<any>) => unknown
  }
  layout?: { selectActivity: (id: string) => void }
}

function ActivityGlyph({ size = 20, active = false }: { size?: number; active?: boolean }): React.ReactElement {
  return <NotesGlyph size={size} active={active} />
}

function NotesPage(): React.ReactElement {
  return <NotesApp backend={backend} brand="笔记" />
}

export function apply(ctx: ClientContext): void {
  ensureNotesStyles()
  ctx.inject(['slots'], (child) => {
    child.slots?.inject('shell.activitybar.items', () => child.slots?.register({
      name: 'shell.activitybar.items',
      id: ACTIVITY_ID,
      order: 110,
      label: () => '笔记',
    }, ActivityGlyph))
    child.slots?.inject('shell.activity', () => child.slots?.register({
      name: 'shell.activity',
      key: ACTIVITY_ID,
    }, NotesPage))
  })
}
