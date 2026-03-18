/**
 * Shared WebSocket message type definitions for clsh client-server protocol.
 */

export type ClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'stdin'; sessionId: string; data: string }
  | { type: 'resize'; sessionId: string; cols: number; rows: number }
  | { type: 'session_create'; shell: 'bash' | 'zsh' | 'tmux' | 'claude' }
  | { type: 'session_close'; sessionId: string }
  | { type: 'session_rename'; sessionId: string; name: string }
  | { type: 'session_subscribe'; sessionId: string }
  | { type: 'session_list' }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'auth_ok' }
  | { type: 'auth_error'; message: string }
  | { type: 'stdout'; sessionId: string; data: string }
  | { type: 'stderr'; sessionId: string; data: string }
  | { type: 'exit'; sessionId: string; exitCode: number; signal?: number }
  | { type: 'session'; sessionId: string; shell: string; pid: number; name: string; cwd: string; status: 'run' | 'idle' }
  | {
      type: 'session_list';
      sessions: Array<{ id: string; shell: string; pid: number; name: string; cwd: string; status: 'run' | 'idle' }>;
    }
  | { type: 'session_update'; sessionId: string; name: string; cwd: string; status: 'run' | 'idle' }
  | { type: 'error'; message: string }
  | { type: 'pong' };
