import type { NotificationConfig } from './types.js'
import { SessionMonitor } from './session-monitor.js'
import { CooldownManager } from './cooldown.js'

/**
 * Top-level notification manager. Creates per-session monitors and provides
 * a passive tap interface for PTY data events.
 */
export class NotificationManager {
  private config: NotificationConfig
  private cooldown: CooldownManager
  private monitors = new Map<string, SessionMonitor>()

  constructor(config: NotificationConfig) {
    this.config = config
    this.cooldown = new CooldownManager(config.cooldown)
  }

  /** Whether notifications are enabled and have at least one channel. */
  get active(): boolean {
    return this.config.enabled && this.config.channels.length > 0
  }

  /** Register a new session for monitoring. */
  addSession(sessionId: string, sessionName: string): void {
    if (!this.active) return
    const monitor = new SessionMonitor(sessionId, sessionName, this.config, this.cooldown)
    this.monitors.set(sessionId, monitor)
  }

  /** Remove a session (on close or exit). */
  removeSession(sessionId: string): void {
    const monitor = this.monitors.get(sessionId)
    if (monitor) {
      monitor.dispose()
      this.monitors.delete(sessionId)
    }
  }

  /** Feed PTY output data to a session's monitor. Fire-and-forget. */
  feedData(sessionId: string, data: string): void {
    this.monitors.get(sessionId)?.feed(data)
  }

  /** Update a session's display name. */
  updateSessionName(sessionId: string, name: string): void {
    this.monitors.get(sessionId)?.updateName(name)
  }

  /** Notify about a session event (disconnect, crash, etc.). */
  notifySessionEvent(
    sessionId: string,
    event: 'disconnect' | 'reconnect' | 'crash',
    detail?: string,
  ): void {
    this.monitors.get(sessionId)?.notifySessionEvent(event, detail)
  }

  /** Clean up all monitors. */
  dispose(): void {
    for (const monitor of this.monitors.values()) {
      monitor.dispose()
    }
    this.monitors.clear()
  }

  /** Print startup status to console. */
  printStatus(): void {
    const o = '\x1b[38;5;208m'
    const dim = '\x1b[2m'
    const r = '\x1b[0m'

    if (!this.config.enabled) {
      return
    }

    if (this.config.channels.length === 0) {
      console.log(`${o}  Notifications:${r} enabled but no channels configured`)
      console.log(`${dim}  Add channels to ~/.clsh/config.json under "notifications.channels"${r}`)
      return
    }

    const channelNames = this.config.channels.map((c) => c.type).join(', ')
    const triggerCount =
      [
        this.config.triggers.permissions && 'permissions',
        this.config.triggers.completion && 'completion',
        this.config.triggers.errors && 'errors',
        this.config.triggers.sessionEvents && 'session events',
      ].filter(Boolean).length + this.config.triggers.customPatterns.length

    console.log(
      `${o}  Notifications:${r} ${channelNames} ${dim}(${String(triggerCount)} triggers)${r}`,
    )
  }
}
