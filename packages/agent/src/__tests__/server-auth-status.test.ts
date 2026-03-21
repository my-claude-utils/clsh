import { describe, it, expect } from 'vitest'

describe('Finding #1: Biometric auth disabled', () => {
  it('password/status response must not include credentialId or userId', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(
      new URL('../server.ts', import.meta.url),
      'utf-8',
    )
    const statusRouteMatch = source.match(
      /app\.get\('\/api\/auth\/password\/status'[\s\S]*?res\.json\(\{([\s\S]*?)\}\)/,
    )
    expect(statusRouteMatch).toBeTruthy()
    const responseBody = statusRouteMatch![1]
    expect(responseBody).not.toContain('credentialId')
    expect(responseBody).not.toContain('userId')
  })

  it('biometric login route must not exist', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(
      new URL('../server.ts', import.meta.url),
      'utf-8',
    )
    expect(source).not.toContain("'/api/auth/biometric'")
  })
})
