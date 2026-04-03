import { describe, it } from 'vitest'

describe('tunnel', () => {
  it('module exists', async () => {
    // Tunnel module depends on ngrok and network access; just verify it loads
    await import('../tunnel.js')
  })
})
