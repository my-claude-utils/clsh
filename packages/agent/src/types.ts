/** Shell types supported by the PTY manager. */
export type ShellType = 'bash' | 'zsh' | 'tmux' | 'claude'

/** Shell types that can be used as the server default (excludes tmux/claude). */
export type DefaultableShell = 'bash' | 'zsh'

/** Messages sent from client to server over WebSocket. */
export type ClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'stdin'; sessionId: string; data: string }
  | { type: 'resize'; sessionId: string; cols: number; rows: number }
  | { type: 'session_create'; shell?: ShellType; name?: string; cwd?: string }
  | { type: 'session_close'; sessionId: string }
  | { type: 'session_rename'; sessionId: string; name: string }
  | { type: 'session_subscribe'; sessionId: string }
  | { type: 'session_list' }
  | { type: 'session_restart'; sessionId: string }
  | { type: 'session_detach'; sessionId: string }
  | { type: 'ping' }

/** Messages sent from server to client over WebSocket. */
export type ServerMessage =
  | { type: 'auth_ok' }
  | { type: 'auth_error'; message: string }
  | { type: 'stdout'; sessionId: string; data: string }
  | { type: 'stderr'; sessionId: string; data: string }
  | { type: 'exit'; sessionId: string; exitCode: number; signal?: number }
  | {
      type: 'session'
      sessionId: string
      shell: string
      pid: number
      name: string
      cwd: string
      status: 'run' | 'idle' | 'attention' | 'sleeping' | 'exited'
      createdAt?: number
      attachedClients?: number
    }
  | {
      type: 'session_list'
      sessions: Array<{
        id: string
        shell: string
        pid: number
        name: string
        cwd: string
        status: 'run' | 'idle' | 'attention' | 'sleeping' | 'exited'
        createdAt?: number
        attachedClients?: number
      }>
    }
  | {
      type: 'session_update'
      sessionId: string
      name: string
      cwd: string
      status: 'run' | 'idle' | 'attention' | 'sleeping' | 'exited'
      cost?: number | null
      attachedClients: number
    }
  | { type: 'detached'; sessionId: string }
  | {
      type: 'notification'
      sessionId: string
      sessionName: string
      trigger: 'permission' | 'completion' | 'error' | 'custom' | 'session'
      label: string
      matched: string
      timestamp: string
    }
  | { type: 'error'; message: string }
  | { type: 'pong' }
