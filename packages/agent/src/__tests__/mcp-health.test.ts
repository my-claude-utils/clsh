import { describe, it } from 'vitest'

describe('mcp-health', () => {
  it('module exists', async () => {
    await import('../mcp-health.js')
  })
})
