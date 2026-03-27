import { describe, it, expect } from 'vitest'

describe('TerminalView', () => {
  it('exports the component', async () => {
    const mod = await import('../TerminalView')
    expect(mod.TerminalView).toBeDefined()
    expect(typeof mod.TerminalView).toBe('function')
  })
})
