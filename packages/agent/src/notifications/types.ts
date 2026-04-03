/** Notification channel configurations. */
export interface NtfyChannel {
  type: 'ntfy'
  topic: string
  server?: string // defaults to https://ntfy.sh
}

export interface PushoverChannel {
  type: 'pushover'
  appToken: string
  userKey: string
}

export interface TelegramChannel {
  type: 'telegram'
  botToken: string
  chatId: string
}

export interface WebhookChannel {
  type: 'webhook'
  url: string
  headers?: Record<string, string>
}

export type NotificationChannel = NtfyChannel | PushoverChannel | TelegramChannel | WebhookChannel

/** Trigger types for notifications. */
export type TriggerType = 'permission' | 'completion' | 'error' | 'custom' | 'session'

export interface CustomPattern {
  pattern: string
  label: string
}

/** Pre-compiled custom pattern (compiled once at config load, not per line). */
export interface CompiledPattern {
  regex: RegExp
  label: string
}

export interface TriggerConfig {
  permissions: boolean
  completion: boolean
  errors: boolean
  sessionEvents: boolean
  customPatterns: CustomPattern[]
}

/** Full notification config block for ~/.clsh/config.json. */
export interface NotificationConfig {
  enabled: boolean
  channels: NotificationChannel[]
  triggers: TriggerConfig
  /** Cooldown in seconds between notifications from the same session. */
  cooldown: number
}

/** A notification payload ready to send. */
export interface NotificationPayload {
  session: string
  trigger: TriggerType
  label: string
  matched: string
  timestamp: string
}

/** Default notification config (enabled for in-app; add channels for external). */
export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  enabled: true,
  channels: [],
  triggers: {
    permissions: true,
    completion: true,
    errors: true,
    sessionEvents: true,
    customPatterns: [{ pattern: 'NOTIFY:\\s*(.+)', label: 'Claude' }],
  },
  cooldown: 10,
}
