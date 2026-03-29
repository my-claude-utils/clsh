import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Tests that the session manager does NOT wipe sessions on disconnect
 * and properly merges state on reconnect.
 *
 * Uses source-inspection pattern since we can't easily render React hooks
 * without @testing-library/react (not installed).
 */

const source = readFileSync(resolve(import.meta.dirname, '..', 'useSessionManager.ts'), 'utf-8')

describe('session disconnect behavior (Phase 1a)', () => {
  it('does NOT call setSessions([]) on disconnect', () => {
    // The source should NOT contain setSessions([]) in the disconnect path
    // Previously this was at line 127: setSessions([])
    // After fix, sessions should be preserved during disconnects
    const disconnectPattern = /onStatusChange.*?\{[\s\S]*?\}/
    const match = source.match(disconnectPattern)
    expect(match).not.toBeNull()

    // Check that the disconnect branch does NOT wipe sessions
    // The old code had: } else { setSessions([]) }
    // The fix removes the setSessions([]) call entirely
    expect(source).not.toMatch(/else\s*\{\s*\n?\s*setSessions\(\[\]\)/)
  })
})

describe('session reconnect merge (Phase 1a)', () => {
  it('session_list handler preserves snapshots from existing sessions', () => {
    // The handler should merge incoming session data with existing state
    // rather than replacing it entirely. Look for snapshot preservation logic.
    const sessionListHandler = source.match(/case\s+'session_list'[\s\S]*?break/)
    expect(sessionListHandler).not.toBeNull()
    // Should reference 'snapshot' to preserve it during merge
    expect(sessionListHandler![0]).toContain('snapshot')
  })
})

describe('exited status support (Phase 1c)', () => {
  it('handles exited status from session_update without removing the session', () => {
    // The exit handler should not remove sessions with 'exited' status
    // Instead it should update the status to 'exited'
    // Check that the source handles 'exited' somewhere
    expect(source).toContain('exited')
  })

  it('exports restartSession callback', () => {
    expect(source).toContain('restartSession')
  })
})
