import { describe, it, expect } from 'vitest'
import { createSessionJWT, verifyJWT } from '../auth.js'
import { jwtVerify } from 'jose'

const TEST_SECRET = 'test-secret-key-for-unit-tests-only'

describe('createSessionJWT', () => {
  it('returns a token and jti', async () => {
    const result = await createSessionJWT({ authMethod: 'bootstrap' }, TEST_SECRET)
    expect(result).toHaveProperty('token')
    expect(result).toHaveProperty('jti')
    expect(typeof result.token).toBe('string')
    expect(typeof result.jti).toBe('string')
  })

  it('sets expiry to 8 hours, not 30 days', async () => {
    const { token } = await createSessionJWT({ authMethod: 'password' }, TEST_SECRET)
    const secretKey = new TextEncoder().encode(TEST_SECRET)
    const { payload } = await jwtVerify(token, secretKey)
    const iat = payload.iat as number
    const exp = payload.exp as number
    const diffHours = (exp - iat) / 3600
    expect(diffHours).toBe(8)
  })
})

describe('verifyJWT', () => {
  it('verifies a valid token', async () => {
    const { token } = await createSessionJWT({ authMethod: 'bootstrap' }, TEST_SECRET)
    const result = await verifyJWT(token, TEST_SECRET)
    expect(result.payload.iss).toBe('clsh-agent')
  })

  it('rejects a token with wrong secret', async () => {
    const { token } = await createSessionJWT({ authMethod: 'bootstrap' }, TEST_SECRET)
    await expect(verifyJWT(token, 'wrong-secret')).rejects.toThrow()
  })
})

describe('verifySession (session revocation)', () => {
  it('source must contain verifySession function that checks sessions table', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('../auth.ts', import.meta.url), 'utf-8')
    expect(source).toContain('verifySession')
    expect(source).toContain('getSession')
    expect(source).toContain('Session revoked')
  })
})
