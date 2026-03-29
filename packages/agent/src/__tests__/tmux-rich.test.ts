import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Tests for Phase 2a: Rich tmux session metadata.
 * Uses source-inspection to verify function signatures and types exist.
 */

const tmuxSource = readFileSync(resolve(import.meta.dirname, '..', 'tmux.ts'), 'utf-8')

describe('TmuxSessionInfo type (Phase 2a)', () => {
  it('exports TmuxSessionInfo interface', () => {
    expect(tmuxSource).toContain('export interface TmuxSessionInfo')
  })

  it('TmuxSessionInfo has all required fields', () => {
    expect(tmuxSource).toContain('name: string')
    expect(tmuxSource).toContain('createdAt: number')
    expect(tmuxSource).toContain('attachedCount: number')
    expect(tmuxSource).toContain('lastActivity: number')
    expect(tmuxSource).toContain('windowCount: number')
    expect(tmuxSource).toContain('isClshOwned: boolean')
  })
})

describe('listAllTmuxSessions (Phase 2a)', () => {
  it('exports listAllTmuxSessions function', () => {
    expect(tmuxSource).toContain('export function listAllTmuxSessions(')
  })

  it('queries all required tmux format variables', () => {
    expect(tmuxSource).toContain('#{session_name}')
    expect(tmuxSource).toContain('#{session_created}')
    expect(tmuxSource).toContain('#{session_attached}')
    expect(tmuxSource).toContain('#{session_activity}')
    expect(tmuxSource).toContain('#{session_windows}')
  })

  it('uses pipe separator for parsing', () => {
    // Pipe is used as delimiter because tmux session names cannot contain it
    expect(tmuxSource).toMatch(/join\('\|'\)/)
  })
})

describe('detachTmuxClients (Phase 2a)', () => {
  it('exports detachTmuxClients function', () => {
    expect(tmuxSource).toContain('export function detachTmuxClients(')
  })

  it('uses detach-client tmux command', () => {
    expect(tmuxSource).toContain('detach-client')
  })
})
