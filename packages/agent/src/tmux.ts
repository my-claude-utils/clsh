import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

/** Full path to clsh's tmux socket (in ~/.clsh/ for restricted permissions). */
export const TMUX_SOCKET_PATH = join(homedir(), '.clsh', 'tmux.sock')

/** Invisible tmux config — no status bar, no prefix, passthrough for OSC 7. */
const TMUX_CONF = `set -g status off
set -g prefix None
unbind-key C-b
set -g allow-passthrough on
set -g default-terminal "xterm-256color"
set -g mouse off
set -g history-limit 5000
set -g escape-time 0
set -ga terminal-overrides ",xterm-256color:Tc"
`

/** Prefix used for all clsh-managed tmux sessions. */
const SESSION_PREFIX = 'clsh-'

/**
 * Checks if tmux is available on the system.
 */
export function isTmuxAvailable(): boolean {
  try {
    execFileSync('tmux', ['-V'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * Writes the invisible tmux config to ~/.clsh/tmux.conf and returns its path.
 */
export function ensureTmuxConfig(): string {
  const clshDir = join(homedir(), '.clsh')
  const confPath = join(clshDir, 'tmux.conf')
  mkdirSync(clshDir, { recursive: true })
  writeFileSync(confPath, TMUX_CONF, { mode: 0o644 })
  return confPath
}

/**
 * Lists all tmux sessions matching the clsh- prefix.
 * Returns an array of session names (e.g. ["clsh-abc123", "clsh-def456"]).
 */
export function listClshTmuxSessions(): string[] {
  try {
    const output = execFileSync(
      'tmux',
      ['-S', TMUX_SOCKET_PATH, 'list-sessions', '-F', '#{session_name}'],
      {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    )
    return output
      .trim()
      .split('\n')
      .filter((name) => name.startsWith(SESSION_PREFIX))
  } catch {
    // tmux server not running or no sessions — both fine
    return []
  }
}

/**
 * Checks if a specific tmux session exists.
 */
export function tmuxSessionExists(name: string): boolean {
  try {
    execFileSync('tmux', ['-S', TMUX_SOCKET_PATH, 'has-session', '-t', name], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * Kills a single tmux session by name.
 */
export function killTmuxSession(name: string): void {
  try {
    execFileSync('tmux', ['-S', TMUX_SOCKET_PATH, 'kill-session', '-t', name], { stdio: 'ignore' })
  } catch {
    // Session already gone — fine
  }
}

/**
 * Kills all clsh-prefixed tmux sessions.
 */
export function killAllClshTmuxSessions(): void {
  for (const name of listClshTmuxSessions()) {
    killTmuxSession(name)
  }
}

/**
 * Captures the full scrollback + visible screen of a tmux pane.
 * Returns the content as text with ANSI escape sequences preserved.
 * Used to bootstrap the buffer on reattach after server restart.
 */
export function capturePaneContent(tmuxName: string): string {
  try {
    const content = execFileSync(
      'tmux',
      ['-S', TMUX_SOCKET_PATH, 'capture-pane', '-t', tmuxName, '-p', '-S', '-', '-e'],
      { encoding: 'utf-8' },
    )
    // capture-pane outputs \n line endings, but xterm.js needs \r\n —
    // without \r the cursor doesn't return to column 0, causing text to cascade right.
    // Also trim trailing blank lines (empty terminal rows below content).
    return content.replace(/\n+$/, '\n').replace(/\n/g, '\r\n')
  } catch {
    return ''
  }
}
