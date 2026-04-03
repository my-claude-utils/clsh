import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CooldownManager } from '../notifications/cooldown.js'

describe('CooldownManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows first notification through', () => {
    const mgr = new CooldownManager(10)
    expect(mgr.shouldSend('session-1', 'error', 'ERROR: test')).toBe(true)
  })

  it('blocks rapid-fire notifications from same session', () => {
    const mgr = new CooldownManager(10)
    expect(mgr.shouldSend('session-1', 'error', 'ERROR: test')).toBe(true)
    expect(mgr.shouldSend('session-1', 'error', 'ERROR: test')).toBe(false)
  })

  it('allows notification after cooldown expires', () => {
    const mgr = new CooldownManager(10)
    expect(mgr.shouldSend('session-1', 'error', 'ERROR: test')).toBe(true)
    vi.advanceTimersByTime(11_000)
    expect(mgr.shouldSend('session-1', 'error', 'ERROR: test')).toBe(true)
  })

  it('permission triggers bypass normal cooldown but have a 2s rate limit', () => {
    const mgr = new CooldownManager(10)
    expect(mgr.shouldSend('session-1', 'error', 'ERROR: test')).toBe(true)
    // Permission bypasses the 10s cooldown from the error above
    expect(mgr.shouldSend('session-1', 'permission', 'Allow?')).toBe(true)
    // But a second permission within 2s is rate-limited
    expect(mgr.shouldSend('session-1', 'permission', 'Allow write?')).toBe(false)
    // After 2s it goes through again
    vi.advanceTimersByTime(2_100)
    expect(mgr.shouldSend('session-1', 'permission', 'Allow write?')).toBe(true)
  })

  it('errors bypass cooldown if text is different', () => {
    const mgr = new CooldownManager(10)
    expect(mgr.shouldSend('session-1', 'error', 'ERROR: first')).toBe(true)
    expect(mgr.shouldSend('session-1', 'error', 'ERROR: second')).toBe(true)
    // Same error again should be blocked
    expect(mgr.shouldSend('session-1', 'error', 'ERROR: second')).toBe(false)
  })

  it('tracks sessions independently', () => {
    const mgr = new CooldownManager(10)
    expect(mgr.shouldSend('session-1', 'error', 'ERROR: test')).toBe(true)
    expect(mgr.shouldSend('session-2', 'error', 'ERROR: test')).toBe(true)
  })

  it('custom patterns respect cooldown', () => {
    const mgr = new CooldownManager(10)
    expect(mgr.shouldSend('session-1', 'custom', 'NOTIFY: done')).toBe(true)
    expect(mgr.shouldSend('session-1', 'custom', 'NOTIFY: done again')).toBe(false)
  })
})
