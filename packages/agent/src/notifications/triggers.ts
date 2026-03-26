import type { TriggerConfig, TriggerType } from './types.js'

/**
 * Strips ANSI escape sequences from a string.
 * Handles SGR, CSI, OSC, and other common terminal sequences.
 */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b(?:\][\s\S]*?(?:\x07|\x1b\\)|\[[\d;]*[A-Za-z]|[()][AB012]|\x1b)/g, '')
}

/**
 * Line-buffered accumulator that strips ANSI and emits complete lines.
 * Prevents false-matching across partial ANSI chunks.
 */
export class LineBuffer {
  private buffer = ''
  private callback: (line: string) => void

  constructor(callback: (line: string) => void) {
    this.callback = callback
  }

  feed(data: string): void {
    this.buffer += data

    let idx: number
    while ((idx = this.buffer.indexOf('\n')) !== -1) {
      const raw = this.buffer.substring(0, idx).replace(/\r$/, '')
      this.buffer = this.buffer.substring(idx + 1)
      if (raw === '') continue
      this.callback(stripAnsi(raw))
    }
  }
}

/** Result from trigger detection. */
export interface TriggerMatch {
  trigger: TriggerType
  label: string
  matched: string
}

// Permission prompt patterns that Claude Code emits
const PERMISSION_PATTERNS = [
  /Allow\s+\w+.*\?\s*\(Y\)es/i,
  /Allow\s+tool\s+use/i,
  /Do you want to proceed\?/i,
  /\(y\/n\)/i,
  /Allow\s+(Read|Write|Edit|Bash|Glob|Grep|WebFetch|WebSearch)/,
]

// Error patterns
const ERROR_PATTERNS = [
  /\bERROR\b/,
  /\bFAILED\b/,
  /\bFAIL\b\s/,
  /\berror:/,
  /\bError:/,
  /Traceback \(most recent call last\)/,
  /^\s*at\s+\S+\s+\(/, // stack trace line
  /✗|✘/, // test failure marks
]

/**
 * Analyzes a stripped line and returns a trigger match if one is found.
 * Priority: permissions > errors > custom > completion.
 * Returns null if no trigger matches.
 */
export function detectTrigger(line: string, config: TriggerConfig): TriggerMatch | null {
  // 1. Permission prompts (highest priority)
  if (config.permissions) {
    for (const pattern of PERMISSION_PATTERNS) {
      if (pattern.test(line)) {
        return {
          trigger: 'permission',
          label: 'Permission Required',
          matched: line.trim(),
        }
      }
    }
  }

  // 2. Error patterns
  if (config.errors) {
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.test(line)) {
        return {
          trigger: 'error',
          label: 'Error',
          matched: line.trim(),
        }
      }
    }
  }

  // 3. Custom patterns
  for (const custom of config.customPatterns) {
    try {
      const regex = new RegExp(custom.pattern)
      const match = regex.exec(line)
      if (match) {
        // Use captured group if available, otherwise the full match
        const matched = match[1] ?? match[0]
        return {
          trigger: 'custom',
          label: custom.label,
          matched: matched.trim(),
        }
      }
    } catch {
      // Invalid regex — skip silently
    }
  }

  // 4. Completion detection is handled at the session monitor level
  // (requires tracking idle state, not just single-line matching)

  return null
}
