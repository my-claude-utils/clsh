import { spawn, type IPty } from 'node-pty';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename } from 'node:path';
import type { ShellType, DefaultableShell } from './types.js';
import type { DbStatements } from './db.js';
import { tmuxSessionExists, killTmuxSession, listClshTmuxSessions, capturePaneContent, TMUX_SOCKET } from './tmux.js';
import { ControlModeLineBuffer, buildSendKeysCommands } from './control-mode-parser.js';

/** Maximum number of buffer entries retained per session for reconnection replay. */
const MAX_BUFFER_SIZE = 10_000;

/** Maximum concurrent PTY sessions (H4). */
const MAX_SESSIONS = 8;

/** Interval in ms for checking idle status across sessions. */
const IDLE_CHECK_INTERVAL = 2_000;

/** Time in ms after last activity before a session is considered idle. */
const IDLE_THRESHOLD = 2_500;

/** Environment variables that must never leak into PTY child processes. */
const SENSITIVE_ENV_VARS: ReadonlyArray<string> = [
  'NGROK_AUTHTOKEN',
  'RESEND_API_KEY',
  'JWT_SECRET',
  'CLAUDECODE',
];

/** Maps shell types to their executable and arguments. */
const SHELL_MAP: Record<ShellType, [string, string[]]> = {
  bash: ['bash', ['--login']],
  zsh: ['zsh', ['-l']],
  tmux: ['tmux', ['new-session', '-A', '-s', 'dev']],
  claude: ['claude', []],
};

/** Shell types that can be wrapped in tmux for persistence. */
const TMUX_WRAPPABLE: Set<ShellType> = new Set(['bash', 'zsh', 'claude']);

/** Session metadata passed to update listeners. */
export interface SessionMeta {
  name: string;
  cwd: string;
  status: 'run' | 'idle';
}

export interface PTYSession {
  id: string;
  shell: ShellType;
  pty: IPty;
  buffer: string[];
  name: string;
  cwd: string;
  status: 'run' | 'idle';
  lastActivityAt: number;
  /** tmux session name if wrapped, null if raw pty */
  tmuxName: string | null;
  /** Whether the user has explicitly renamed this session (suppresses OSC 7 name updates). */
  userRenamed: boolean;
  onData: (callback: (data: string) => void) => void;
  onExit: (callback: (event: { exitCode: number; signal?: number }) => void) => void;
  onUpdate: (callback: (meta: SessionMeta) => void) => void;
}

export interface PTYManagerOptions {
  tmuxEnabled?: boolean;
  tmuxConfPath?: string | null;
  dbStatements?: DbStatements;
  defaultShell: DefaultableShell;
}

/**
 * Parses OSC 7 escape sequences to extract the current working directory.
 * OSC 7 format: \x1b]7;file:///path\x07 or \x1b]7;file:///path\x1b\\
 */
function parseOSC7(data: string): string | null {
  // eslint-disable-next-line no-control-regex
  const match = /\x1b\]7;file:\/\/[^/]*([^\x07\x1b]+)(?:\x07|\x1b\\)/.exec(data);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * Builds a sanitized environment for PTY child processes.
 * Strips sensitive variables and injects terminal-friendly defaults.
 */
function buildSafeEnv(): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !SENSITIVE_ENV_VARS.includes(key)) {
      env[key] = value;
    }
  }

  env['FORCE_COLOR'] = '1';
  env['TERM'] = 'xterm-256color';

  return env;
}

export class PTYManager {
  private sessions = new Map<string, PTYSession>();
  private idleCheckInterval: ReturnType<typeof setInterval> | null = null;
  private updateListeners = new Map<string, Array<(meta: SessionMeta) => void>>();
  /** When true, PTY exit handlers skip tmux/DB cleanup to preserve session persistence. */
  private shuttingDown = false;

  private tmuxEnabled: boolean;
  private tmuxConfPath: string | null;
  private db: DbStatements | null;
  private defaultShell: DefaultableShell;

  constructor(options: PTYManagerOptions) {
    this.tmuxEnabled = options.tmuxEnabled ?? false;
    this.tmuxConfPath = options.tmuxConfPath ?? null;
    this.db = options.dbStatements ?? null;
    this.defaultShell = options.defaultShell;

    this.idleCheckInterval = setInterval(() => {
      this.checkIdleSessions();
    }, IDLE_CHECK_INTERVAL);
  }

  /** Checks all sessions and transitions them to idle if no recent activity. */
  private checkIdleSessions(): void {
    const now = Date.now();
    for (const session of this.sessions.values()) {
      if (session.status === 'run' && now - session.lastActivityAt > IDLE_THRESHOLD) {
        session.status = 'idle';
        this.emitUpdate(session);
      }
    }
  }

  /** Emits an update event to all update listeners for a session. */
  private emitUpdate(session: PTYSession): void {
    const meta: SessionMeta = {
      name: session.name,
      cwd: session.cwd,
      status: session.status,
    };
    const listeners = this.updateListeners.get(session.id);
    if (listeners) {
      for (const listener of listeners) {
        listener(meta);
      }
    }
  }

  /** Whether a shell type should be wrapped in tmux. */
  private shouldWrapInTmux(shell: ShellType): boolean {
    return this.tmuxEnabled && TMUX_WRAPPABLE.has(shell);
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
    session.lastActivityAt = Date.now();
    session.status = 'run';

    const parsedCwd = parseOSC7(data);
    if (parsedCwd) {
      session.cwd = parsedCwd;
      if (!session.userRenamed) {
        session.name = basename(parsedCwd);
      }
      this.emitUpdate(session);
      if (session.tmuxName && this.db) {
        try {
          this.db.updatePtySession.run(session.name, session.cwd, session.id);
        } catch { /* non-critical */ }
      }
    }

    session.buffer.push(data);
    if (session.buffer.length > MAX_BUFFER_SIZE) {
      session.buffer.splice(0, session.buffer.length - MAX_BUFFER_SIZE);
    }
    for (const listener of dataListeners) {
      listener(data);
    }
  }

  /** Wires up data/exit handlers for a raw PTY session (no tmux). */
  private wireRawHandlers(
    session: PTYSession,
    dataListeners: Array<(data: string) => void>,
    exitListeners: Array<(event: { exitCode: number; signal?: number }) => void>,
  ): void {
    session.pty.onData((data: string) => {
      this.processSessionOutput(session, data, dataListeners);
    });

    session.pty.onExit((event: { exitCode: number; signal?: number }) => {
      for (const listener of exitListeners) {
        listener(event);
      }
      if (session.tmuxName && !this.shuttingDown) {
        killTmuxSession(session.tmuxName);
        if (this.db) {
          try { this.db.deletePtySession.run(session.id); } catch { /* ignore */ }
        }
      }
      this.sessions.delete(session.id);
      this.updateListeners.delete(session.id);
    });
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
        this.processSessionOutput(session, event.data, dataListeners);
      }
      // %exit is handled by pty.onExit below
    });

    session.pty.onData((data: string) => {
      lineBuffer.feed(data);
    });

    session.pty.onExit((event: { exitCode: number; signal?: number }) => {
      for (const listener of exitListeners) {
        listener(event);
      }
      if (session.tmuxName && !this.shuttingDown) {
        killTmuxSession(session.tmuxName);
        if (this.db) {
          try { this.db.deletePtySession.run(session.id); } catch { /* ignore */ }
        }
      }
      this.sessions.delete(session.id);
      this.updateListeners.delete(session.id);
    });
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
  ): PTYSession {
    const resolvedShell: ShellType = shell ?? this.defaultShell;
    if (this.sessions.size >= MAX_SESSIONS) {
      throw new Error(`Session limit reached (max ${MAX_SESSIONS}). Close a session first.`);
    }

    const id = randomUUID();
    const initialCwd = homedir();
    const wrap = this.shouldWrapInTmux(resolvedShell);
    const tmuxName = wrap ? `clsh-${id}` : null;

    let cmd: string;
    let args: string[];

    if (wrap && this.tmuxConfPath) {
      const [innerCmd, innerArgs] = SHELL_MAP[resolvedShell];
      cmd = 'tmux';
      args = [
        '-CC',
        '-L', TMUX_SOCKET,
        '-f', this.tmuxConfPath,
        'new-session',
        '-s', tmuxName as string,
        '-x', String(cols),
        '-y', String(rows),
        innerCmd, ...innerArgs,
      ];
    } else {
      [cmd, args] = SHELL_MAP[resolvedShell];
    }

    const pty = spawn(cmd, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: initialCwd,
      env: buildSafeEnv(),
    });

    const buffer: string[] = [];
    const dataListeners: Array<(data: string) => void> = [];
    const exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];
    this.updateListeners.set(id, []);

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
      onData: (callback) => { dataListeners.push(callback); },
      onExit: (callback) => { exitListeners.push(callback); },
      onUpdate: (callback) => {
        const listeners = this.updateListeners.get(id);
        if (listeners) listeners.push(callback);
      },
    };

    if (tmuxName) {
      this.wireControlModeHandlers(session, dataListeners, exitListeners);
    } else {
      this.wireRawHandlers(session, dataListeners, exitListeners);
    }

    this.sessions.set(id, session);

    // Persist to DB for rediscovery
    if (tmuxName && this.db) {
      try {
        this.db.insertPtySession.run(id, tmuxName, resolvedShell, session.name, session.cwd);
      } catch { /* non-critical */ }
    }

    return session;
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
        try { this.db.deletePtySession.run(sessionId); } catch { /* ignore */ }
      }
      return null;
    }

    // Capture existing scrollback before attaching (so we don't miss/duplicate anything)
    const capturedContent = capturePaneContent(tmuxName);

    const args = this.tmuxConfPath
      ? ['-CC', '-L', TMUX_SOCKET, '-f', this.tmuxConfPath, 'attach-session', '-t', tmuxName]
      : ['-CC', '-L', TMUX_SOCKET, 'attach-session', '-t', tmuxName];

    // Use homedir() as fallback if savedCwd doesn't exist
    const cwd = savedCwd && existsSync(savedCwd) ? savedCwd : homedir();

    let pty: ReturnType<typeof spawn>;
    try {
      pty = spawn('tmux', args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: buildSafeEnv(),
      });
    } catch {
      // PTY spawn failed (e.g. posix_spawnp error) — clean up and skip
      if (this.db) {
        try { this.db.deletePtySession.run(sessionId); } catch { /* ignore */ }
      }
      killTmuxSession(tmuxName);
      return null;
    }

    const buffer: string[] = [];
    const dataListeners: Array<(data: string) => void> = [];
    const exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];
    this.updateListeners.set(sessionId, []);

    // Bootstrap buffer with captured scrollback content
    if (capturedContent) {
      buffer.push(capturedContent);
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
      onData: (callback) => { dataListeners.push(callback); },
      onExit: (callback) => { exitListeners.push(callback); },
      onUpdate: (callback) => {
        const listeners = this.updateListeners.get(sessionId);
        if (listeners) listeners.push(callback);
      },
    };

    this.wireControlModeHandlers(session, dataListeners, exitListeners);
    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Rediscovers sessions from a previous server run.
   * Reads the pty_sessions table, reattaches to any tmux sessions that still exist,
   * and cleans up rows for dead sessions. Also kills zombie tmux sessions.
   * Returns the list of successfully recovered sessions.
   */
  rediscoverAll(): PTYSession[] {
    if (!this.db) return [];

    const recovered: PTYSession[] = [];
    const dbRows = this.db.listPtySessions.all();
    const dbTmuxNames = new Set<string>();

    for (const row of dbRows) {
      dbTmuxNames.add(row.tmux_name);
      const session = this.reattach(
        row.id,
        row.tmux_name,
        row.shell as ShellType,
        row.name,
        row.cwd,
      );
      if (session) {
        recovered.push(session);
      }
    }

    // Kill zombie tmux sessions (exist in tmux but not in DB)
    const liveTmuxSessions = listClshTmuxSessions();
    for (const tmuxName of liveTmuxSessions) {
      if (!dbTmuxNames.has(tmuxName)) {
        killTmuxSession(tmuxName);
      }
    }

    return recovered;
  }

  /**
   * Writes data to the PTY stdin of the specified session.
   * For control mode sessions, translates input to tmux send-keys -H commands.
   */
  write(id: string, data: string): void {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }

    if (session.tmuxName) {
      // Control mode: send input via tmux send-keys -H (hex-encoded bytes)
      const commands = buildSendKeysCommands(session.tmuxName, data);
      for (const cmd of commands) {
        session.pty.write(cmd + '\n');
      }
    } else {
      // Raw PTY: write directly
      session.pty.write(data);
    }
  }

  /** Renames a session and marks it as user-renamed (suppresses OSC 7 name updates). */
  rename(id: string, name: string): void {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }
    session.name = name;
    session.userRenamed = true;
    this.emitUpdate(session);
    if (session.tmuxName && this.db) {
      try { this.db.updatePtySession.run(session.name, session.cwd, session.id); } catch { /* non-critical */ }
    }
  }

  /**
   * Resizes the PTY of the specified session.
   * For control mode sessions, sends refresh-client -C to tmux.
   */
  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }

    // Validate and clamp dimensions (H7)
    const safeCols = Math.max(1, Math.min(500, Math.floor(cols)));
    const safeRows = Math.max(1, Math.min(200, Math.floor(rows)));

    if (session.tmuxName) {
      // Control mode: tell tmux the new client size
      session.pty.write(`refresh-client -C ${String(safeCols)},${String(safeRows)}\n`);
    } else {
      // Raw PTY: resize directly
      session.pty.resize(safeCols, safeRows);
    }
  }

  /** Destroys a single session by ID, killing the underlying PTY and tmux session. */
  destroy(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;

    session.pty.kill();

    if (session.tmuxName) {
      killTmuxSession(session.tmuxName);
      if (this.db) {
        try { this.db.deletePtySession.run(id); } catch { /* ignore */ }
      }
    }

    this.sessions.delete(id);
    this.updateListeners.delete(id);
  }

  /** Retrieves a session by ID, or undefined if not found. */
  get(id: string): PTYSession | undefined {
    return this.sessions.get(id);
  }

  /** Returns all active sessions. */
  list(): PTYSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Graceful shutdown — kills node-pty client processes but leaves tmux sessions alive.
   * tmux sessions and DB rows survive for rediscovery on next startup.
   */
  destroyAll(): void {
    this.shuttingDown = true;
    for (const session of this.sessions.values()) {
      session.pty.kill();
    }
    this.sessions.clear();
    this.updateListeners.clear();
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }
  }

  /**
   * Full cleanup — kills everything including tmux sessions and DB rows.
   */
  destroyAllIncludingTmux(): void {
    for (const session of this.sessions.values()) {
      session.pty.kill();
      if (session.tmuxName) {
        killTmuxSession(session.tmuxName);
      }
    }
    this.sessions.clear();
    this.updateListeners.clear();
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }
    if (this.db) {
      try { this.db.deleteAllPtySessions.run(); } catch { /* ignore */ }
    }
  }
}
