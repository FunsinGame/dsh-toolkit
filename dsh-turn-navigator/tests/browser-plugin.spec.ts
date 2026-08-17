import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import { TurnNavigator } from '../src/client/TurnNavigator.tsx'

describe('standalone browser plugin wiring', () => {
  it('waits for the chat declaration and registers localized chrome', () => {
    const unregisterLocale = vi.fn()
    const unregisterSlot = vi.fn()
    const registerLocale = vi.fn(() => unregisterLocale)
    const registerSlot = vi.fn(() => unregisterSlot)
    const injectSlot = vi.fn((_name: string, install: () => unknown) => install())
    const effects: (() => unknown)[] = []
    const ctx = {
      effect: (install: () => unknown) => {
        effects.push(install)
        return install()
      },
      locale: { register: registerLocale },
      slots: { inject: injectSlot, register: registerSlot },
    }

    apply(ctx as never)
    expect(inject).toEqual(['slots', 'locale'])
    expect(effects).toHaveLength(1)
    expect(registerLocale).toHaveBeenCalledWith('turnNavigator', expect.any(Object))
    expect(injectSlot).toHaveBeenCalledWith('conversation.chat.navigator', expect.any(Function))
    expect(registerSlot).toHaveBeenCalledWith(
      { name: 'conversation.chat.navigator', locale: 'turnNavigator' },
      TurnNavigator,
    )
  })
})
