import { describe, it, expect } from 'vitest'

describe('MacBookKeyboard', () => {
  it('module exports default', async () => {
    const mod = await import('./MacBookKeyboard')
    expect(mod).toBeDefined()
  })
})
