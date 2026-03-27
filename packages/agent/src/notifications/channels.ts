import type {
  NotificationChannel,
  NotificationPayload,
  NtfyChannel,
  PushoverChannel,
  TelegramChannel,
  WebhookChannel,
} from './types.js'

export interface HttpRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: string
}

/** Builds an HTTP request for ntfy.sh. */
export function buildNtfyRequest(channel: NtfyChannel, payload: NotificationPayload): HttpRequest {
  const server = channel.server ?? 'https://ntfy.sh'
  const isPermission = payload.trigger === 'permission'
  const isError = payload.trigger === 'error'

  return {
    url: `${server}/${channel.topic}`,
    method: 'POST',
    headers: {
      Title: `clsh - ${payload.session}`,
      Priority: isPermission ? 'high' : 'default',
      Tags: isPermission ? 'computer' : isError ? 'warning' : 'bell',
    },
    body: payload.matched,
  }
}

/** Builds an HTTP request for Pushover. */
export function buildPushoverRequest(
  channel: PushoverChannel,
  payload: NotificationPayload,
): HttpRequest {
  const isPermission = payload.trigger === 'permission'

  return {
    url: 'https://api.pushover.net/1/messages.json',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: channel.appToken,
      user: channel.userKey,
      title: `clsh - ${payload.session}`,
      message: `[${payload.label}] ${payload.matched}`,
      priority: isPermission ? 1 : 0,
    }),
  }
}

/** Escape Telegram Markdown V1 special characters in user content. */
function escapeTelegramMarkdown(text: string): string {
  return text.replace(/([_*`[])/g, '\\$1')
}

/** Builds an HTTP request for Telegram. */
export function buildTelegramRequest(
  channel: TelegramChannel,
  payload: NotificationPayload,
): HttpRequest {
  const safeSession = escapeTelegramMarkdown(payload.session)
  const safeLabel = escapeTelegramMarkdown(payload.label)
  const safeMatched = escapeTelegramMarkdown(payload.matched)
  const text = `*clsh — ${safeSession}*\n\`${safeLabel}\`: ${safeMatched}`

  return {
    url: `https://api.telegram.org/bot${channel.botToken}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: channel.chatId,
      text,
      parse_mode: 'Markdown',
    }),
  }
}

/** Builds an HTTP request for a generic webhook. */
export function buildWebhookRequest(
  channel: WebhookChannel,
  payload: NotificationPayload,
): HttpRequest {
  return {
    url: channel.url,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(channel.headers ?? {}),
    },
    body: JSON.stringify({
      session: payload.session,
      trigger: payload.trigger,
      label: payload.label,
      matched: payload.matched,
      timestamp: payload.timestamp,
    }),
  }
}

/** Builds the appropriate HTTP request for any channel type. */
function buildRequest(channel: NotificationChannel, payload: NotificationPayload): HttpRequest {
  switch (channel.type) {
    case 'ntfy':
      return buildNtfyRequest(channel, payload)
    case 'pushover':
      return buildPushoverRequest(channel, payload)
    case 'telegram':
      return buildTelegramRequest(channel, payload)
    case 'webhook':
      return buildWebhookRequest(channel, payload)
  }
}

/**
 * Sends a notification to a single channel.
 * Fire-and-forget — never throws, logs errors to stderr.
 */
export async function sendToChannel(
  channel: NotificationChannel,
  payload: NotificationPayload,
): Promise<void> {
  try {
    const req = buildRequest(channel, payload)
    const res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      process.stderr.write(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          event: 'notification.send.http_error',
          data: { channel: channel.type, status: res.status },
        }) + '\n',
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'notification.send.failed',
        data: { channel: channel.type, error: msg },
      }) + '\n',
    )
  }
}

/**
 * Sends a notification to all configured channels.
 * Fire-and-forget — all sends are parallel, none block the caller.
 */
export function sendToAllChannels(
  channels: NotificationChannel[],
  payload: NotificationPayload,
): void {
  for (const channel of channels) {
    void sendToChannel(channel, payload)
  }
}
