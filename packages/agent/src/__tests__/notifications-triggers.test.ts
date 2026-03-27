import { describe, it, expect } from 'vitest'
import { stripAnsi, LineBuffer, detectTrigger } from '../notifications/triggers.js'
import type { TriggerConfig } from '../notifications/types.js'

const defaultTriggers: TriggerConfig = {
  permissions: true,
  completion: true,
  errors: true,
  sessionEvents: true,
  customPatterns: [
    { pattern: 'NOTIFY:\\s*(.+)', label: 'Claude' },
    { pattern: '✓ All tests passed', label: 'Tests' },
  ],
}

describe('stripAnsi', () => {
  it('removes SGR color codes', () => {
    expect(stripAnsi('\x1b[31mERROR\x1b[0m')).toBe('ERROR')
  })

  it('removes cursor movement sequences', () => {
    expect(stripAnsi('\x1b[2K\x1b[1Ghello')).toBe('hello')
  })

  it('removes OSC sequences', () => {
    expect(stripAnsi('\x1b]7;file:///home/user\x07world')).toBe('world')
  })

  it('passes through plain text unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world')
  })

  it('handles empty string', () => {
    expect(stripAnsi('')).toBe('')
  })
})

describe('LineBuffer', () => {
  it('emits complete lines', () => {
    const lines: string[] = []
    const buf = new LineBuffer((line) => lines.push(line))
    buf.feed('hello\nworld\n')
    expect(lines).toEqual(['hello', 'world'])
  })

  it('buffers partial lines until newline', () => {
    const lines: string[] = []
    const buf = new LineBuffer((line) => lines.push(line))
    buf.feed('hel')
    expect(lines).toEqual([])
    buf.feed('lo\n')
    expect(lines).toEqual(['hello'])
  })

  it('handles \\r\\n line endings', () => {
    const lines: string[] = []
    const buf = new LineBuffer((line) => lines.push(line))
    buf.feed('line1\r\nline2\r\n')
    expect(lines).toEqual(['line1', 'line2'])
  })

  it('strips ANSI codes from emitted lines', () => {
    const lines: string[] = []
    const buf = new LineBuffer((line) => lines.push(line))
    buf.feed('\x1b[31mERROR\x1b[0m: something broke\n')
    expect(lines).toEqual(['ERROR: something broke'])
  })
})

describe('detectTrigger', () => {
  it('detects Claude Code permission prompts - Allow tool use', () => {
    const result = detectTrigger('  Allow tool use? (y/n)', defaultTriggers)
    expect(result).not.toBeNull()
    expect(result?.trigger).toBe('permission')
  })

  it('detects Claude Code permission prompts - Do you want to proceed', () => {
    const result = detectTrigger('Do you want to proceed? (y/n)', defaultTriggers)
    expect(result).not.toBeNull()
    expect(result?.trigger).toBe('permission')
  })

  it('detects Claude Code permission prompts - Allow Read', () => {
    const result = detectTrigger(
      '  Allow Read to packages/agent/src/index.ts? (Y)es | (N)o | (A)lways',
      defaultTriggers,
    )
    expect(result).not.toBeNull()
    expect(result?.trigger).toBe('permission')
  })

  it('detects Claude Code permission prompts - Allow Write', () => {
    const result = detectTrigger(
      '  Allow Write to packages/agent/src/test.ts? (Y)es | (N)o',
      defaultTriggers,
    )
    expect(result).not.toBeNull()
    expect(result?.trigger).toBe('permission')
  })

  it('detects Claude Code permission prompts - Allow Bash', () => {
    const result = detectTrigger(
      '  Allow Bash: npm run test? (Y)es | (N)o | (A)lways',
      defaultTriggers,
    )
    expect(result).not.toBeNull()
    expect(result?.trigger).toBe('permission')
  })

  it('detects error patterns - ERROR keyword', () => {
    const result = detectTrigger('ERROR: Failed to compile', defaultTriggers)
    expect(result).not.toBeNull()
    expect(result?.trigger).toBe('error')
  })

  it('detects error patterns - FAILED keyword', () => {
    const result = detectTrigger('Build FAILED with 3 errors', defaultTriggers)
    expect(result).not.toBeNull()
    expect(result?.trigger).toBe('error')
  })

  it('detects error patterns - FAIL test result', () => {
    const result = detectTrigger(' FAIL  src/__tests__/auth.test.ts', defaultTriggers)
    expect(result).not.toBeNull()
    expect(result?.trigger).toBe('error')
  })

  it('detects error patterns - [ERROR] bracketed', () => {
    const result = detectTrigger('[ERROR] Connection refused', defaultTriggers)
    expect(result).not.toBeNull()
    expect(result?.trigger).toBe('error')
  })

  it('detects error patterns - Rust/TS error code', () => {
    const result = detectTrigger('error[E0308]: mismatched types', defaultTriggers)
    expect(result).not.toBeNull()
    expect(result?.trigger).toBe('error')
  })

  it('does NOT false-positive on ERROR inside code output', () => {
    // ERROR in the middle of a grep result or code line should not trigger
    const result = detectTrigger('  const ERROR_HANDLER = getHandler()', defaultTriggers)
    expect(result).toBeNull()
  })

  it('does NOT false-positive on error in import statement', () => {
    const result = detectTrigger("import { handleError } from './utils'", defaultTriggers)
    expect(result).toBeNull()
  })

  it('detects error patterns - Python traceback', () => {
    const result = detectTrigger('Traceback (most recent call last):', defaultTriggers)
    expect(result).not.toBeNull()
    expect(result?.trigger).toBe('error')
  })

  it('detects error patterns - error: lowercase with colon', () => {
    const result = detectTrigger('error: Module not found', defaultTriggers)
    expect(result).not.toBeNull()
    expect(result?.trigger).toBe('error')
  })

  it('detects error patterns - cross mark ✗', () => {
    const result = detectTrigger('  ✗ should handle authentication', defaultTriggers)
    expect(result).not.toBeNull()
    expect(result?.trigger).toBe('error')
  })

  it('detects custom patterns - NOTIFY keyword', () => {
    const result = detectTrigger('NOTIFY: migration complete', defaultTriggers)
    expect(result).not.toBeNull()
    expect(result?.trigger).toBe('custom')
    expect(result?.label).toBe('Claude')
    expect(result?.matched).toContain('migration complete')
  })

  it('detects custom patterns - test success', () => {
    const result = detectTrigger('✓ All tests passed', defaultTriggers)
    expect(result).not.toBeNull()
    expect(result?.trigger).toBe('custom')
    expect(result?.label).toBe('Tests')
  })

  it('returns null for normal output', () => {
    const result = detectTrigger('$ npm install', defaultTriggers)
    expect(result).toBeNull()
  })

  it('returns null when triggers are disabled', () => {
    const disabled: TriggerConfig = {
      permissions: false,
      completion: false,
      errors: false,
      sessionEvents: false,
      customPatterns: [],
    }
    const result = detectTrigger('ERROR: bad stuff', disabled)
    expect(result).toBeNull()
  })

  it('detects Claude Code completion prompt', () => {
    const result = detectTrigger('>', defaultTriggers)
    // The bare '>' prompt by itself is too ambiguous - should not trigger
    expect(result).toBeNull()
  })

  it('detects Claude Code waiting for input pattern', () => {
    // The actual Claude Code prompt after finishing work
    const result = detectTrigger('╭─────────────────────────────────────────────╮', defaultTriggers)
    // Just a box line - not a completion trigger by itself
    expect(result).toBeNull()
  })
})
