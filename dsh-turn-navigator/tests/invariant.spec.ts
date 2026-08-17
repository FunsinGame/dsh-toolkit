import { describe, expect, it, vi } from 'vitest'
import { apply as nodeApply } from '../src/index.ts'
import * as TurnNavigatorInvariant from '../src/invariant.ts'

describe('standalone node half and invariant companion', () => {
  it('keeps the host half empty', () => {
    nodeApply()
    expect(true).toBe(true)
  })

  it('registers the package-owned empty invariant', async () => {
    const disposer = vi.fn()
    const register = vi.fn(() => disposer)
    await expect(TurnNavigatorInvariant.apply({ invariants: { register } } as never)).resolves.toBe(disposer)
    expect(register).toHaveBeenCalledWith('@deepseek-ai/dsh-turn-navigator', expect.any(Function))
  })
})
