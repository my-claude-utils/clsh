import { describe, it, expect, vi, afterEach } from 'vitest'
import { relativeTime } from '../relative-time'

describe('relativeTime', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "just now" for timestamps within 60 seconds', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T12:00:00Z'))
    const now = Date.now()
    expect(relativeTime(now)).toBe('just now')
    expect(relativeTime(now - 30_000)).toBe('just now')
    expect(relativeTime(now - 59_000)).toBe('just now')
  })

  it('returns minutes for timestamps 1-59 minutes ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T12:00:00Z'))
    const now = Date.now()
    expect(relativeTime(now - 60_000)).toBe('1m ago')
    expect(relativeTime(now - 90_000)).toBe('1m ago')
    expect(relativeTime(now - 3_540_000)).toBe('59m ago')
  })

  it('returns hours for timestamps 1-23 hours ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T12:00:00Z'))
    const now = Date.now()
    expect(relativeTime(now - 3_600_000)).toBe('1h ago')
    expect(relativeTime(now - 7_200_000)).toBe('2h ago')
  })

  it('returns days for timestamps 1+ days ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T12:00:00Z'))
    const now = Date.now()
    expect(relativeTime(now - 86_400_000)).toBe('1d ago')
    expect(relativeTime(now - 86_400_000 * 3)).toBe('3d ago')
  })

  it('handles epoch 0 gracefully', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T12:00:00Z'))
    // epoch 0 is decades ago — should return days
    const result = relativeTime(0)
    expect(result).toMatch(/\d+d ago/)
  })
})
