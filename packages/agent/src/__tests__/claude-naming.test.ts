import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Tests that Claude Code sessions get auto-named with cwd context.
 * e.g., "claude: clsh" instead of just "claude"
 */

const ptyManagerSource = readFileSync(resolve(import.meta.dirname, '..', 'pty-manager.ts'), 'utf-8')

describe('Claude session naming (Phase 1d)', () => {
  it('create() method contains Claude-specific naming logic', () => {
    // When shell is 'claude', name should include cwd basename
    // Look for the pattern that sets a contextual name for claude sessions
    expect(ptyManagerSource).toMatch(/claude.*basename/i)
  })

  it('default name for claude shell is not just the shell name', () => {
    // The naming logic should produce something like "claude: dirname"
    // not just "claude" as the fallback
    expect(ptyManagerSource).toMatch(/claude:/)
  })
})
