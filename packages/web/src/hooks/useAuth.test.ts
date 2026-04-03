import { describe, it, expect } from 'vitest'

describe('useAuth', () => {
  it('module exports useAuth hook', async () => {
    const mod = await import('./useAuth')
    expect(typeof mod.useAuth).toBe('function')
  })
})
