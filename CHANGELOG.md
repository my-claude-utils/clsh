# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2026-03-14

### Added

- **Terminal agent** — Node.js backend with real PTY sessions via `node-pty`
- **WebSocket streaming** — Live terminal I/O between browser and PTY with backpressure handling
- **React frontend** — xterm.js with WebGL renderer, full color and interactivity
- **Phone-first UI** — Session grid, terminal view, and skin studio optimized for mobile
- **Session grid** — 2-column card layout with live terminal previews (headless xterm.js)
- **Two keyboard layouts** — iOS Terminal (6-row, big keys) and MacBook (5-row, compact)
- **6 keyboard skins** — iOS Terminal, MacBook Silver, Gamer RGB, Custom Painted, Amber Retro, Ice White
- **Skin Studio** — Browse and switch skins with live keyboard preview
- **Sticky modifiers** — Shift, Ctrl, Opt, Cmd stay active for next keypress on touch
- **Key repeat** — Hold any non-modifier key for auto-repeat (400ms delay, 60ms interval)
- **Context strip** — Quick-access buttons: esc, F1-F5, commit, diff, plan, Ctrl+C
- **3-tier tunnel fallback** — ngrok (static domain) -> SSH (localhost.run) -> local Wi-Fi
- **QR code auth** — Bootstrap token embedded in QR code, printed to console on startup
- **JWT session management** — Token-based auth via `jose`
- **SQLite storage** — Local database for session and auth data (`better-sqlite3`, WAL mode)
- **PWA support** — Fullscreen standalone mode, home screen installable, safe-area insets
- **Demo mode** — Auto-plays scripted terminal animations when no backend is reachable
- **Session management** — Create, rename, close sessions; live preview in grid cards
- **Port fallback** — Auto-probes up to 10 ports on EADDRINUSE
- **Sensitive env stripping** — NGROK_AUTHTOKEN, RESEND_API_KEY, JWT_SECRET stripped from PTY children
- **Landing page** — Static site with interactive demo and video
- **OSS scaffolding** — MIT license, CONTRIBUTING.md, SECURITY.md, issue/PR templates, CI workflow
