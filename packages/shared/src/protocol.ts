/**
 * Shared WebSocket protocol types for clsh client-server communication.
 *
 * This is the single source of truth — both @clsh/agent and @clsh/web
 * re-export from here so the protocol definition never drifts.
 */

/** Shell types supported by the PTY manager. */
export type ShellType = 'bash' | 'zsh' | 'tmux' | 'claude'

/** Shell types that can be used as the server default (excludes tmux/claude). */
export type DefaultableShell = 'bash' | 'zsh'

/** Session activity status. */
export type SessionStatus = 'run' | 'idle' | 'attention' | 'sleeping' | 'exited'

/** Notification trigger types. */
export type TriggerType = 'permission' | 'completion' | 'error' | 'custom' | 'session'

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
      status: SessionStatus
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
        status: SessionStatus
        createdAt?: number
        attachedClients?: number
      }>
    }
  | {
      type: 'session_update'
      sessionId: string
      name: string
      cwd: string
      status: SessionStatus
      cost?: number | null
      attachedClients: number
    }
  | { type: 'detached'; sessionId: string }
  | {
      type: 'notification'
      sessionId: string
      sessionName: string
      trigger: TriggerType
      label: string
      matched: string
      timestamp: string
    }
  | { type: 'error'; message: string }
  | { type: 'pong' }
