import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SessionMonitor } from '../notifications/session-monitor.js'
import { CooldownManager } from '../notifications/cooldown.js'
import type { NotificationConfig } from '../notifications/types.js'

// Mock the channels module so we can observe notifications without HTTP calls
vi.mock('../notifications/channels.js', () => ({
  sendToAllChannels: vi.fn(),
}))

import { sendToAllChannels } from '../notifications/channels.js'

const mockSend = vi.mocked(sendToAllChannels)

function makeConfig(overrides?: Partial<NotificationConfig>): NotificationConfig {
  return {
    enabled: true,
    channels: [{ type: 'ntfy', topic: 'test' }],
    triggers: {
      permissions: true,
      completion: true,
      errors: true,
      sessionEvents: true,
      customPatterns: [{ pattern: 'NOTIFY:\\s*(.+)', label: 'Claude' }],
    },
    cooldown: 10,
    ...overrides,
  }
}

describe('SessionMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockSend.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('detects permission prompts in PTY output', () => {
    const config = makeConfig()
    const cooldown = new CooldownManager(config.cooldown)
    const monitor = new SessionMonitor('s1', 'test', config, cooldown)

    monitor.feed('  Allow Read to src/index.ts? (Y)es | (N)o | (A)lways\n')

    expect(mockSend).toHaveBeenCalledOnce()
    const payload = mockSend.mock.calls[0][1]
    expect(payload.trigger).toBe('permission')
  })

  it('detects errors in PTY output', () => {
    const config = makeConfig()
    const cooldown = new CooldownManager(config.cooldown)
    const monitor = new SessionMonitor('s1', 'test', config, cooldown)

    monitor.feed('ERROR: Build failed\n')

    expect(mockSend).toHaveBeenCalledOnce()
    expect(mockSend.mock.calls[0][1].trigger).toBe('error')
  })

  it('detects custom NOTIFY pattern', () => {
    const config = makeConfig()
    const cooldown = new CooldownManager(config.cooldown)
    const monitor = new SessionMonitor('s1', 'test', config, cooldown)

    monitor.feed('NOTIFY: migration complete\n')

    expect(mockSend).toHaveBeenCalledOnce()
    expect(mockSend.mock.calls[0][1].trigger).toBe('custom')
    expect(mockSend.mock.calls[0][1].matched).toContain('migration complete')
  })

  it('fires completion after idle timeout', () => {
    const config = makeConfig()
    const cooldown = new CooldownManager(config.cooldown)
    const monitor = new SessionMonitor('s1', 'test', config, cooldown)

    monitor.feed('some output\n')
    expect(mockSend).not.toHaveBeenCalled()

    // Advance past the 15s completion idle threshold
    vi.advanceTimersByTime(16_000)

    expect(mockSend).toHaveBeenCalledOnce()
    expect(mockSend.mock.calls[0][1].trigger).toBe('completion')
  })

  it('does NOT fire completion if new output arrives', () => {
    const config = makeConfig()
    const cooldown = new CooldownManager(config.cooldown)
    const monitor = new SessionMonitor('s1', 'test', config, cooldown)

    monitor.feed('output 1\n')
    vi.advanceTimersByTime(10_000) // Not yet at 15s
    monitor.feed('output 2\n') // Resets the timer
    vi.advanceTimersByTime(10_000) // 10s after second output

    // No completion should have fired yet
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('does not send when disabled', () => {
    const config = makeConfig({ enabled: false })
    const cooldown = new CooldownManager(config.cooldown)
    const monitor = new SessionMonitor('s1', 'test', config, cooldown)

    monitor.feed('ERROR: something\n')
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('handles session events', () => {
    const config = makeConfig()
    const cooldown = new CooldownManager(config.cooldown)
    const monitor = new SessionMonitor('s1', 'test', config, cooldown)

    monitor.notifySessionEvent('crash', 'exit code 1')
    expect(mockSend).toHaveBeenCalledOnce()
    expect(mockSend.mock.calls[0][1].trigger).toBe('session')
  })

  it('respects cooldown between notifications', () => {
    const config = makeConfig()
    const cooldown = new CooldownManager(config.cooldown)
    const monitor = new SessionMonitor('s1', 'test', config, cooldown)

    monitor.feed('ERROR: first\n')
    monitor.feed('ERROR: first\n') // Same error text — should be blocked by cooldown

    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it('cleans up timers on dispose', () => {
    const config = makeConfig()
    const cooldown = new CooldownManager(config.cooldown)
    const monitor = new SessionMonitor('s1', 'test', config, cooldown)

    monitor.feed('some output\n')
    monitor.dispose()

    vi.advanceTimersByTime(20_000)
    // Should NOT have fired completion after dispose
    expect(mockSend).not.toHaveBeenCalled()
  })
})
