import type {
  CompiledPattern,
  NotificationConfig,
  NotificationPayload,
  TriggerType,
} from './types.js'
import { LineBuffer, compileCustomPatterns, detectTrigger } from './triggers.js'
import { sendToAllChannels } from './channels.js'
import { CooldownManager } from './cooldown.js'

/**
 * Monitors a single PTY session's output for notification triggers.
 * Buffers output into complete lines, strips ANSI, and pattern-matches.
 */
export class SessionMonitor {
  private lineBuffer: LineBuffer
  private config: NotificationConfig
  private cooldown: CooldownManager
  private sessionId: string
  private sessionName: string
  private onNotify: ((payload: NotificationPayload) => void) | null
  private compiledPatterns: CompiledPattern[]

  /** Timestamp of last PTY output — used for completion detection. */
  private lastOutputAt = 0
  /** Whether we've already sent a completion notification for the current idle period. */
  private completionSent = false
  /** Timer for idle-based completion detection. */
  private completionTimer: ReturnType<typeof setTimeout> | null = null

  /** Time without output before considering Claude "idle/done" (15 seconds).
   *  Longer than typical thinking pauses to avoid false positives. */
  private static readonly COMPLETION_IDLE_MS = 15_000

  constructor(
    sessionId: string,
    sessionName: string,
    config: NotificationConfig,
    cooldown: CooldownManager,
    onNotify?: (payload: NotificationPayload) => void,
  ) {
    this.sessionId = sessionId
    this.sessionName = sessionName
    this.config = config
    this.cooldown = cooldown
    this.onNotify = onNotify ?? null
    this.compiledPatterns = compileCustomPatterns(config.triggers.customPatterns)

    this.lineBuffer = new LineBuffer((line) => {
      this.processLine(line)
    })
  }

  /** Feed raw PTY output data into this monitor. */
  feed(data: string): void {
    this.lastOutputAt = Date.now()
    this.completionSent = false
    this.lineBuffer.feed(data)

    // Reset completion timer on new output
    if (this.config.triggers.completion) {
      if (this.completionTimer) clearTimeout(this.completionTimer)
      this.completionTimer = setTimeout(() => {
        this.checkCompletion()
      }, SessionMonitor.COMPLETION_IDLE_MS)
    }
  }

  /** Update the session name (for notification messages). */
  updateName(name: string): void {
    this.sessionName = name
  }

  /** Notify about session events (disconnect, crash). */
  notifySessionEvent(event: 'disconnect' | 'reconnect' | 'crash', detail?: string): void {
    if (!this.config.enabled || !this.config.triggers.sessionEvents) return

    const labels: Record<string, string> = {
      disconnect: 'Session Disconnected',
      reconnect: 'Session Reconnected',
      crash: 'Session Crashed',
    }

    this.sendNotification('session', labels[event] ?? event, detail ?? event)
  }

  /** Clean up timers. */
  dispose(): void {
    if (this.completionTimer) {
      clearTimeout(this.completionTimer)
      this.completionTimer = null
    }
    this.cooldown.clear(this.sessionId)
  }

  private processLine(line: string): void {
    if (!this.config.enabled) return

    const match = detectTrigger(line, this.config.triggers, this.compiledPatterns)
    if (!match) return

    if (this.cooldown.shouldSend(this.sessionId, match.trigger, match.matched)) {
      this.sendNotification(match.trigger, match.label, match.matched)
    }
  }

  private checkCompletion(): void {
    if (this.completionSent) return
    if (Date.now() - this.lastOutputAt < SessionMonitor.COMPLETION_IDLE_MS) return

    this.completionSent = true

    if (this.cooldown.shouldSend(this.sessionId, 'completion', 'Task completed')) {
      this.sendNotification(
        'completion',
        'Task Complete',
        'Claude has finished and is waiting for input',
      )
    }
  }

  private sendNotification(trigger: TriggerType, label: string, matched: string): void {
    const payload: NotificationPayload = {
      session: this.sessionName,
      trigger,
      label,
      matched,
      timestamp: new Date().toISOString(),
    }
    if (this.config.channels.length > 0) {
      sendToAllChannels(this.config.channels, payload)
    }
    this.onNotify?.(payload)
  }
}
