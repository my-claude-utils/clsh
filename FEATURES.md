# Features Guide

## Session Templates

Define project shortcuts for quick session creation:

```json
{
  "sessionTemplates": [
    {
      "name": "DecreeWise",
      "directory": "/home/chris/projects/decreewise",
      "shell": "claude",
      "icon": "⚖️",
      "pinnedCommands": [
        { "label": "Tests", "command": "npm test" },
        { "label": "Status", "command": "git status" }
      ]
    },
    {
      "name": "Terminal",
      "directory": "~",
      "shell": "zsh",
      "icon": "💻"
    }
  ]
}
```

When templates are configured, tapping "+" shows a picker instead of immediately spawning a blank shell. Each template sets the working directory and shell type. A "Blank Session" option is always available.

## Pinned Commands

Add quick-access command buttons above the terminal keyboard:

```json
{
  "pinnedCommands": [
    { "label": "Status", "command": "git status" },
    { "label": "Push", "command": "git push" }
  ]
}
```

Global commands apply to all sessions. Template-specific commands appear first, then global ones. One tap sends the command. Long-press copies the command text.

## Auth Modes

### Default (Bootstrap/QR)

Scan QR code to authenticate. Token expires after 5 minutes.

### Tailscale Mode

Trust the Tailscale network — no authentication required:

```json
{
  "auth": { "mode": "tailscale" }
}
```

Safe because only devices on your Tailscale network can reach the port.

### Persistent Mode

Set a static token and bookmark the magic link:

```json
{
  "auth": {
    "mode": "persistent",
    "token": "my-secret-token"
  }
}
```

Visit `http://your-host:4030/auth?token=my-secret-token` to get a 1-year JWT cookie. Bookmark this URL on your phone.

## Session Status Indicators

Each session card shows a colored status dot:

- 🟢 **Green (Idle)** — Shell/Claude at input prompt, waiting for command
- 🟡 **Amber (Working)** — Actively generating output
- 🔴 **Red (Attention)** — Permission prompt or error detected (pulses)
- ⚪ **Gray (Sleeping)** — Session auto-slept to save resources

Red dots clear when you send input. Attention status is detected from permission prompts and error patterns in the terminal output.

## Auto-Sleep

Sessions automatically sleep after inactivity to free resources:

```json
{
  "autoSleep": {
    "enabled": true,
    "timeoutMinutes": 30
  }
}
```

- Only tmux-backed sessions can sleep (raw PTY sessions are excluded)
- Sleeping detaches node-pty but keeps the tmux session alive
- Tap into a sleeping session to wake it — restores exactly where you left off
- Sessions with active output or attention status are never auto-slept

## Cost Ticker

Claude Code's session cost is automatically parsed from terminal output and displayed as a badge on each session card:

- 🟢 Green: under $1
- 🟡 Yellow: $1–$5
- 🔴 Red: over $5

No configuration needed — cost appears as soon as Claude reports it.

## Clipboard Bridge

- **Floating copy button** (bottom-right): detects URLs and file paths in output. Badge shows count; tap cycles through them.
- **Context strip clipboard button** (📋): copies the last output block (everything since the last prompt)
- **Long-press** on pinned commands copies the command text instead of executing

All clipboard operations strip ANSI escape codes for clean text.
