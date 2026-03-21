import { describe, it, expect } from 'vitest'
import { MIN_PASSWORD_LENGTH, hashPassword, verifyPassword } from '../password.js'

describe('MIN_PASSWORD_LENGTH (Finding #16)', () => {
  it('is at least 12 for internet-facing shell access', () => {
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(12)
  })
})

describe('hashPassword + verifyPassword', () => {
  it('round-trips correctly', () => {
    const password = 'a-secure-test-password-123'
    const hash = hashPassword(password)
    expect(verifyPassword(password, hash)).toBe(true)
  })

  it('rejects wrong password', () => {
    const hash = hashPassword('correct-password-12345')
    expect(verifyPassword('wrong-password-12345', hash)).toBe(false)
  })

  it('rejects garbage hash', () => {
    expect(verifyPassword('anything', 'not-a-valid-hash')).toBe(false)
  })
})
