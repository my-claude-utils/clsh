import { describe, it } from 'vitest'

describe('notifications/manager', () => {
  it('module exists', async () => {
    await import('./manager.js')
  })
})
