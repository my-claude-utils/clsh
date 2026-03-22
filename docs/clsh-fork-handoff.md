# CLSH Fork — Implementation Handoff

**Date**: 2026-03-21
**Source repo**: https://github.com/my-claude-utils/clsh
**Purpose**: Fork clsh, fix security issues, deploy on WSL2 for remote Claude Code access from Android phone

---

## What Is CLSH

A browser-based remote terminal tool. Run one command, scan a QR code on your phone, get real terminal access to your machine. Key features:

- Up to 8 concurrent PTY sessions with live previews
- Custom touch keyboard optimized for phones
- Session persistence via tmux control mode
- Tunnel layer: ngrok (static URL) → SSH (localhost.run) → local Wi-Fi (fallback)
- PWA installable on Android/iOS
- JWT + password + WebAuthn authentication

### Target Use Case

Run multiple Claude Code sessions in parallel from an Android phone while away from the machine:

| Session | Worktree | Task |
|---------|----------|------|
| Terminal 1 | `main` | Exploration, grooming Linear issues, planning |
| Terminal 2 | `worktree/feature-A` | Implementing with TDD |
| Terminal 3 | `worktree/fix-B` | Debugging/squashing bugs |
| Terminal 4 | — | Monitoring: `gh pr status`, CI, logs |

Each Claude Code instance works in an isolated git worktree — no file conflicts.

### Tech Stack

- **Frontend**: React 18, TypeScript, Vite 6, Tailwind CSS v4, xterm.js (WebGL)
- **Backend**: Node.js 20+, Express, WebSocket (ws), node-pty
- **Persistence**: tmux control mode, better-sqlite3
- **Auth**: jose (JWT/HS256), scrypt, WebAuthn
- **Tunneling**: @ngrok/ngrok SDK, localhost.run SSH

### Monorepo Structure

```
packages/
├── agent/    # Backend: Express, WebSocket, node-pty, auth, tunnel
├── web/      # Frontend: React, xterm.js, Tailwind, keyboard
└── cli/      # CLI entry point (npx clsh-dev)

apps/
└── landing/  # Static landing page
```

---

## WSL2 Compatibility — VERIFIED GREEN

Every source file was audited. **Zero blockers. Zero code changes needed for WSL2.**

| Component | Status | Notes |
|-----------|--------|-------|
| node-pty | WORKS | Uses `forkpty()` on Linux, prebuilds available |
| better-sqlite3 | WORKS | Linux prebuilds, WAL mode fine on ext4 |
| ngrok tunnel | WORKS | Linux binary, full WSL2 networking |
| SSH tunnel (localhost.run) | WORKS | `apt install openssh-client` |
| tmux persistence | WORKS | `apt install tmux`, cleanly optional via `CLSH_NO_TMUX=1` |
| Shell detection | WORKS | Bare command names (`bash`, `zsh`), no hardcoded `/bin/` paths |
| macOS-specific code | WORKS | All guarded by `process.platform !== 'darwin'` — no-ops on Linux |
| Auth (JWT, scrypt, crypto) | WORKS | Pure Node.js crypto, platform-agnostic |
| WebSocket server | WORKS | Pure JS, no native dependencies |
| SQLite DB | WORKS | On ext4 (WSL2 native fs). Do NOT put on `/mnt/c/` |
| Config/env loading | WORKS | POSIX-standard shell detection, `homedir()` returns `/home/<user>` |

### Two Minor Caveats (Not Blockers)

1. **Local Wi-Fi mode won't reach phones** — WSL2 NAT returns `172.x.x.x` IP, unreachable from LAN. Irrelevant since ngrok/SSH tunnel is the primary path.
2. **Don't put DB on `/mnt/c/`** — File permissions and SQLite WAL don't work on DrvFS. Default `~/.clsh/` is on ext4, so this is a non-issue.

---

## Security Audit — 20 Findings

### Architecture Positives (Keep These)

- Bootstrap tokens: 256-bit random, SHA-256 hashed (raw never stored), one-time use, 5-min TTL
- Password auth: scrypt with proper params (N=16384, r=8, p=1, 64-byte key, 16-byte random salt, timingSafeEqual)
- JWT algorithm validation: explicit `algorithms: ['HS256']` prevents `alg: none` attack
- Rate limiting: 5-10 req/15min per IP, proxy-aware
- Env scrubbing: sensitive vars stripped from PTY child processes (but blocklist is too narrow — see Finding 9)
- Security headers: CSP, X-Frame-Options: DENY, nosniff, strict referrer
- WebSocket: origin validation, 64KB payload limit, 5s auth timeout, ping/pong heartbeat
- PTY: max 8 sessions, shell whitelist, dimension clamping, UUID session IDs

### Finding Summary

| # | Severity | Finding | File(s) |
|---|----------|---------|---------|
| 1 | **CRITICAL** | Biometric auth bypass — credentialId leaked via unauth'd endpoint, server doesn't verify WebAuthn assertion | `server.ts`, `/api/auth/password/status` + `/api/auth/biometric` |
| 2 | **HIGH** | JWT 30-day expiry (comment says 8h), no revocation, no session binding | `auth.ts` line ~60 |
| 3 | **HIGH** | Rate limit bypass via SSH tunnel — all clients share one IP (127.0.0.1) | `server.ts` line ~115 |
| 4 | **HIGH** | No session ownership — any auth'd user can access/write/close any PTY session | `ws-handler.ts` entire `handleMessage` |
| 5 | **MEDIUM** | Bootstrap tokens accumulate on Enter — old tokens not deleted | `index.ts` line ~155-165 |
| 6 | **MEDIUM** | Unbounded stdin data (64KB) passed to PTY, amplified by tmux hex encoding | `pty-manager.ts`, `ws-handler.ts` |
| 7 | **MEDIUM** | SSH tunnel disables host key verification (StrictHostKeyChecking=no) | `tunnel.ts` lines ~75-80 |
| 8 | **MEDIUM** | Silent fallback to plaintext HTTP when tunnel fails | `tunnel.ts` lines ~130-140 |
| 9 | **MEDIUM** | Env var blocklist only strips 4 vars — AWS keys, GH_TOKEN, API keys all leak to PTY | `pty-manager.ts` `buildSafeEnv()` |
| 10 | **MEDIUM** | SQLite DB created with default permissions (~0o644, world-readable) | `db.ts` `initDatabase()` |
| 11 | **MEDIUM** | No WebSocket connection limit — non-browser clients bypass origin check | `server.ts` WebSocketServer config |
| 12 | **MEDIUM** | No audit logging for auth events, connections, or session activity | All files |
| 13 | **LOW** | Non-constant-time credentialId comparison (moot — it's already public) | `server.ts` biometric route |
| 14 | **LOW** | Client SHA-256 password hash stored alongside scrypt hash | `server.ts` `/api/auth/lock/client-hash` |
| 15 | **LOW** | tmux socket accessible to local users (default tmpdir permissions) | `tmux.ts` |
| 16 | **LOW** | 6-character minimum password for internet-facing shell access | `password.ts` |
| 17 | **INFO** | scrypt N=2^14 is low-end (OWASP recommends 2^17 for high-value) | `password.ts` |
| 18 | **INFO** | JWT alg validation is correct (positive finding) | `auth.ts` line ~80 |
| 19 | **INFO** | CSP missing explicit script-src, connect-src allows wss: to any host | `server.ts` security headers |
| 20 | **INFO** | Floating ^ versions on native deps (node-pty, better-sqlite3) | `package.json` |

---

## Detailed Findings — Critical and High

### Finding 1: Biometric Auth Bypass (CRITICAL)

**Attack**: 2 HTTP requests, no preconditions, grants full shell access.

```
Step 1: GET /api/auth/password/status
→ Returns: { credentialId: "abc123", userId: "...", biometricConfigured: true }

Step 2: POST /api/auth/biometric  { credentialId: "abc123" }
→ Returns: { token: "<30-day-JWT>" }
→ Attacker now has full shell access
```

**Root cause**: Server checks `row.credential_id !== credentialId` (string match) instead of verifying the WebAuthn cryptographic assertion. The `credentialId` is a public identifier by WebAuthn spec — it was never meant to be a secret.

**Fix options**:
- **Option A (proper)**: Implement full WebAuthn assertion verification with `@simplewebauthn/server` — verify the signature over a server-generated challenge
- **Option B (quick)**: Remove `credentialId` and `userId` from the unauthenticated `/api/auth/password/status` response. This stops the leak but biometric auth is still broken (no assertion verification)
- **Option C (simplest for our use case)**: Disable biometric auth entirely. Use password-only. Remove biometric routes.

**Recommendation**: Option C for the fork — we don't need biometric auth for this use case. Document that biometric should not be re-enabled without proper WebAuthn implementation.

### Finding 2: JWT 30-Day Expiry + No Revocation (HIGH)

**File**: `auth.ts` line ~60

```typescript
// Comment says: "Uses HS256 with an 8-hour expiry"
// Code says:
.setExpirationTime('30d')  // 30 DAYS, not 8 hours
```

The `sessions` table is written to but never checked during `verifyJWT()`. There is no logout endpoint. No IP/device binding.

**Fix**:
1. Change `'30d'` to `'8h'`
2. Add revocation check: query `sessions` table in `verifyJWT()`, reject tokens not in table
3. Add `DELETE /api/auth/logout` that removes the session record
4. Optional: bind JWT to client fingerprint (IP + user-agent hash)

### Finding 3: Rate Limit Bypass in SSH Tunnel Mode (HIGH)

**File**: `server.ts` line ~115

With `app.set('trust proxy', 1)` and SSH tunnel, all traffic arrives from `127.0.0.1`. The 5 attempts/15min limit applies globally — a single attacker exhausts the quota for everyone, OR gets 5 free attempts then waits.

**Fix**:
1. Rate limit by credential-under-test (e.g., hash of password attempt) in addition to IP
2. Add account lockout after N consecutive failures (e.g., 10 failures = 1 hour lockout)
3. For ngrok mode: verify that ngrok correctly sets X-Forwarded-For (it does)

### Finding 4: No Session Ownership (HIGH)

**File**: `ws-handler.ts`

After WebSocket auth, any client can: `session_list` (enumerate all PTYs), `session_subscribe` (read any PTY's output), `stdin` (write to any PTY), `session_close` (kill any PTY).

For single-user personal use this is **acceptable** — you ARE the only user. But if a token is compromised, the attacker gets all sessions, not just the one they'd naturally create.

**Fix (if desired)**:
- Associate each session with the JWT's `jti`
- Only allow operations on owned sessions
- Add admin flag for cross-session access

**Recommendation for fork**: Accept this risk for now (single-user tool). Document it. Revisit if sharing access with others.

---

## Detailed Findings — Medium

### Finding 5: Bootstrap Token Accumulation

Pressing Enter generates a new token but doesn't delete previous ones. If you press Enter 10 times, there are 10 valid tokens (each with independent 5-min TTL).

**Fix**: `DELETE FROM bootstrap_tokens` before inserting the new one.

### Finding 6: Unbounded stdin to PTY

64KB WebSocket messages passed directly to `pty.write()`. With tmux control mode, 64KB of input becomes ~128KB of hex commands.

**Fix**: Cap `data` field at 4KB for stdin messages. Add per-session write rate limiting.

### Finding 7: SSH Tunnel No Host Key Verification

```typescript
'-o', 'StrictHostKeyChecking=no',
'-o', 'UserKnownHostsFile=/dev/null',
```

Enables MITM on the SSH tunnel connection.

**Fix**: Pin `localhost.run` host key fingerprint.

### Finding 8: Silent Plaintext Fallback

When tunnel fails, silently falls back to `http://` local mode. Phone reconnects over cleartext.

**Fix**: Add `--no-local-fallback` flag. Log prominent warning on downgrade.

### Finding 9: Env Var Leak (Blocklist Too Narrow)

`buildSafeEnv()` only strips 4 vars: `NGROK_AUTHTOKEN`, `RESEND_API_KEY`, `JWT_SECRET`, `CLAUDECODE`. Everything else leaks to PTY sessions — including AWS keys, GitHub tokens, API keys, database URLs.

**Fix**: Switch to allowlist. Only pass: `PATH`, `HOME`, `SHELL`, `TERM`, `TERM_PROGRAM`, `USER`, `LANG`, `LC_ALL`, `COLORTERM`, `EDITOR`, `VISUAL`, `XDG_*`. Strip everything else.

### Finding 10: SQLite DB World-Readable

Database created with default umask (~0o644). Contains password hashes, credential IDs, session records.

**Fix**: `chmodSync(dbPath, 0o600)` after creation. Set `~/.clsh/` directory to `0o700`.

### Finding 11: No WebSocket Connection Limit

No `maxConnections`. Non-browser clients bypass origin check (`if (!origin) return true`). 10K connections = file descriptor exhaustion.

**Fix**: Add max concurrent connections limit (50). Add per-IP unauthenticated connection limit (5). Track and expire unauthenticated connections aggressively.

### Finding 12: No Audit Logging

No record of auth attempts, connections, session activity. Can't answer "who connected and when" after an incident.

**Fix**: Add structured JSON logging for auth events, WebSocket connections, and session lifecycle. Include timestamps, source IPs, auth method, session IDs.

---

## Remediation Plan — Prioritized

### P0 — Must Fix Before Internet Exposure

| Task | Finding | Effort | Approach |
|------|---------|--------|----------|
| Disable biometric auth | #1 | Small | Remove biometric routes and `/api/auth/password/status` credentialId field |
| Fix JWT expiry | #2 | Trivial | Change `'30d'` → `'8h'` in `auth.ts` |
| Add JWT revocation | #2 | Small | Check sessions table in `verifyJWT()`, add logout endpoint |
| Switch env vars to allowlist | #9 | Small | Rewrite `buildSafeEnv()` in `pty-manager.ts` |

### P1 — Fix Before Daily Use

| Task | Finding | Effort | Approach |
|------|---------|--------|----------|
| Add WebSocket connection limit | #11 | Small | Track connections, reject above 50, per-IP limit of 5 unauth'd |
| Increase min password length | #16 | Trivial | Change `MIN_PASSWORD_LENGTH = 6` → `12` in `password.ts` |
| Fix DB file permissions | #10 | Trivial | `chmodSync(dbPath, 0o600)`, `chmodSync(clshDir, 0o700)` |
| Clean old bootstrap tokens | #5 | Trivial | `DELETE FROM bootstrap_tokens` before insert in `index.ts` |

### P2 — Harden

| Task | Finding | Effort | Approach |
|------|---------|--------|----------|
| Add `--no-local-fallback` flag | #8 | Small | Config option, refuse to start without encrypted tunnel |
| Pin tmux socket to ~/.clsh/ | #15 | Small | Use `-S ~/.clsh/tmux.sock` instead of `-L clsh` |
| Cap stdin payload size | #6 | Small | Reject `data` > 4KB in `handleStdin` |
| Tighten CSP connect-src | #19 | Trivial | Restrict to `wss:` only (drop `ws:`) |
| Pin native dep versions | #20 | Trivial | Remove `^` from node-pty, better-sqlite3 in package.json |

### P3 — Nice to Have

| Task | Finding | Effort | Approach |
|------|---------|--------|----------|
| Add audit logging | #12 | Medium | Structured JSON logs for auth, connections, sessions |
| Add account lockout | #3 | Medium | Lock after 10 failures for 1 hour |
| Pin SSH host key | #7 | Small | Hardcode localhost.run fingerprint |
| Increase scrypt N | #17 | Trivial | Change 16384 → 131072 in `password.ts` |
| Remove client hash storage | #14 | Small | Delete `upsertClientHash` usage |

---

## Setup Instructions (WSL2)

```bash
# Prerequisites
sudo apt update && sudo apt install -y nodejs npm tmux build-essential openssh-client

# Verify Node.js 20+
node --version  # Must be >= 20

# Fork and clone
# (fork https://github.com/my-claude-utils/clsh to your GitHub account first)
git clone https://github.com/<your-account>/clsh.git
cd clsh
npm install

# ngrok setup (one-time)
sudo apt install ngrok  # or download from ngrok.com
ngrok config add-authtoken YOUR_TOKEN

# Create .env in clsh root
cat > .env << 'EOF'
NGROK_AUTHTOKEN=your_token
NGROK_STATIC_DOMAIN=your-name.ngrok-free.dev
EOF

# Run
npx clsh-dev
# Scan QR code on Android phone
```

### Using with Claude Code

```bash
# In each phone terminal session:

# Session 1: exploration (main branch)
cd /mnt/d/DecreeWise
claude

# Session 2: feature work (isolated worktree)
cd /mnt/d/DecreeWise
git worktree add ../worktree-dec-XXX -b feature/web-DEC-XXX-description
cd ../worktree-dec-XXX
claude

# Session 3: bug fix (another worktree)
cd /mnt/d/DecreeWise
git worktree add ../worktree-dec-YYY -b fix/chat-DEC-YYY-description
cd ../worktree-dec-YYY
claude
```

---

## Constraints and Risks

- **API rate limits**: Multiple Claude Code instances hitting Anthropic API simultaneously. Monitor for throttling.
- **WSL2 memory**: Each Claude Code session + PTY + tmux uses ~200-400MB. With 4 sessions, budget ~2GB.
- **ngrok free tier**: One static domain, one tunnel. If ngrok goes down, tunnel drops (add `--no-local-fallback` to prevent plaintext downgrade).
- **Single-user design**: No user isolation between sessions. Acceptable for personal use. Do not share access.

---

## Files to Modify (Quick Reference)

| File | Changes Needed |
|------|---------------|
| `packages/agent/src/auth.ts` | JWT expiry `'30d'` → `'8h'`, add revocation check in `verifyJWT()` |
| `packages/agent/src/server.ts` | Remove biometric routes, remove credentialId from status endpoint, add logout route, add WS connection limit |
| `packages/agent/src/pty-manager.ts` | Rewrite `buildSafeEnv()` as allowlist, cap stdin size |
| `packages/agent/src/db.ts` | Add `chmodSync` on DB file after creation |
| `packages/agent/src/index.ts` | Delete old bootstrap tokens before creating new ones |
| `packages/agent/src/tunnel.ts` | Add `--no-local-fallback` option |
| `packages/agent/src/tmux.ts` | Change socket path to `~/.clsh/tmux.sock` |
| `packages/agent/src/password.ts` | `MIN_PASSWORD_LENGTH = 12`, optionally increase scrypt N |
| `packages/agent/package.json` | Pin node-pty and better-sqlite3 to exact versions |
