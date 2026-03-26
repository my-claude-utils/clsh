// clsh notify-test — sends a test notification to all configured channels

import { join } from 'node:path'
import { homedir } from 'node:os'
import { readFileSync } from 'node:fs'

// Inline types to avoid depending on agent build output
interface NotificationChannel {
  type: 'ntfy' | 'pushover' | 'telegram' | 'webhook'
  topic?: string
  server?: string
  appToken?: string
  userKey?: string
  botToken?: string
  chatId?: string
  url?: string
  headers?: Record<string, string>
}

interface NotificationConfig {
  enabled: boolean
  channels: NotificationChannel[]
}

interface NotificationPayload {
  session: string
  trigger: string
  label: string
  matched: string
  timestamp: string
}

const o = '\x1b[38;5;208m'
const g = '\x1b[32m'
const red = '\x1b[31m'
const dim = '\x1b[2m'
const r = '\x1b[0m'

function loadNotificationConfig(): NotificationConfig | null {
  try {
    const configPath = join(homedir(), '.clsh', 'config.json')
    const content = readFileSync(configPath, 'utf-8')
    const config = JSON.parse(content) as { notifications?: NotificationConfig }
    return config.notifications ?? null
  } catch {
    return null
  }
}

async function testChannel(
  channel: NotificationChannel,
  payload: NotificationPayload,
): Promise<{ type: string; ok: boolean; error?: string }> {
  let url = ''
  let init: RequestInit = {}

  switch (channel.type) {
    case 'ntfy': {
      const server = channel.server ?? 'https://ntfy.sh'
      url = `${server}/${channel.topic ?? 'clsh'}`
      init = {
        method: 'POST',
        headers: { Title: 'clsh - notify-test', Priority: 'default', Tags: 'white_check_mark' },
        body: payload.matched,
      }
      break
    }
    case 'pushover':
      url = 'https://api.pushover.net/1/messages.json'
      init = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: channel.appToken,
          user: channel.userKey,
          title: 'clsh - notify-test',
          message: payload.matched,
          priority: 0,
        }),
      }
      break
    case 'telegram':
      url = `https://api.telegram.org/bot${channel.botToken ?? ''}/sendMessage`
      init = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: channel.chatId,
          text: `*clsh — notify-test*\n${payload.matched}`,
          parse_mode: 'Markdown',
        }),
      }
      break
    case 'webhook':
      url = channel.url ?? ''
      init = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(channel.headers ?? {}) },
        body: JSON.stringify(payload),
      }
      break
  }

  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) })
    if (res.ok) {
      return { type: channel.type, ok: true }
    }
    return { type: channel.type, ok: false, error: `HTTP ${String(res.status)}` }
  } catch (err) {
    return {
      type: channel.type,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function runNotifyTest(): Promise<void> {
  console.log(`\n${o}  clsh notify-test${r}\n`)

  const config = loadNotificationConfig()
  if (!config) {
    console.log(`  ${red}No notification config found.${r}`)
    console.log(`  ${dim}Add a "notifications" section to ~/.clsh/config.json${r}\n`)
    process.exit(1)
  }

  if (config.channels.length === 0) {
    console.log(`  ${red}No channels configured.${r}`)
    console.log(`  ${dim}Add channels to ~/.clsh/config.json under "notifications.channels"${r}\n`)
    process.exit(1)
  }

  const payload: NotificationPayload = {
    session: 'notify-test',
    trigger: 'custom',
    label: 'Test',
    matched: 'This is a test notification from clsh',
    timestamp: new Date().toISOString(),
  }

  console.log(`  Testing ${String(config.channels.length)} channel(s)...\n`)

  const results = await Promise.all(
    config.channels.map((ch: NotificationChannel) => testChannel(ch, payload)),
  )

  for (const result of results) {
    if (result.ok) {
      console.log(`  ${g}✓${r} ${result.type}`)
    } else {
      console.log(`  ${red}✗${r} ${result.type}: ${result.error}`)
    }
  }

  const allOk = results.every((res) => res.ok)
  console.log('')
  if (allOk) {
    console.log(`  ${g}All channels working!${r}\n`)
  } else {
    console.log(`  ${red}Some channels failed. Check your config.${r}\n`)
    process.exit(1)
  }
}
