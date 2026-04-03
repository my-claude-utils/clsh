# Notifications

clsh can send push notifications when important events happen in your terminal sessions — permission prompts, errors, task completion, and custom patterns.

## Quick Start

Add a `notifications` section to `~/.clsh/config.json`:

```json
{
  "notifications": {
    "enabled": true,
    "channels": [
      { "type": "ntfy", "topic": "my-clsh-alerts" }
    ],
    "triggers": {
      "permissions": true,
      "completion": true,
      "errors": true,
      "sessionEvents": true,
      "customPatterns": [
        { "pattern": "NOTIFY:\\s*(.+)", "label": "Claude" }
      ]
    },
    "cooldown": 10
  }
}
```

Then start clsh with `--notify` or set `"enabled": true` in the config.

## Channels

### ntfy.sh (Recommended)

Zero-setup push notifications via [ntfy.sh](https://ntfy.sh). Install the ntfy app on your phone, subscribe to your topic, done.

```json
{ "type": "ntfy", "topic": "my-clsh-alerts" }
```

Optional: use a self-hosted ntfy server:
```json
{ "type": "ntfy", "topic": "alerts", "server": "https://ntfy.myserver.com" }
```

### Pushover

```json
{
  "type": "pushover",
  "appToken": "your-app-token",
  "userKey": "your-user-key"
}
```

Get your tokens at [pushover.net](https://pushover.net).

### Telegram

```json
{
  "type": "telegram",
  "botToken": "123456:ABC-DEF",
  "chatId": "your-chat-id"
}
```

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Send a message to your bot
3. Get your chat ID from `https://api.telegram.org/bot<TOKEN>/getUpdates`

### Webhook

Generic POST to any URL:

```json
{
  "type": "webhook",
  "url": "https://example.com/hook",
  "headers": { "Authorization": "Bearer xxx" }
}
```

Payload format:
```json
{
  "session": "session-name",
  "trigger": "permission|completion|error|custom|session",
  "label": "human-readable label",
  "matched": "the matched text line",
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

## Triggers

### Permission Prompts

Detects when Claude Code asks for permission to use tools (Read, Write, Edit, Bash, etc.). These are the highest priority — they bypass cooldown because they're blocking work.

### Task Completion

Fires when Claude Code stops generating output for 5+ seconds, indicating it's waiting for input.

### Errors

Detects: `ERROR`, `FAILED`, `FAIL`, `error:`, `Error:`, stack traces, Python tracebacks, test failure marks (`✗`, `✘`).

### Custom Patterns

Define regex patterns with labels:

```json
"customPatterns": [
  { "pattern": "NOTIFY:\\s*(.+)", "label": "Claude" },
  { "pattern": "✓ All tests passed", "label": "Tests" },
  { "pattern": "deploy complete", "label": "Deploy" }
]
```

The `NOTIFY:` pattern is built-in by default. Tell Claude: *"When you finish, output NOTIFY: migration complete"* and the captured group becomes the notification body.

### Session Events

Fires on session disconnect, reconnect, and crash/unexpected exit.

## Cooldown

Default: 10 seconds between notifications from the same session.

- **Permission prompts** always bypass cooldown
- **Errors** bypass cooldown if the error text is different from the previous error
- **Custom patterns** and **completion** respect cooldown

## CLI

```bash
# Start with notifications enabled
npx clsh-dev --notify

# Test all configured channels
npx clsh-dev notify-test
```

## Troubleshooting

- **No notifications?** Check `npx clsh-dev notify-test` for channel connectivity
- **Too many notifications?** Increase the `cooldown` value
- **Missing permission alerts?** Ensure `triggers.permissions` is `true`
- **Debug logs:** Notification failures are logged to stderr as JSON lines
