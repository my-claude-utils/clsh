import { describe, it, expect } from 'vitest'

describe('useSessionManager', () => {
  it('module exports useSessionManager hook', async () => {
    const mod = await import('./useSessionManager')
    expect(typeof mod.useSessionManager).toBe('function')
  })
})
