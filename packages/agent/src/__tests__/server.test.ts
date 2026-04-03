import { describe, expect, it } from 'vitest'
import { updateAllowedOrigins } from '../server.js'

describe('server', () => {
  describe('updateAllowedOrigins', () => {
    it('does not throw when called with valid args', () => {
      expect(() => updateAllowedOrigins(4030)).not.toThrow()
    })
  })
})
