// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  ConversationSnapshot, SessionId, UserMessageNode,
} from '@deepseek-ai/dsh-client-runtime/client'
import {
  activeTurnSeq, messagePreview, MIN_TURNS, rowForTurn, TurnNavigator, userRows,
  type TurnNavigatorProps, type TurnMarker,
} from '../src/client/TurnNavigator.tsx'
import { en } from '../src/client/locales.ts'

const SID = 'turn-navigation-test' as SessionId

function translate(dictionary: Record<string, string>) {
  return (key: string, values: Record<string, string | number> = {}): string => {
    let text = dictionary[key] ?? key
    for (const [name, value] of Object.entries(values)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
    return text
  }
}

function user(seq: number, text: string, extra: readonly unknown[] = []): UserMessageNode {
  return {
    kind: 'user', seq, time: seq * 1_000, source: { kind: 'user' },
    content: [{ type: 'text', text }, ...extra] as never,
  }
}

function snapshot(
  nodes: readonly UserMessageNode[],
  overrides: Partial<ConversationSnapshot> = {},
): ConversationSnapshot {
  return {
    sessionId: SID, nodes, turnTimings: new Map(), turnEnds: new Map(), partial: null,
    runningCalls: [], codeDispatches: new Map(), pending: [], queue: [], running: false,
    composerPhase: 'active', removed: false, openState: 'open', openError: null,
    hasMore: false, loadingOlder: false, promptError: null, blank: false,
    subagent: null, lastAgentError: null,
    ...overrides,
  }
}

interface Harness {
  readonly view: ReturnType<typeof render>
  readonly host: HTMLDivElement
  readonly frames: FrameRequestCallback[]
  readonly cancelFrame: ReturnType<typeof vi.fn>
  readonly loadOlder: ReturnType<typeof vi.fn>
}

function mount(
  nodes: readonly UserMessageNode[],
  overrides: Partial<ConversationSnapshot> = {},
): Harness {
  const current = snapshot(nodes, overrides)
  const loadOlder = vi.fn()
  const props = {
    useSession: <T,>(selector: (value: ConversationSnapshot) => T): T => selector(current),
    loadOlder,
    t: translate(en),
  } as unknown as TurnNavigatorProps
  const frames: FrameRequestCallback[] = []
  let frameId = 0
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    frames.push(callback)
    frameId += 1
    return frameId
  }))
  const cancelFrame = vi.fn()
  vi.stubGlobal('cancelAnimationFrame', cancelFrame)
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))

  const view = render(
    <div data-conversation-scroll="">
      <div data-composer-seat="" />
      {nodes.map(node => (
        <div key={node.seq} data-chat-flow-kind="user" />
      ))}
      <TurnNavigator {...props} />
    </div>,
  )
  const host = view.container.querySelector<HTMLDivElement>('[data-conversation-scroll]')!
  Object.defineProperties(host, {
    scrollHeight: { value: 900, configurable: true },
    clientHeight: { value: 300, configurable: true },
    scrollTop: { value: 600, writable: true, configurable: true },
  })
  vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 300 } as DOMRect)
  vi.spyOn(host.querySelector<HTMLElement>('[data-composer-seat]')!, 'getBoundingClientRect')
    .mockReturnValue({ top: 250, bottom: 300 } as DOMRect)
  const rowTops = [0, 260, 520]
  nodes.forEach((node, index) => {
    const row = rowForTurn(host, index)!
    vi.spyOn(row, 'getBoundingClientRect').mockImplementation(() => {
      const top = (rowTops[index] ?? index * 260) - host.scrollTop
      return { top, bottom: top + 80 } as DOMRect
    })
  })
  act(() => { window.dispatchEvent(new Event('resize')) })
  return { view, host, frames, cancelFrame, loadOlder }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('turn projection helpers', () => {
  it('normalizes text blocks and ignores non-text content', () => {
    expect(messagePreview(user(1, '  line one\n line   two  ', [{ type: 'image', url: 'x' }]).content))
      .toBe('line one line two')
    expect(messagePreview(user(2, '', [{ type: 'image', url: 'x' }]).content)).toBe('')
  })

  it('finds user rows positionally and resolves the reading line, bottom, and missing-row fallback', () => {
    const host = document.createElement('div')
    const composer = document.createElement('div')
    composer.dataset.composerSeat = ''
    host.append(composer)
    const turns: TurnMarker[] = [1, 2, 3].map(seq => ({ seq, preview: String(seq) }))
    for (const [index, turn] of turns.entries()) {
      const row = document.createElement('div')
      row.dataset.chatFlowKind = 'user'
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
        top: index * 140, bottom: index * 140 + 80,
      } as DOMRect)
      host.append(row)
    }
    Object.defineProperties(host, {
      scrollHeight: { value: 1_000, configurable: true },
      clientHeight: { value: 300, configurable: true },
      scrollTop: { value: 0, writable: true, configurable: true },
    })
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 300 } as DOMRect)
    vi.spyOn(composer, 'getBoundingClientRect').mockReturnValue({ top: 250, bottom: 300 } as DOMRect)
    expect(activeTurnSeq(host, [])).toBeNull()
    expect(userRows(host)).toHaveLength(3)
    expect(rowForTurn(host, 1)?.dataset.chatFlowKind).toBe('user')
    expect(rowForTurn(host, 99)).toBeNull()
    expect(activeTurnSeq(host, turns)).toBe(1)
    host.scrollTop = 1
    expect(activeTurnSeq(host, turns)).toBe(1)
    host.scrollTop = 700
    expect(activeTurnSeq(host, turns)).toBe(3)
    Object.defineProperties(host, {
      scrollHeight: { value: 200, configurable: true },
      clientHeight: { value: 300, configurable: true },
      scrollTop: { value: 0, writable: true, configurable: true },
    })
    expect(activeTurnSeq(host, turns)).toBe(3)
    host.querySelectorAll('[data-chat-flow-kind="user"]').forEach((row) => { row.remove() })
    host.scrollTop = 100
    expect(activeTurnSeq(host, turns)).toBe(3)
    composer.remove()
    expect(activeTurnSeq(host, turns)).toBe(3)
  })
})

describe('standalone TurnNavigator', () => {
  it('stays absent below three user turns', () => {
    const h = mount([user(1, 'one'), user(2, 'two')])
    expect(MIN_TURNS).toBe(3)
    expect(h.view.container.querySelector('[data-turn-navigator]')).toBeNull()
  })

  it('loads older pages to resolve the three-turn threshold without duplicate requests', () => {
    const loading = mount([user(2, 'two')], { hasMore: true, loadingOlder: true })
    expect(loading.loadOlder).not.toHaveBeenCalled()

    const ready = mount([user(2, 'two')], { hasMore: true })
    expect(ready.loadOlder).toHaveBeenCalledTimes(1)
    expect(ready.view.container.querySelector('[data-turn-navigator]')).toBeNull()

    const unopened = mount([user(2, 'two')], { hasMore: true, openState: 'loading' })
    expect(unopened.loadOlder).not.toHaveBeenCalled()
  })

  it('renders one marker per turn and previews first, middle, last, and empty content on hover or focus', () => {
    const h = mount([user(1, 'first\n  prompt'), user(2, ''), user(3, 'last prompt')])
    const nav = h.view.getByRole('navigation', { name: 'Conversation turn navigation' })
    const markers = h.view.getAllByRole('button')
    expect(markers).toHaveLength(3)
    expect(markers[2]?.getAttribute('aria-current')).toBe('step')

    fireEvent.mouseEnter(markers[0]!)
    expect(h.view.getByText('Turn 1')).toBeTruthy()
    expect(h.view.getByText('first prompt')).toBeTruthy()
    expect(nav.querySelector('[data-edge="first"]')).not.toBeNull()
    fireEvent.mouseLeave(markers[0]!)
    expect(h.view.queryByText('Turn 1')).toBeNull()

    fireEvent.focus(markers[1]!)
    expect(h.view.getByText('(No content)')).toBeTruthy()
    expect(nav.querySelector('[data-edge="middle"]')).not.toBeNull()
    fireEvent.blur(markers[1]!)
    fireEvent.mouseEnter(markers[2]!)
    expect(nav.querySelector('[data-edge="last"]')).not.toBeNull()
  })

  it('coalesces scroll and resize work, then highlights the turn crossing the reading line', () => {
    const h = mount([user(1, 'one'), user(2, 'two'), user(3, 'three')])
    h.host.scrollTop = 200
    act(() => {
      h.host.dispatchEvent(new Event('scroll'))
      h.host.dispatchEvent(new Event('scroll'))
      window.dispatchEvent(new Event('resize'))
    })
    expect(h.frames).toHaveLength(1)
    act(() => { h.frames.shift()!(0) })
    const second = h.view.getByRole('button', { name: /Jump to turn 2:/ })
    expect(second.getAttribute('aria-current')).toBe('step')

    h.view.unmount()
    expect(h.cancelFrame).not.toHaveBeenCalled()

    const pending = mount([user(1, 'one'), user(2, 'two'), user(3, 'three')])
    act(() => { pending.host.dispatchEvent(new Event('scroll')) })
    pending.view.unmount()
    expect(pending.cancelFrame).toHaveBeenCalledTimes(1)
  })

  it('jumps directly and ignores a missing row', () => {
    const h = mount([user(1, 'one'), user(2, 'two'), user(3, 'three')])
    const wheel = vi.fn()
    h.host.addEventListener('wheel', wheel)
    const first = h.view.getByRole('button', { name: /Jump to turn 1:/ })
    const second = h.view.getByRole('button', { name: /Jump to turn 2:/ })
    const third = h.view.getByRole('button', { name: /Jump to turn 3:/ })

    fireEvent.click(first)
    expect(h.host.scrollTop).toBe(0)
    expect(wheel).toHaveBeenCalledTimes(1)
    expect(first.getAttribute('aria-current')).toBe('step')

    fireEvent.click(second)
    expect(h.host.scrollTop).toBe(260)

    rowForTurn(h.host, 2)?.remove()
    fireEvent.click(third)
    expect(h.host.scrollTop).toBe(260)
  })

  it('keeps its markers inert when mounted outside the conversation scroll owner', () => {
    const current = snapshot([user(1, 'one'), user(2, 'two'), user(3, 'three')])
    const props = {
      useSession: <T,>(selector: (value: ConversationSnapshot) => T): T => selector(current),
      loadOlder: vi.fn(),
      t: translate(en),
    } as unknown as TurnNavigatorProps
    const view = render(<TurnNavigator {...props} />)
    expect(view.getAllByRole('button')).toHaveLength(3)
    expect(() => { fireEvent.click(view.getAllByRole('button')[0]!) }).not.toThrow()
  })
})
