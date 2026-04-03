import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendToChannel, buildNtfyRequest, buildPushoverRequest, buildTelegramRequest, buildWebhookRequest } from '../notifications/channels.js'
import type { NotificationPayload, NtfyChannel, PushoverChannel, TelegramChannel, WebhookChannel } from '../notifications/types.js'

const payload: NotificationPayload = {
  session: 'test-session',
  trigger: 'error',
  label: 'Build Error',
  matched: 'ERROR: Failed to compile',
  timestamp: '2025-01-01T00:00:00.000Z',
}

describe('buildNtfyRequest', () => {
  it('builds correct request for default server', () => {
    const channel: NtfyChannel = { type: 'ntfy', topic: 'chris-claude' }
    const req = buildNtfyRequest(channel, payload)
    expect(req.url).toBe('https://ntfy.sh/chris-claude')
    expect(req.method).toBe('POST')
    expect(req.body).toBe('ERROR: Failed to compile')
    expect(req.headers['Title']).toBe('clsh - test-session')
    expect(req.headers['Tags']).toBe('warning')
  })

  it('uses custom server when specified', () => {
    const channel: NtfyChannel = { type: 'ntfy', topic: 'my-topic', server: 'https://my-ntfy.example.com' }
    const req = buildNtfyRequest(channel, payload)
    expect(req.url).toBe('https://my-ntfy.example.com/my-topic')
  })

  it('sets high priority for permission triggers', () => {
    const permPayload = { ...payload, trigger: 'permission' as const }
    const channel: NtfyChannel = { type: 'ntfy', topic: 'test' }
    const req = buildNtfyRequest(channel, permPayload)
    expect(req.headers['Priority']).toBe('high')
    expect(req.headers['Tags']).toBe('computer')
  })
})

describe('buildPushoverRequest', () => {
  it('builds correct request', () => {
    const channel: PushoverChannel = { type: 'pushover', appToken: 'app123', userKey: 'user456' }
    const req = buildPushoverRequest(channel, payload)
    expect(req.url).toBe('https://api.pushover.net/1/messages.json')
    expect(req.method).toBe('POST')
    const body = JSON.parse(req.body) as Record<string, unknown>
    expect(body.token).toBe('app123')
    expect(body.user).toBe('user456')
    expect(body.title).toBe('clsh - test-session')
    expect(body.priority).toBe(0) // normal for errors
  })

  it('sets high priority for permission triggers', () => {
    const channel: PushoverChannel = { type: 'pushover', appToken: 'a', userKey: 'u' }
    const permPayload = { ...payload, trigger: 'permission' as const }
    const req = buildPushoverRequest(channel, permPayload)
    const body = JSON.parse(req.body) as Record<string, unknown>
    expect(body.priority).toBe(1)
  })
})

describe('buildTelegramRequest', () => {
  it('builds correct request', () => {
    const channel: TelegramChannel = { type: 'telegram', botToken: 'bot123', chatId: '789' }
    const req = buildTelegramRequest(channel, payload)
    expect(req.url).toBe('https://api.telegram.org/botbot123/sendMessage')
    const body = JSON.parse(req.body) as Record<string, unknown>
    expect(body.chat_id).toBe('789')
    expect(body.parse_mode).toBe('Markdown')
    expect(typeof body.text).toBe('string')
  })
})

describe('buildWebhookRequest', () => {
  it('builds correct request', () => {
    const channel: WebhookChannel = { type: 'webhook', url: 'https://example.com/hook' }
    const req = buildWebhookRequest(channel, payload)
    expect(req.url).toBe('https://example.com/hook')
    expect(req.method).toBe('POST')
    const body = JSON.parse(req.body) as Record<string, unknown>
    expect(body.session).toBe('test-session')
    expect(body.trigger).toBe('error')
    expect(body.label).toBe('Build Error')
    expect(body.matched).toBe('ERROR: Failed to compile')
    expect(body.timestamp).toBe('2025-01-01T00:00:00.000Z')
  })

  it('includes custom headers when specified', () => {
    const channel: WebhookChannel = {
      type: 'webhook',
      url: 'https://example.com/hook',
      headers: { 'X-Custom': 'value' },
    }
    const req = buildWebhookRequest(channel, payload)
    expect(req.headers['X-Custom']).toBe('value')
  })
})

describe('sendToChannel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('calls fetch with correct parameters for ntfy', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)

    const channel: NtfyChannel = { type: 'ntfy', topic: 'test' }
    await sendToChannel(channel, payload)

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://ntfy.sh/test')
    expect(opts.method).toBe('POST')
  })

  it('does not throw on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const channel: NtfyChannel = { type: 'ntfy', topic: 'test' }
    // Should not throw
    await expect(sendToChannel(channel, payload)).resolves.toBeUndefined()
  })
})
