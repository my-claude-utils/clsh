import type { TriggerType } from './types.js'

interface CooldownEntry {
  lastSentAt: number
  lastErrorText: string
}

/**
 * Manages notification cooldown per session.
 *
 * Rules:
 * - Permission triggers ALWAYS bypass cooldown
 * - Error triggers bypass cooldown if the error text is different
 * - All other triggers respect cooldown
 */
export class CooldownManager {
  private entries = new Map<string, CooldownEntry>()
  private cooldownMs: number

  constructor(cooldownSeconds: number) {
    this.cooldownMs = cooldownSeconds * 1000
  }

  /**
   * Returns true if a notification should be sent (not suppressed by cooldown).
   * Records the send timestamp if allowed.
   */
  shouldSend(sessionId: string, trigger: TriggerType, matchedText: string): boolean {
    // Permissions always go through
    if (trigger === 'permission') {
      this.record(sessionId, matchedText)
      return true
    }

    const entry = this.entries.get(sessionId)
    const now = Date.now()

    if (!entry) {
      this.record(sessionId, matchedText)
      return true
    }

    // Errors bypass cooldown if text differs
    if (trigger === 'error' && matchedText !== entry.lastErrorText) {
      this.record(sessionId, matchedText)
      return true
    }

    // Cooldown check
    if (now - entry.lastSentAt >= this.cooldownMs) {
      this.record(sessionId, matchedText)
      return true
    }

    return false
  }

  private record(sessionId: string, text: string): void {
    this.entries.set(sessionId, {
      lastSentAt: Date.now(),
      lastErrorText: text,
    })
  }

  /** Clears cooldown state for a session (e.g., on session close). */
  clear(sessionId: string): void {
    this.entries.delete(sessionId)
  }
}
