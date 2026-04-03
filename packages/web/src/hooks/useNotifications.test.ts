import { describe, it, expect } from 'vitest'

describe('useNotifications', () => {
  it('module exports hook', async () => {
    const mod = await import('./useNotifications')
    expect(typeof mod.useNotifications).toBe('function')
  })
})
