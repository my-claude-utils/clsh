import { describe, it, expect } from 'vitest'

describe('useNativeKeyboard', () => {
  it('exports the hook', async () => {
    const mod = await import('../useNativeKeyboard')
    expect(mod.useNativeKeyboard).toBeDefined()
    expect(typeof mod.useNativeKeyboard).toBe('function')
  })
})
