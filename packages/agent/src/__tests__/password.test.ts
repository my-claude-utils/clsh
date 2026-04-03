import { describe, it, expect } from 'vitest'
import { scryptSync, randomBytes } from 'node:crypto'
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

describe('scrypt N upgrade (Finding #17)', () => {
  it('new hashes use format scrypt:<N>$salt$key', () => {
    const hash = hashPassword('test-password-123')
    expect(hash).toMatch(/^scrypt:\d+\$[0-9a-f]+\$[0-9a-f]+$/)
  })

  it('new hashes use N=131072', () => {
    const hash = hashPassword('test-password-123')
    const n = parseInt(hash.split('$')[0].split(':')[1], 10)
    expect(n).toBe(131072)
  })

  it('still verifies legacy format (scrypt$salt$key with N=16384)', () => {
    // Simulate a legacy hash by creating one with old format
    // Legacy format: scrypt$<hexSalt>$<hexKey> with N=16384
    const password = 'legacy-test-password'
    const salt = randomBytes(16)
    const key = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })
    const legacyHash = `scrypt$${salt.toString('hex')}$${key.toString('hex')}`

    expect(verifyPassword(password, legacyHash)).toBe(true)
    expect(verifyPassword('wrong-password!!!', legacyHash)).toBe(false)
  })
})
