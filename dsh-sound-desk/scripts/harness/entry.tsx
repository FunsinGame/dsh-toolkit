/**
 * Standalone visual harness.
 *
 * Runs the real browser half — the same `apply()` DSH calls — against a mocked host
 * table, in a plain browser. Used to take the README screenshot and to eyeball the
 * workbench without installing anything.
 */

import React from 'react'
import { createRoot } from 'react-dom/client'

import { apply } from '../../src/client/index.tsx'
import { requestPlay } from '../../src/client/app/audio/playback.ts'
import { store } from '../../src/client/app/state/store.ts'
import { installMockHost } from './mock.ts'

installMockHost()

interface Registration {
  options: { name: string; inject?: () => unknown }
  component: React.ComponentType<any>
}

const registrations: Registration[] = []
const slots = {
  inject(_slot: string, callback: () => unknown) {
    callback()
  },
  register(options: Registration['options'], component: React.ComponentType<any>) {
    registrations.push({ options, component })
    return () => undefined
  },
}

const noop = () => undefined
const ctx = {
  effect(factory: () => unknown) {
    factory()
  },
  inject(deps: string[], callback: (child: unknown) => void) {
    if (deps.includes('slots')) {
      callback({
        slots,
        effect(factory: () => unknown) {
          factory()
        },
      })
      return
    }
    if (deps.includes('shortcuts')) {
      callback({
        shortcuts: { register: () => noop },
        effect(factory: () => unknown) {
          factory()
        },
      })
    }
  },
  layout: { selectActivity: noop },
}

apply(ctx as never)

const page = registrations.find((entry) => entry.options.name === 'shell.activity')
const glyph = registrations.find((entry) => entry.options.name === 'shell.activitybar.items')
if (page === undefined || glyph === undefined) throw new Error('harness: registrations missing')

const Glyph = glyph.component
const Page = page.component

const root = document.getElementById('root')
if (root === null) throw new Error('harness: #root missing')

function Harness(): React.ReactElement {
  return (
    <div className="harness-frame">
      <div className="harness-rail">
        <div className="harness-rail-item" title="会话">
          ◇
        </div>
        <div className="harness-rail-item harness-rail-active" title="音效工作台">
          <Glyph size={20} active />
        </div>
      </div>
      <div className="harness-page">
        <Page />
      </div>
    </div>
  )
}

createRoot(root).render(<Harness />)

// Give the page time to boot, then put a real query, a selection and a playing clip
// on screen so the image shows the workbench in use rather than on first paint.
window.setTimeout(() => {
  void (async () => {
    store.setQuery('金属门重重关上')
    await store.runSearch()
    const hits = store.getState().hits
    if (hits.length === 0) return
    await store.select(hits[0])
    // The mocked media routes serve a real WAV and peak container, so this renders the
    // same waveform a library file would. The first call often lands while the clip is
    // still decoding, so retry once the decode has settled.
    await requestPlay(hits[0].asset.id).catch(() => undefined)
    window.setTimeout(() => {
      void requestPlay(hits[0].asset.id).catch(() => undefined)
    }, 1400)
  })()
}, 900)
