import { stripAnsi } from './triggers.js'

/** Parsed cost data for a session. */
export interface SessionCost {
  /** Latest reported cost in dollars. */
  totalCost: number
  /** Latest reported token count, if available. */
  tokens: number | null
}

/**
 * Patterns for extracting cost information from Claude Code output.
 * Claude Code reports costs in various formats:
 * - "Total cost: $1.23"
 * - "Session cost: $0.45"
 * - "Cost: $0.12 | Tokens: 1,234"
 * - "$1.23 total" (in status lines)
 */
// More restrictive patterns to avoid false positives on code output.
// Only match lines that look like Claude Code status output, not arbitrary code.
const COST_PATTERNS = [
  /(?:Total\s+cost|Session\s+cost):\s*\$([0-9]+(?:\.[0-9]+)?)/i,
  /^\s*\$([0-9]+\.[0-9]{2})\s+(?:total|spent|used)\b/i,
]

const TOKEN_PATTERNS = [/^\s*([0-9,]+)\s+tokens?\s/i, /(?:Total|Session)\s+tokens?[:\s]+([0-9,]+)/i]

/**
 * Tracks cost information parsed from PTY output for a single session.
 */
export class CostTracker {
  private cost: SessionCost = { totalCost: 0, tokens: null }
  private hasCost = false

  /** Feed a stripped line and try to extract cost info. Returns true if cost changed. */
  feedLine(line: string): boolean {
    const stripped = stripAnsi(line)
    let changed = false

    for (const pattern of COST_PATTERNS) {
      const match = pattern.exec(stripped)
      if (match) {
        const cost = parseFloat(match[1])
        if (!isNaN(cost) && cost > 0) {
          // Use the highest cost seen (Claude reports running totals)
          if (cost >= this.cost.totalCost) {
            this.cost.totalCost = cost
            this.hasCost = true
            changed = true
          }
        }
      }
    }

    for (const pattern of TOKEN_PATTERNS) {
      const match = pattern.exec(stripped)
      if (match) {
        const tokens = parseInt(match[1].replace(/,/g, ''), 10)
        if (!isNaN(tokens) && tokens > 0) {
          this.cost.tokens = tokens
          changed = true
        }
      }
    }

    return changed
  }

  /** Returns current cost data, or null if no cost has been detected. */
  getCost(): SessionCost | null {
    return this.hasCost ? { ...this.cost } : null
  }
}
