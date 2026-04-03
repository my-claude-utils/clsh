import { describe, it, expect } from 'vitest'

describe('IOSKeyboard', () => {
  it('module exports default', async () => {
    const mod = await import('./IOSKeyboard')
    expect(mod).toBeDefined()
  })
})
