import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Tests for Phase 1 critical UX fixes:
 * - Scrollback limit increased for Claude Code sessions
 * - remain-on-exit prevents session destruction when Claude exits
 * - restartSession() allows respawning exited sessions
 *
 * Uses source-inspection pattern (same as ws-handler.test.ts)
 * to verify tmux config and PTYManager behavior without spawning real PTYs.
 */

const tmuxSource = readFileSync(resolve(import.meta.dirname, '..', 'tmux.ts'), 'utf-8')
const ptyManagerSource = readFileSync(resolve(import.meta.dirname, '..', 'pty-manager.ts'), 'utf-8')

describe('scrollback limits (Phase 1b)', () => {
  it('tmux history-limit is at least 50000 lines for Claude Code sessions', () => {
    const match = tmuxSource.match(/history-limit\s+(\d+)/)
    expect(match).not.toBeNull()
    const limit = parseInt(match![1], 10)
    expect(limit).toBeGreaterThanOrEqual(50_000)
  })

  it('MAX_BUFFER_SIZE is at least 50000 entries', () => {
    const match = ptyManagerSource.match(/MAX_BUFFER_SIZE\s*=\s*([\d_]+)/)
    expect(match).not.toBeNull()
    const size = parseInt(match![1].replace(/_/g, ''), 10)
    expect(size).toBeGreaterThanOrEqual(50_000)
  })
})

describe('remain-on-exit (Phase 1c)', () => {
  it('tmux config includes remain-on-exit on', () => {
    expect(tmuxSource).toContain('remain-on-exit on')
  })
})

describe('exited session status (Phase 1c)', () => {
  it('SessionStatus type includes exited', () => {
    // The type should include 'exited' in its union
    expect(ptyManagerSource).toMatch(/SessionStatus\s*=.*'exited'/)
  })

  it('PTYManager exports a restartSession method', () => {
    expect(ptyManagerSource).toContain('restartSession(')
  })
})

describe('respawnPane helper (Phase 1c)', () => {
  it('tmux.ts exports respawnPane function', () => {
    expect(tmuxSource).toContain('export function respawnPane(')
  })
})
