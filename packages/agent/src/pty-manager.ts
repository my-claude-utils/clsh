import { spawn, type IPty } from 'node-pty'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename } from 'node:path'
import type { ShellType, DefaultableShell } from './types.js'
import type { DbStatements } from './db.js'
import type { NotificationManager } from './notifications/manager.js'
import { stripAnsi } from './notifications/triggers.js'
import { CostTracker, type SessionCost } from './notifications/cost-tracker.js'
import {
  tmuxSessionExists,
  killTmuxSession,
  listClshTmuxSessions,
  capturePaneContent,
  TMUX_SOCKET_PATH,
} from './tmux.js'
import { ControlModeLineBuffer, buildSendKeysCommands } from './control-mode-parser.js'

/** Maximum number of buffer entries retained per session for reconnection replay. */
const MAX_BUFFER_SIZE = 10_000

/** Maximum concurrent PTY sessions (H4). */
const MAX_SESSIONS = 8

/** Interval in ms for checking idle status across sessions. */
const IDLE_CHECK_INTERVAL = 2_000

/** Time in ms after last activity before a session is considered idle. */
const IDLE_THRESHOLD = 2_500

/** Environment variable names allowed to pass into PTY child processes. */
const ALLOWED_ENV_VARS = new Set([
  // Core POSIX
  'PATH',
  'HOME',
  'SHELL',
  'TERM',
  'TERM_PROGRAM',
  'USER',
  'LOGNAME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'COLORTERM',
  'EDITOR',
  'VISUAL',
  'DISPLAY',
  'WAYLAND_DISPLAY',
  'SSH_AUTH_SOCK',
  'TMPDIR',
  'TZ',
  // Node.js / npm / nvm (needed for dev tools inside PTY)
  'NODE_PATH',
  'NODE_ENV',
  'NVM_DIR',
  'NVM_BIN',
  'NVM_INC',
  'NVM_CD_FLAGS',
  // Git (needed for git operations inside PTY)
  'GIT_AUTHOR_NAME',
  'GIT_AUTHOR_EMAIL',
  'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL',
  'GIT_SSH_COMMAND',
  'GIT_EDITOR',
  // Claude Code (the primary use case for this tool)
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
])

/** Prefixes allowed for env vars (e.g., XDG_*, NPM_CONFIG_*, CLAUDE_*). */
const ALLOWED_ENV_PREFIXES = ['XDG_', 'NPM_CONFIG_', 'CLAUDE_']

/** Maps shell types to their executable and arguments. */
const SHELL_MAP: Record<ShellType, [string, string[]]> = {
  bash: ['bash', ['--login']],
  zsh: ['zsh', ['-l']],
  tmux: ['tmux', ['new-session', '-A', '-s', 'dev']],
  claude: ['claude', []],
}

/** Shell types that can be wrapped in tmux for persistence. */
const TMUX_WRAPPABLE: Set<ShellType> = new Set(['bash', 'zsh', 'claude'])

/** Extended session status for status indicators. */
export type SessionStatus = 'run' | 'idle' | 'attention' | 'sleeping'

/** Session metadata passed to update listeners. */
export interface SessionMeta {
  name: string
  cwd: string
  status: SessionStatus
  cost?: number | null
}

export interface PTYSession {
  id: string
  shell: ShellType
  pty: IPty
  buffer: string[]
  name: string
  cwd: string
  status: SessionStatus
  lastActivityAt: number
  /** tmux session name if wrapped, null if raw pty */
  tmuxName: string | null
  /** Whether the user has explicitly renamed this session (suppresses OSC 7 name updates). */
  userRenamed: boolean
  onData: (callback: (data: string) => void) => void
  onExit: (callback: (event: { exitCode: number; signal?: number }) => void) => void
  onUpdate: (callback: (meta: SessionMeta) => void) => void
}

export interface AutoSleepConfig {
  enabled: boolean
  timeoutMinutes: number
}

export interface PTYManagerOptions {
  tmuxEnabled?: boolean
  tmuxConfPath?: string | null
  dbStatements?: DbStatements
  defaultShell: DefaultableShell
  notificationManager?: NotificationManager
  autoSleep?: AutoSleepConfig
}

/**
 * Parses OSC 7 escape sequences to extract the current working directory.
 * OSC 7 format: \x1b]7;file:///path\x07 or \x1b]7;file:///path\x1b\\
 */
function parseOSC7(data: string): string | null {
  // eslint-disable-next-line no-control-regex
  const match = /\x1b\]7;file:\/\/[^/]*([^\x07\x1b]+)(?:\x07|\x1b\\)/.exec(data)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

/**
 * Builds a sanitized environment for PTY child processes.
 * Uses an ALLOWLIST — only explicitly permitted variables pass through.
 * This prevents leaking secrets like API keys, tokens, and database URLs.
 */
export function buildSafeEnv(): Record<string, string> {
  const env: Record<string, string> = {}

  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue
    if (ALLOWED_ENV_VARS.has(key)) {
      env[key] = value
      continue
    }
    if (ALLOWED_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      env[key] = value
    }
  }

  // Terminal-friendly defaults
  env['FORCE_COLOR'] = '1'
  env['TERM'] = 'xterm-256color'

  return env
}

export class PTYManager {
  private sessions = new Map<string, PTYSession>()
  private idleCheckInterval: ReturnType<typeof setInterval> | null = null
  private updateListeners = new Map<string, Array<(meta: SessionMeta) => void>>()
  /** When true, PTY exit handlers skip tmux/DB cleanup to preserve session persistence. */
  private shuttingDown = false

  private tmuxEnabled: boolean
  private tmuxConfPath: string | null
  private db: DbStatements | null
  private defaultShell: DefaultableShell
  private notifications: NotificationManager | null
  private autoSleep: AutoSleepConfig
  /** Tracks the last user input time per session for auto-sleep. */
  private lastInputAt = new Map<string, number>()
  /** Cost trackers per session. */
  private costTrackers = new Map<string, CostTracker>()
  private autoSleepCheckInterval: ReturnType<typeof setInterval> | null = null

  constructor(options: PTYManagerOptions) {
    this.tmuxEnabled = options.tmuxEnabled ?? false
    this.tmuxConfPath = options.tmuxConfPath ?? null
    this.db = options.dbStatements ?? null
    this.defaultShell = options.defaultShell
    this.notifications = options.notificationManager ?? null
    this.autoSleep = options.autoSleep ?? { enabled: false, timeoutMinutes: 30 }

    this.idleCheckInterval = setInterval(() => {
      this.checkIdleSessions()
    }, IDLE_CHECK_INTERVAL)

    // Auto-sleep check every 60 seconds
    if (this.autoSleep.enabled) {
      this.autoSleepCheckInterval = setInterval(() => {
        this.checkAutoSleep()
      }, 60_000)
    }
  }

  /** Checks all sessions and transitions them to idle if no recent activity. */
  private checkIdleSessions(): void {
    const now = Date.now()
    for (const session of this.sessions.values()) {
      if (session.status === 'run' && now - session.lastActivityAt > IDLE_THRESHOLD) {
        session.status = 'idle'
        this.emitUpdate(session)
      }
    }
  }

  /** Checks for sessions that should be auto-slept. */
  private checkAutoSleep(): void {
    if (!this.autoSleep.enabled) return
    const now = Date.now()
    const timeoutMs = this.autoSleep.timeoutMinutes * 60_000

    for (const session of this.sessions.values()) {
      // Don't sleep sessions that are active, need attention, or already sleeping
      if (
        session.status === 'run' ||
        session.status === 'attention' ||
        session.status === 'sleeping'
      )
        continue
      // Only sleep tmux-backed sessions (we need tmux to preserve state)
      if (!session.tmuxName) continue

      const lastInput = this.lastInputAt.get(session.id) ?? session.lastActivityAt
      if (now - lastInput >= timeoutMs && now - session.lastActivityAt >= timeoutMs) {
        this.sleepSession(session)
      }
    }
  }

  /** Put a session to sleep: kill node-pty but keep tmux session alive. */
  private sleepSession(session: PTYSession): void {
    if (!session.tmuxName || session.status === 'sleeping') return
    session.pty.kill()
    session.status = 'sleeping'
    this.emitUpdate(session)
  }

  /** Wake a sleeping session by reattaching to its tmux session. */
  /** Wake a sleeping session. Returns true if successfully reattached. */
  private wakeSession(session: PTYSession): boolean {
    if (!session.tmuxName) return false

    // Save session info before removing
    const { id, tmuxName, shell, name, cwd } = session
    // Preserve update listeners so the client still receives events
    const listeners = this.updateListeners.get(id) ?? []
    this.sessions.delete(id)
    this.updateListeners.delete(id)
    this.notifications?.removeSession(id)

    const reattached = this.reattach(id, tmuxName, shell, name, cwd)
    if (reattached) {
      reattached.status = 'idle'
      this.emitUpdate(reattached)
      return true
    }

    // Reattach failed — tmux session is gone. Notify clients via the saved listeners.
    const exitMeta: SessionMeta = { name, cwd, status: 'idle', cost: null }
    for (const listener of listeners) {
      listener(exitMeta)
    }
    return false
  }

  /** Emits an update event to all update listeners for a session. */
  private emitUpdate(session: PTYSession): void {
    const cost = this.costTrackers.get(session.id)?.getCost()
    const meta: SessionMeta = {
      name: session.name,
      cwd: session.cwd,
      status: session.status,
      cost: cost?.totalCost ?? null,
    }
    // Keep notification manager in sync with session name
    this.notifications?.updateSessionName(session.id, session.name)
    const listeners = this.updateListeners.get(session.id)
    if (listeners) {
      for (const listener of listeners) {
        listener(meta)
      }
    }
  }

  /** Simple attention patterns for status indicators (subset of notification triggers). */
  private static readonly ATTENTION_PATTERNS = [
    /Allow\s+\w+.*\?\s*\(Y\)es/i,
    /Allow\s+tool\s+use/i,
    /Do you want to proceed\?/i,
    /\(y\/n\)/i,
    /Allow\s+(Read|Write|Edit|Bash|Glob|Grep)/,
    /\bERROR\b/,
    /\bFAILED\b/,
    /\bFAIL\b\s/,
    /Traceback \(most recent call last\)/,
  ]

  /** Check if output contains attention-worthy patterns. */
  private checkAttention(session: PTYSession, data: string): void {
    const stripped = stripAnsi(data)
    const lines = stripped.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      for (const pattern of PTYManager.ATTENTION_PATTERNS) {
        if (pattern.test(trimmed)) {
          if (session.status !== 'attention') {
            session.status = 'attention'
            this.emitUpdate(session)
          }
          return
        }
      }
    }
  }

  /** Track cost information from PTY output. */
  private trackCost(session: PTYSession, data: string): void {
    let tracker = this.costTrackers.get(session.id)
    if (!tracker) {
      tracker = new CostTracker()
      this.costTrackers.set(session.id, tracker)
    }

    const lines = data.split('\n')
    let changed = false
    for (const line of lines) {
      if (tracker.feedLine(line)) {
        changed = true
      }
    }

    if (changed) {
      this.emitUpdate(session)
    }
  }

  /** Get cost for a session. */
  getSessionCost(id: string): SessionCost | null {
    return this.costTrackers.get(id)?.getCost() ?? null
  }

  /** Whether a shell type should be wrapped in tmux. */
  private shouldWrapInTmux(shell: ShellType): boolean {
    return this.tmuxEnabled && TMUX_WRAPPABLE.has(shell)
  }

  /**
   * Processes raw terminal data for a session: tracks CWD, updates buffer, notifies listeners.
   * Used by both raw and control mode handlers to process actual terminal output.
   */
  private processSessionOutput(
    session: PTYSession,
    data: string,
    dataListeners: Array<(data: string) => void>,
  ): void {
    session.lastActivityAt = Date.now()
    session.status = 'run'

    const parsedCwd = parseOSC7(data)
    if (parsedCwd) {
      session.cwd = parsedCwd
      if (!session.userRenamed) {
        session.name = basename(parsedCwd)
      }
      this.emitUpdate(session)
      if (session.tmuxName && this.db) {
        try {
          this.db.updatePtySession.run(session.name, session.cwd, session.id)
        } catch {
          /* non-critical */
        }
      }
    }

    // Passive notification tap — feed data to monitor without blocking
    // Also check for attention-worthy patterns
    this.notifications?.feedData(session.id, data)

    // Check if this output contains attention patterns (permission prompt, error)
    // Status indicators work independently of notification system
    this.checkAttention(session, data)

    // Cost tracking: parse cost lines from output
    this.trackCost(session, data)

    session.buffer.push(data)
    if (session.buffer.length > MAX_BUFFER_SIZE) {
      session.buffer.splice(0, session.buffer.length - MAX_BUFFER_SIZE)
    }
    for (const listener of dataListeners) {
      listener(data)
    }
  }

  /** Wires up data/exit handlers for a raw PTY session (no tmux). */
  private wireRawHandlers(
    session: PTYSession,
    dataListeners: Array<(data: string) => void>,
    exitListeners: Array<(event: { exitCode: number; signal?: number }) => void>,
  ): void {
    session.pty.onData((data: string) => {
      this.processSessionOutput(session, data, dataListeners)
    })

    session.pty.onExit((event: { exitCode: number; signal?: number }) => {
      for (const listener of exitListeners) {
        listener(event)
      }
      if (session.tmuxName && !this.shuttingDown) {
        killTmuxSession(session.tmuxName)
        if (this.db) {
          try {
            this.db.deletePtySession.run(session.id)
          } catch {
            /* ignore */
          }
        }
      }
      this.sessions.delete(session.id)
      this.updateListeners.delete(session.id)
    })
  }

  /**
   * Wires up data/exit handlers for a tmux control mode session.
   * Parses the control mode protocol and extracts raw %output data.
   */
  private wireControlModeHandlers(
    session: PTYSession,
    dataListeners: Array<(data: string) => void>,
    exitListeners: Array<(event: { exitCode: number; signal?: number }) => void>,
  ): void {
    const lineBuffer = new ControlModeLineBuffer((event) => {
      if (event.type === 'output') {
        this.processSessionOutput(session, event.data, dataListeners)
      }
      // %exit is handled by pty.onExit below
    })

    session.pty.onData((data: string) => {
      lineBuffer.feed(data)
    })

    session.pty.onExit((event: { exitCode: number; signal?: number }) => {
      for (const listener of exitListeners) {
        listener(event)
      }
      if (session.tmuxName && !this.shuttingDown) {
        killTmuxSession(session.tmuxName)
        if (this.db) {
          try {
            this.db.deletePtySession.run(session.id)
          } catch {
            /* ignore */
          }
        }
      }
      this.sessions.delete(session.id)
      this.updateListeners.delete(session.id)
    })
  }

  /**
   * Creates a new PTY session with the specified shell type and dimensions.
   * If tmux is enabled and the shell is wrappable, uses tmux control mode (-CC)
   * for session persistence with proper scrollback support.
   * Falls back to raw PTY if tmux is unavailable.
   */
  create(
    shell?: ShellType,
    cols: number = 80,
    rows: number = 24,
    name?: string,
    cwd?: string,
  ): PTYSession {
    const resolvedShell: ShellType = shell ?? this.defaultShell
    if (this.sessions.size >= MAX_SESSIONS) {
      throw new Error(`Session limit reached (max ${MAX_SESSIONS}). Close a session first.`)
    }

    const id = randomUUID()
    // Use provided cwd if valid, otherwise home directory
    // Resolve ~ to home directory (tilde expansion is a shell feature, not filesystem)
    const resolvedCwd = cwd?.startsWith('~') ? cwd.replace(/^~/, homedir()) : cwd
    const initialCwd = resolvedCwd && existsSync(resolvedCwd) ? resolvedCwd : homedir()
    const wrap = this.shouldWrapInTmux(resolvedShell)
    const tmuxName = wrap ? `clsh-${id}` : null

    let cmd: string
    let args: string[]

    if (wrap && this.tmuxConfPath) {
      const [innerCmd, innerArgs] = SHELL_MAP[resolvedShell]
      cmd = 'tmux'
      args = [
        '-CC',
        '-S',
        TMUX_SOCKET_PATH,
        '-f',
        this.tmuxConfPath,
        'new-session',
        '-s',
        tmuxName as string,
        '-x',
        String(cols),
        '-y',
        String(rows),
        innerCmd,
        ...innerArgs,
      ]
    } else {
      ;[cmd, args] = SHELL_MAP[resolvedShell]
    }

    const pty = spawn(cmd, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: initialCwd,
      env: buildSafeEnv(),
    })

    const buffer: string[] = []
    const dataListeners: Array<(data: string) => void> = []
    const exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = []
    this.updateListeners.set(id, [])

    const session: PTYSession = {
      id,
      shell: resolvedShell,
      pty,
      buffer,
      name: name ?? resolvedShell,
      cwd: initialCwd,
      status: 'idle',
      lastActivityAt: Date.now(),
      tmuxName,
      userRenamed: !!name,
      onData: (callback) => {
        dataListeners.push(callback)
      },
      onExit: (callback) => {
        exitListeners.push(callback)
      },
      onUpdate: (callback) => {
        const listeners = this.updateListeners.get(id)
        if (listeners) listeners.push(callback)
      },
    }

    if (tmuxName) {
      this.wireControlModeHandlers(session, dataListeners, exitListeners)
    } else {
      this.wireRawHandlers(session, dataListeners, exitListeners)
    }

    this.sessions.set(id, session)

    // Register with notification system
    this.notifications?.addSession(id, session.name)

    // Persist to DB for rediscovery
    if (tmuxName && this.db) {
      try {
        this.db.insertPtySession.run(id, tmuxName, resolvedShell, session.name, session.cwd)
      } catch {
        /* non-critical */
      }
    }

    return session
  }

  /**
   * Reattaches to a tmux session that survived a server restart.
   * Uses control mode (-CC) for the attachment and bootstraps the buffer
   * with capture-pane content so the client sees existing scrollback.
   * Returns the restored PTYSession or null if the tmux session is gone.
   */
  reattach(
    sessionId: string,
    tmuxName: string,
    shell: ShellType,
    savedName: string,
    savedCwd: string,
    cols: number = 80,
    rows: number = 24,
  ): PTYSession | null {
    if (!tmuxSessionExists(tmuxName)) {
      // tmux session is gone — clean up DB
      if (this.db) {
        try {
          this.db.deletePtySession.run(sessionId)
        } catch {
          /* ignore */
        }
      }
      return null
    }

    // Capture existing scrollback before attaching (so we don't miss/duplicate anything)
    const capturedContent = capturePaneContent(tmuxName)

    const args = this.tmuxConfPath
      ? ['-CC', '-S', TMUX_SOCKET_PATH, '-f', this.tmuxConfPath, 'attach-session', '-t', tmuxName]
      : ['-CC', '-S', TMUX_SOCKET_PATH, 'attach-session', '-t', tmuxName]

    // Use homedir() as fallback if savedCwd doesn't exist
    const cwd = savedCwd && existsSync(savedCwd) ? savedCwd : homedir()

    let pty: ReturnType<typeof spawn>
    try {
      pty = spawn('tmux', args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: buildSafeEnv(),
      })
    } catch {
      // PTY spawn failed (e.g. posix_spawnp error) — clean up and skip
      if (this.db) {
        try {
          this.db.deletePtySession.run(sessionId)
        } catch {
          /* ignore */
        }
      }
      killTmuxSession(tmuxName)
      return null
    }

    const buffer: string[] = []
    const dataListeners: Array<(data: string) => void> = []
    const exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = []
    this.updateListeners.set(sessionId, [])

    // Bootstrap buffer with captured scrollback content
    if (capturedContent) {
      buffer.push(capturedContent)
    }

    const session: PTYSession = {
      id: sessionId,
      shell,
      pty,
      buffer,
      name: savedName || shell,
      cwd: savedCwd || homedir(),
      status: 'idle',
      lastActivityAt: Date.now(),
      tmuxName,
      userRenamed: false,
      onData: (callback) => {
        dataListeners.push(callback)
      },
      onExit: (callback) => {
        exitListeners.push(callback)
      },
      onUpdate: (callback) => {
        const listeners = this.updateListeners.get(sessionId)
        if (listeners) listeners.push(callback)
      },
    }

    this.wireControlModeHandlers(session, dataListeners, exitListeners)
    this.sessions.set(sessionId, session)
    this.notifications?.addSession(sessionId, session.name)
    return session
  }

  /**
   * Rediscovers sessions from a previous server run.
   * Reads the pty_sessions table, reattaches to any tmux sessions that still exist,
   * and cleans up rows for dead sessions. Also kills zombie tmux sessions.
   * Returns the list of successfully recovered sessions.
   */
  rediscoverAll(): PTYSession[] {
    if (!this.db) return []

    const recovered: PTYSession[] = []
    const dbRows = this.db.listPtySessions.all()
    const dbTmuxNames = new Set<string>()

    for (const row of dbRows) {
      dbTmuxNames.add(row.tmux_name)
      const session = this.reattach(
        row.id,
        row.tmux_name,
        row.shell as ShellType,
        row.name,
        row.cwd,
      )
      if (session) {
        recovered.push(session)
      }
    }

    // Kill zombie tmux sessions (exist in tmux but not in DB)
    const liveTmuxSessions = listClshTmuxSessions()
    for (const tmuxName of liveTmuxSessions) {
      if (!dbTmuxNames.has(tmuxName)) {
        killTmuxSession(tmuxName)
      }
    }

    return recovered
  }

  /**
   * Writes data to the PTY stdin of the specified session.
   * For control mode sessions, translates input to tmux send-keys -H commands.
   */
  write(id: string, data: string): void {
    const session = this.sessions.get(id)
    if (!session) {
      throw new Error(`Session not found: ${id}`)
    }

    // Track input time for auto-sleep
    this.lastInputAt.set(id, Date.now())

    // Wake sleeping sessions on user input, then replay the input
    if (session.status === 'sleeping' && session.tmuxName) {
      const woke = this.wakeSession(session)
      if (woke) {
        // Replay the input that triggered the wake after a short delay
        // to let the tmux session stabilize
        setTimeout(() => {
          try {
            this.write(id, data)
          } catch {
            /* session may have died during wake */
          }
        }, 500)
      }
      return
    }

    // Clear attention status on user input
    if (session.status === 'attention') {
      session.status = 'run'
      this.emitUpdate(session)
    }

    if (session.tmuxName) {
      // Control mode: send input via tmux send-keys -H (hex-encoded bytes)
      const commands = buildSendKeysCommands(session.tmuxName, data)
      for (const cmd of commands) {
        session.pty.write(cmd + '\n')
      }
    } else {
      // Raw PTY: write directly
      session.pty.write(data)
    }
  }

  /** Renames a session and marks it as user-renamed (suppresses OSC 7 name updates). */
  rename(id: string, name: string): void {
    const session = this.sessions.get(id)
    if (!session) {
      throw new Error(`Session not found: ${id}`)
    }
    session.name = name
    session.userRenamed = true
    this.emitUpdate(session)
    if (session.tmuxName && this.db) {
      try {
        this.db.updatePtySession.run(session.name, session.cwd, session.id)
      } catch {
        /* non-critical */
      }
    }
  }

  /**
   * Resizes the PTY of the specified session.
   * For control mode sessions, sends refresh-client -C to tmux.
   */
  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id)
    if (!session) {
      throw new Error(`Session not found: ${id}`)
    }

    // Validate and clamp dimensions (H7)
    const safeCols = Math.max(1, Math.min(500, Math.floor(cols)))
    const safeRows = Math.max(1, Math.min(200, Math.floor(rows)))

    if (session.tmuxName) {
      // Control mode: tell tmux the new client size
      session.pty.write(`refresh-client -C ${String(safeCols)},${String(safeRows)}\n`)
    } else {
      // Raw PTY: resize directly
      session.pty.resize(safeCols, safeRows)
    }
  }

  /** Destroys a single session by ID, killing the underlying PTY and tmux session. */
  destroy(id: string): void {
    const session = this.sessions.get(id)
    if (!session) return

    this.notifications?.removeSession(id)
    session.pty.kill()

    if (session.tmuxName) {
      killTmuxSession(session.tmuxName)
      if (this.db) {
        try {
          this.db.deletePtySession.run(id)
        } catch {
          /* ignore */
        }
      }
    }

    this.sessions.delete(id)
    this.updateListeners.delete(id)
    this.costTrackers.delete(id)
    this.lastInputAt.delete(id)
  }

  /** Retrieves a session by ID, or undefined if not found. */
  get(id: string): PTYSession | undefined {
    return this.sessions.get(id)
  }

  /** Returns all active sessions. */
  list(): PTYSession[] {
    return Array.from(this.sessions.values())
  }

  /**
   * Graceful shutdown — kills node-pty client processes but leaves tmux sessions alive.
   * tmux sessions and DB rows survive for rediscovery on next startup.
   */
  destroyAll(): void {
    this.shuttingDown = true
    for (const session of this.sessions.values()) {
      session.pty.kill()
    }
    this.sessions.clear()
    this.updateListeners.clear()
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval)
      this.idleCheckInterval = null
    }
    if (this.autoSleepCheckInterval) {
      clearInterval(this.autoSleepCheckInterval)
      this.autoSleepCheckInterval = null
    }
  }

  /**
   * Full cleanup — kills everything including tmux sessions and DB rows.
   */
  destroyAllIncludingTmux(): void {
    for (const session of this.sessions.values()) {
      session.pty.kill()
      if (session.tmuxName) {
        killTmuxSession(session.tmuxName)
      }
    }
    this.sessions.clear()
    this.updateListeners.clear()
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval)
      this.idleCheckInterval = null
    }
    if (this.db) {
      try {
        this.db.deleteAllPtySessions.run()
      } catch {
        /* ignore */
      }
    }
  }
}
