import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Regression tests for startup reliability.
 *
 * Bug: start.sh used `tmux new-session -A -s clsh-server` which silently
 * reattaches to a stale/dead tmux session instead of starting a new one.
 * The agent never starts, so only Vite HMR output is visible.
 *
 * Fix: Kill any existing clsh-server session before creating a new one.
 * Also add an early startup banner so tunnel hangs don't cause silent startup.
 */

const startShSource = readFileSync(
  resolve(import.meta.dirname, '..', '..', '..', '..', 'start.sh'),
  'utf-8',
)
const indexSource = readFileSync(resolve(import.meta.dirname, '..', 'index.ts'), 'utf-8')

describe('start.sh tmux session management (regression)', () => {
  it('kills stale clsh-server tmux session before creating a new one', () => {
    expect(startShSource).toContain('tmux kill-session -t clsh-server')
  })

  it('does NOT use -A flag which silently reattaches to dead sessions', () => {
    // -A means "attach if exists" — this caused the agent to never start
    // when a stale session was left over from a previous run
    expect(startShSource).not.toMatch(/tmux new-session -A/)
  })

  it('creates a fresh tmux session named clsh-server', () => {
    expect(startShSource).toMatch(/tmux new-session -s clsh-server/)
  })
})

describe('agent startup visibility (regression)', () => {
  it('prints a startup banner before any potentially blocking operation', () => {
    // The main() function must print output early so the user knows the agent
    // is starting, even if createTunnel() hangs (e.g. Tailscale not ready).
    const mainFnStart = indexSource.indexOf('async function main()')
    expect(mainFnStart).toBeGreaterThan(-1)

    // Find the first console.log after main() starts
    const afterMain = indexSource.slice(mainFnStart)
    const firstLog = afterMain.indexOf("console.log('  Starting clsh agent...')")
    const tunnelCall = afterMain.indexOf('createTunnel(')

    expect(firstLog).toBeGreaterThan(-1)
    expect(tunnelCall).toBeGreaterThan(-1)
    // The startup log must appear before the tunnel call
    expect(firstLog).toBeLessThan(tunnelCall)
  })
})
