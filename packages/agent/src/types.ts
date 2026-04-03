/**
 * Re-export protocol types from the shared package.
 * @clsh/shared is the single source of truth for the client-server protocol.
 */
export type {
  ShellType,
  DefaultableShell,
  SessionStatus,
  TriggerType,
  ClientMessage,
  ServerMessage,
} from '@clsh/shared'
