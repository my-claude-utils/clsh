import type { NotificationConfig, NotificationPayload } from './types.js'
import { SessionMonitor } from './session-monitor.js'
import { CooldownManager } from './cooldown.js'
import { ORANGE, DIM, RESET } from '../ansi.js'

type NotificationListener = (sessionId: string, payload: NotificationPayload) => void

/**
 * Top-level notification manager. Creates per-session monitors and provides
 * a passive tap interface for PTY data events.
 */
export class NotificationManager {
  private config: NotificationConfig
  private cooldown: CooldownManager
  private monitors = new Map<string, SessionMonitor>()
  private listeners: NotificationListener[] = []

  constructor(config: NotificationConfig) {
    this.config = config
    this.cooldown = new CooldownManager(config.cooldown)
  }

  /** Whether notifications are enabled. */
  get active(): boolean {
    return this.config.enabled
  }

  /**
   * Subscribe to in-app notifications. Returns a dispose function.
   * The callback fires for every notification from any session.
   */
  onNotification(callback: NotificationListener): () => void {
    this.listeners.push(callback)
    return () => {
      const idx = this.listeners.indexOf(callback)
      if (idx !== -1) this.listeners.splice(idx, 1)
    }
  }

  /** Register a new session for monitoring. */
  addSession(sessionId: string, sessionName: string): void {
    if (!this.active) return
    const onNotify = (payload: NotificationPayload) => {
      for (const listener of this.listeners) {
        listener(sessionId, payload)
      }
    }
    const monitor = new SessionMonitor(sessionId, sessionName, this.config, this.cooldown, onNotify)
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

  /** Clean up all monitors and listeners. */
  dispose(): void {
    for (const monitor of this.monitors.values()) {
      monitor.dispose()
    }
    this.monitors.clear()
    this.listeners.length = 0
  }

  /** Print startup status to console. */
  printStatus(): void {
    const o = ORANGE
    const dim = DIM
    const r = RESET

    if (!this.config.enabled) {
      return
    }

    const channelNames =
      this.config.channels.length > 0
        ? this.config.channels.map((c) => c.type).join(', ')
        : 'in-app'
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
