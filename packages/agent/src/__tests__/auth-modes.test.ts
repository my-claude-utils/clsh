import { describe, it, expect } from 'vitest'
import type { AuthConfig } from '../auth-config.js'
import { resolveAuthMode, shouldSkipBootstrap, shouldTrustConnection } from '../auth-config.js'

describe('resolveAuthMode', () => {
  it('defaults to bootstrap mode when no config', () => {
    const result = resolveAuthMode(undefined)
    expect(result.mode).toBe('bootstrap')
  })

  it('returns tailscale mode when configured', () => {
    const config: AuthConfig = { mode: 'tailscale' }
    const result = resolveAuthMode(config)
    expect(result.mode).toBe('tailscale')
  })

  it('returns persistent mode when configured', () => {
    const config: AuthConfig = { mode: 'persistent', token: 'my-secret' }
    const result = resolveAuthMode(config)
    expect(result.mode).toBe('persistent')
    expect(result.token).toBe('my-secret')
  })

  it('falls back to bootstrap when persistent has no token', () => {
    const config: AuthConfig = { mode: 'persistent' }
    const result = resolveAuthMode(config)
    expect(result.mode).toBe('bootstrap')
  })
})

describe('shouldSkipBootstrap', () => {
  it('returns true for tailscale mode', () => {
    expect(shouldSkipBootstrap({ mode: 'tailscale' })).toBe(true)
  })

  it('returns true for persistent mode', () => {
    expect(shouldSkipBootstrap({ mode: 'persistent', token: 'x' })).toBe(true)
  })

  it('returns false for bootstrap mode', () => {
    expect(shouldSkipBootstrap({ mode: 'bootstrap' })).toBe(false)
  })
})

describe('shouldTrustConnection', () => {
  it('returns true for tailscale mode', () => {
    expect(shouldTrustConnection({ mode: 'tailscale' })).toBe(true)
  })

  it('returns false for other modes', () => {
    expect(shouldTrustConnection({ mode: 'bootstrap' })).toBe(false)
    expect(shouldTrustConnection({ mode: 'persistent', token: 'x' })).toBe(false)
  })
})
