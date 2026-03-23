import { describe, it, expect } from 'vitest'

describe('TerminalAccessoryBar', () => {
  it('exports the component', async () => {
    const mod = await import('../TerminalAccessoryBar')
    expect(mod.TerminalAccessoryBar).toBeDefined()
    expect(typeof mod.TerminalAccessoryBar).toBe('function')
  })
})
