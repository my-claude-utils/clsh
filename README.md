<div align="center">

<img src="docs/images/profile.png" alt="clsh logo" width="120" />

# clsh

**Your Mac, in your pocket.**

Real terminal access from your phone. Not SSH. Not a simulation.
A real PTY on your machine, streamed to your pocket.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green?logo=node.js&logoColor=white)](https://nodejs.org)

[Live Demo](https://clsh.dev) · [Getting Started](#quickstart) · [How It Works](#how-it-works) · [Contributing](CONTRIBUTING.md)

<br />

<video src="https://github.com/my-claude-utils/clsh/raw/main/assets/setup-flow.mp4" width="600" autoplay loop muted playsinline></video>

</div>

---

<div align="center">
<table>
<tr>
<td align="center"><img src="docs/images/phone-grid.png" width="220" /><br /><b>Session Grid</b></td>
<td align="center"><img src="docs/images/phone-claude.png" width="220" /><br /><b>Claude Code on Phone</b></td>
<td align="center"><img src="docs/images/phone-terminal.png" width="220" /><br /><b>Terminal + Live Preview</b></td>
</tr>
<tr>
<td align="center"><img src="docs/images/phone-claude-active.png" width="220" /><br /><b>MacBook Keyboard Skin</b></td>
<td align="center"><img src="docs/images/phone-skins.png" width="220" /><br /><b>Skin Studio — 6 Themes</b></td>
<td></td>
</tr>
</table>
</div>

---

## What is clsh?

clsh gives you real terminal access to your Mac from your phone. Clone, install, run — scan the QR code and you're in. Multiple live terminal sessions, a custom keyboard built for terminal use, 6 keyboard skins, and session management. Open source, zero config.

**Key highlights:**

- Run Claude Code from your phone and watch it work in real time
- Multiple terminal sessions with live grid preview
- Custom keyboard with sticky modifiers, key repeat, and context strip
- 3-tier tunnel: ngrok → SSH → Wi-Fi (works without any signup)
- Install as a PWA — fullscreen, no browser chrome

## Quickstart

> **Requires [Node.js 20+](https://nodejs.org)** and macOS or Linux.

```bash
git clone https://github.com/my-claude-utils/clsh.git
cd clsh
npm install
npm run dev
```

A QR code prints to the console. Scan it on your phone. That's it.

## How It Works

```
  Phone / Tablet / Browser
        │
        │ HTTPS (WebSocket)
        ▼
  ┌──────────────┐
  │  Tunnel       │  ngrok (static URL) / SSH (localhost.run) / Wi-Fi
  └──────┬───────┘
         ▼
  ┌──────────────────────┐
  │  clsh agent           │  ← runs on your machine
  │  ├── PTY 0: zsh       │
  │  ├── PTY 1: claude    │
  │  ├── PTY 2: ...       │
  │  └── up to 8 sessions │
  └──────────────────────┘
```

1. `npm run dev` starts the backend agent + React frontend
2. The agent spawns real terminal sessions via `node-pty`
3. When tmux is installed, sessions are wrapped in tmux for **persistence** — they survive server restarts
4. A tunnel (ngrok, SSH, or Wi-Fi) exposes the agent over HTTPS
5. A one-time bootstrap token + QR code authenticates your phone
6. xterm.js renders the terminals in your browser with full color and interactivity

## Features

### Terminal

- **Multiple live sessions** — create, rename, close; up to 8 concurrent PTYs
- **Real PTY** — full zsh/bash with colors, vim, tmux, everything
- **Session persistence** — sessions survive server restarts via tmux (auto-detected, graceful fallback if tmux isn't installed)
- **Session grid** — 2-column card layout with live terminal previews
- **Claude Code streaming** — run AI coding agents remotely from your phone

### Keyboard

- **Two layouts** — iOS Terminal (6-row, big keys for phone) and MacBook (5-row, compact)
- **Sticky modifiers** — tap Shift/Ctrl/Opt/Cmd once, it stays for the next key
- **Key repeat** — hold any key for auto-repeat (400ms delay, 60ms interval)
- **Context strip** — quick-access: esc, F1-F5, commit, diff, plan, Ctrl+C
- **6 skins** — iOS Terminal, MacBook Silver, Gamer RGB, Custom Painted, Amber Retro, Ice White

### Connectivity

- **3-tier tunnel fallback** — ngrok → [localhost.run](https://localhost.run) SSH → local Wi-Fi
- **Zero-config start** — works immediately with SSH tunnel (no signup needed)
- **Static URL with ngrok** — same URL every time for PWA home screen
- **QR code auth** — scan once, stay connected via JWT

### Mobile

- **PWA** — install to home screen, runs fullscreen without browser chrome
- **iOS keyboard suppressed** — custom keyboard replaces system keyboard
- **Safe-area insets** — works with Dynamic Island and notch devices
- **Demo mode** — scripted terminal animations when no backend is reachable

## Tunnel Setup

### Zero-config (default)

```bash
npm run dev
```

Connects through [localhost.run](https://localhost.run) — a free SSH tunnel. **No signup, no tokens.** A QR code prints to the console with the HTTPS URL.

### Permanent URL with ngrok (recommended)

For a static domain that survives restarts — perfect for a home screen PWA:

```bash
brew install ngrok
ngrok config add-authtoken YOUR_TOKEN    # free at ngrok.com
```

Create a free static domain at [dashboard.ngrok.com/domains](https://dashboard.ngrok.com/domains), then:

```bash
# .env (project root)
NGROK_AUTHTOKEN=your_token
NGROK_STATIC_DOMAIN=your-subdomain.ngrok-free.dev
```

### Local Wi-Fi fallback

If no tunnel works, clsh falls back to your local IP. Same LAN only.

### Force a specific tunnel

```bash
TUNNEL=ssh npm run dev     # force SSH tunnel
TUNNEL=local npm run dev   # force local Wi-Fi only
```

## Session Persistence

When tmux is installed, clsh automatically wraps sessions in tmux using **control mode** (`-CC`). This means your terminal sessions survive server restarts — stop `npm run dev`, start it again, and your sessions are still there with full scrollback history.

```
# Install tmux (if not already installed)
brew install tmux          # macOS
sudo apt install tmux      # Ubuntu/Debian
```

No configuration needed. clsh auto-detects tmux and enables persistence. If tmux isn't installed, sessions work normally but are ephemeral (lost on restart).

To disable persistence even with tmux installed:

```bash
CLSH_NO_TMUX=1 npm run dev
```

**How it works under the hood:** clsh uses tmux control mode (`-CC`) instead of normal tmux attachment. Control mode sends raw terminal output as structured notifications (`%output`) instead of screen redraws, which means xterm.js gets the original byte stream and scrollback works perfectly. User input is forwarded via `send-keys -H` (hex-encoded). On server restart, `capture-pane` recovers the existing scrollback and control mode resumes live streaming.

## Lid-Close Mode (optional)

By default, macOS powers down Wi-Fi about 30 seconds after you close the lid, even if the CPU is still running. This kills the tunnel and your phone loses connection.

If you want clsh to stay reachable with the lid closed (while plugged in), run this once:

```bash
sudo pmset -c tcpkeepalive 1
```

This tells macOS to keep network connections alive during display sleep on AC power. It persists across reboots. clsh will print a reminder on startup if this isn't configured.

**What it does:** Keeps Wi-Fi and TCP connections alive when the lid is closed and the Mac is charging. Your phone stays connected to clsh without interruption.

**What it doesn't do:** This has no effect on battery. When unplugged with the lid closed, macOS forces full sleep regardless. There's no software workaround for that.

**To undo:**

```bash
sudo pmset -c tcpkeepalive 0
```

> **Note:** Even without this setting, clsh auto-recovers when you open the lid. The tunnel recreates itself and your phone reconnects automatically.

## Add to Home Screen

With a permanent ngrok URL, add clsh as a PWA:

- **iOS**: Safari → Share (↑) → **Add to Home Screen**
- **Android**: Chrome → Menu (⋮) → **Add to Home Screen**

It runs fullscreen — no URL bar, no browser chrome. Looks like a native app.

## Keyboard Skins

| Skin | Vibe |
|------|------|
| **iOS Terminal** | Default — big letter keys, iOS-style, optimized for phone |
| **MacBook Silver** | Traditional MacBook aluminum — compact 5-row layout |
| **Gamer RGB** | Animated rainbow per-key lighting |
| **Custom Painted** | Every key a different color — warm spectrum |
| **Amber Retro** | Phosphor terminal aesthetic — amber on black |
| **Ice White** | Clean and minimal — dark text on white keys |

Switch skins from the **Skin Studio** (tap the grid icon → settings).

## Experience Tiers

clsh works great out of the box. Optional features level it up:

| Setup | Remote | Stable URL | Vibe |
|-------|:------:|:----------:|------|
| **ngrok (static domain)** | yes | yes | Your Mac lives in your pocket. Same URL, PWA on home screen. |
| **ngrok (rotating)** | yes | — | Instant remote access. QR code, scan, go. |
| **SSH tunnel** | yes | — | Zero signup, works anywhere. Auto-fallback via localhost.run. |
| **Local Wi-Fi** | LAN | — | Zero dependencies. `npm run dev` and you're in. |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite 6, Tailwind CSS v4, xterm.js (WebGL) |
| Backend | Node.js 20+, Express, ws, node-pty, tmux (control mode), better-sqlite3 |
| Tunnel | @ngrok/ngrok SDK, localhost.run (SSH fallback) |
| Auth | jose (JWT), one-time bootstrap tokens |
| Monorepo | Turborepo, npm workspaces |

## Project Structure

```
clsh/
├── packages/
│   ├── agent/     # Backend: Express + WebSocket + node-pty + auth + tunnel
│   ├── web/       # Frontend: React + xterm.js + Tailwind + keyboard system
│   └── cli/       # CLI wrapper (future)
├── apps/
│   └── landing/   # Static landing page (clsh.dev)
└── docs/
    └── images/    # Screenshots for README
```

## Configuration

Create a `.env` file in the project root (optional):

```bash
NGROK_AUTHTOKEN=your_token                        # For permanent URL
NGROK_STATIC_DOMAIN=your-subdomain.ngrok-free.dev # Static ngrok domain
CLSH_PORT=4030                                    # Agent port (default: 4030)
CLSH_NO_TMUX=1                                    # Disable tmux session persistence
CLSH_NO_OPEN=1                                    # Skip auto-opening browser
TUNNEL=ssh                                        # Force tunnel method: ssh | local
```

See `.env.example` for all options.

## Roadmap

- [x] Phone-first terminal UI with session grid
- [x] Two keyboard layouts (iOS Terminal + MacBook)
- [x] 6 keyboard skins with Skin Studio
- [x] 3-tier tunnel (ngrok → SSH → Wi-Fi)
- [x] QR code + JWT auth
- [x] PWA with fullscreen standalone mode
- [x] Demo mode for showcasing
- [x] Session persistence (tmux control mode — sessions survive restarts)
- [ ] Remote cloud machines (containers instead of local tunnel)
- [ ] Team sharing (shared sessions with presence)
- [ ] iOS/Android native app
- [ ] Claude Code tool extensions

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Development setup and workflow
- Coding standards and commit conventions
- PR guidelines

## Security

Found a vulnerability? Please report it responsibly. See [SECURITY.md](SECURITY.md) for our disclosure policy.

## License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">

**[clsh.dev](https://clsh.dev)** · Star this repo if clsh is useful to you

</div>
