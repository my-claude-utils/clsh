# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is clsh?

clsh provides real terminal access from your phone. It spawns real PTY sessions via node-pty, streams them over WebSocket through a tunnel (ngrok/Tailscale/SSH/Wi-Fi), and renders them in xterm.js. Users scan a QR code to authenticate and can run multiple terminal sessions including Claude Code remotely.

## Platform Requirements

clsh requires Unix PTY and tmux. On **Windows**, the agent must run inside **WSL**:

```bash
wsl                             # Enter WSL
cd /mnt/d/Dev/clsh              # Navigate to repo (adjust path for your drive)
npm install                     # Compiles node-pty for Linux
npm run dev                     # Starts agent + web
```

The CLI will exit with a warning if run from Windows-native Node.js. Always run from a WSL terminal.

## Commands

```bash
npm install                    # Install all workspace deps + compile node-pty
npm run dev                    # Start agent (4030) + web (4031) in parallel
npm run build                  # Build all packages via Turborepo
npm run lint                   # ESLint across all packages
npm run typecheck              # TypeScript type checking
npm run test                   # Run tests
npm run format                 # Prettier format all files
npm run format:check           # Check formatting
```

### Per-package commands
```bash
npm run dev --workspace=@clsh/agent    # Agent only (tsx watch)
npm run dev --workspace=@clsh/web      # Web only (Vite HMR)
npm run lint --workspace=@clsh/agent   # Lint specific package
```

## Architecture

### Monorepo Structure (npm workspaces + Turborepo)

- **@clsh/agent** (`packages/agent/`): Backend - Express HTTP server, WebSocket handler, PTY manager, auth system, tunnel management
- **@clsh/web** (`packages/web/`): Frontend - React 18, xterm.js with WebGL, Tailwind v4, custom keyboard system
- **clsh-dev** (`packages/cli/`): CLI entry point published to npm, bootstraps and manages the agent

### Agent Package Key Files

| File | Purpose |
|------|---------|
| `server.ts` | Express server setup, CORS, security headers, rate limiting |
| `ws-handler.ts` | WebSocket connection management, message routing |
| `pty-manager.ts` | PTY lifecycle, session management, tmux integration |
| `tunnel.ts` | 4-tier tunnel fallback: ngrok → Tailscale → SSH (localhost.run) → local Wi-Fi |
| `auth.ts` | JWT tokens, bootstrap tokens, WebAuthn biometric auth |
| `db.ts` | SQLite via better-sqlite3 for session/auth persistence |
| `tmux.ts` | tmux control mode (-CC) for session persistence across restarts |
| `control-mode-parser.ts` | Parses tmux control mode output notifications |

### Web Package Structure

| Directory | Purpose |
|-----------|---------|
| `components/` | React components - terminal views, keyboard, session grid, lock screen |
| `hooks/` | Custom React hooks for WebSocket, terminal state, auth |
| `lib/` | Utilities, WebSocket client, keyboard layout definitions |
| `demo/` | Demo mode with scripted terminal animations |

### Data Flow

1. CLI starts agent (Express + WebSocket on port 4030)
2. Agent establishes tunnel and displays QR code with bootstrap token
3. Phone scans QR, authenticates via one-time token, receives JWT
4. WebSocket connection established for terminal I/O
5. Agent spawns PTY sessions (optionally wrapped in tmux for persistence)
6. xterm.js renders terminal output, keyboard sends input back over WebSocket

## Code Style

- TypeScript strict mode enabled
- Prettier: no semicolons, single quotes, trailing commas, 100 char width
- ESLint with typescript-eslint strict rules
- 2-space indentation, LF line endings

## Commit Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `style:`

## Environment Variables

Key variables (see `.env.example`):
- `NGROK_AUTHTOKEN` / `NGROK_STATIC_DOMAIN` - For permanent tunnel URL
- `CLSH_PORT` - Agent port (default 4030)
- `WEB_PORT` - Vite dev server port (default 4031)
- `TUNNEL=tailscale|ssh|local` - Force specific tunnel method
- `CLSH_NO_TMUX=1` - Disable tmux session persistence
