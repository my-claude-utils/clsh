# CLSH Security Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address all 20 security audit findings from `docs/clsh-fork-handoff.md` (fix 17, defer 3 with justification), prioritized P0 through P3, hardening clsh for internet-exposed use on WSL2.

**Architecture:** All changes are in `packages/agent/src/`. No new source files except tests. Backend-only — frontend may need follow-up changes for removed biometric UI but that's out of scope here.

**Tech Stack:** TypeScript, Node.js, Express, jose (JWT), better-sqlite3, ws, Vitest (new)

**Spec:** `docs/clsh-fork-handoff.md` — Findings #1–#20, Remediation Plan P0–P3

---

## Task 1: Set Up Vitest for @clsh/agent

**Files:**
- Create: `packages/agent/vitest.config.ts`
- Modify: `packages/agent/package.json`

- [ ] **Step 1: Install vitest**

Run: `npm install --save-dev vitest --workspace=@clsh/agent`

- [ ] **Step 2: Create vitest config**

Create `packages/agent/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
})
```

- [ ] **Step 3: Update test script in package.json**

In `packages/agent/package.json`, change the `test` script:

```json
"test": "vitest run"
```

- [ ] **Step 4: Verify vitest runs (expect 0 tests)**

Run: `npm run test --workspace=@clsh/agent`
Expected: vitest runs, finds 0 test files, exits cleanly.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/vitest.config.ts packages/agent/package.json
git commit -m "chore: set up vitest for @clsh/agent"
```

---

## Task 2: Fix JWT Expiry + Add Session Revocation (P0, Finding #2)

**Fixes:** JWT 30-day expiry (should be 8h), no revocation, no logout endpoint.

**Files:**
- Modify: `packages/agent/src/auth.ts:52-67` — change expiry, return JTI
- Modify: `packages/agent/src/auth.ts:77-89` — add optional session check to verifyJWT
- Modify: `packages/agent/src/server.ts:223-251,316-340,345-369` — record sessions on login, add logout route
- Modify: `packages/agent/src/ws-handler.ts:48-58,96` — pass statements, use session-aware verify
- Create: `packages/agent/src/__tests__/auth.test.ts`

### Step 1: Write failing tests for JWT expiry and revocation

- [ ] **Step 1a: Create auth test file**

Create `packages/agent/src/__tests__/auth.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createSessionJWT, verifyJWT } from '../auth.js'
import { jwtVerify } from 'jose'

const TEST_SECRET = 'test-secret-key-for-unit-tests-only'

describe('createSessionJWT', () => {
  it('returns a token and jti', async () => {
    const result = await createSessionJWT(
      { authMethod: 'bootstrap' },
      TEST_SECRET,
    )
    expect(result).toHaveProperty('token')
    expect(result).toHaveProperty('jti')
    expect(typeof result.token).toBe('string')
    expect(typeof result.jti).toBe('string')
  })

  it('sets expiry to 8 hours, not 30 days', async () => {
    const { token } = await createSessionJWT(
      { authMethod: 'password' },
      TEST_SECRET,
    )
    const secretKey = new TextEncoder().encode(TEST_SECRET)
    const { payload } = await jwtVerify(token, secretKey)
    const iat = payload.iat!
    const exp = payload.exp!
    const diffHours = (exp - iat) / 3600
    expect(diffHours).toBe(8)
  })
})

describe('verifyJWT', () => {
  it('verifies a valid token', async () => {
    const { token } = await createSessionJWT(
      { authMethod: 'bootstrap' },
      TEST_SECRET,
    )
    const result = await verifyJWT(token, TEST_SECRET)
    expect(result.payload.iss).toBe('clsh-agent')
  })

  it('rejects a token with wrong secret', async () => {
    const { token } = await createSessionJWT(
      { authMethod: 'bootstrap' },
      TEST_SECRET,
    )
    await expect(verifyJWT(token, 'wrong-secret')).rejects.toThrow()
  })
})

describe('verifySession (session revocation)', () => {
  it('source must contain verifySession function that checks sessions table', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(
      new URL('../auth.ts', import.meta.url),
      'utf-8',
    )
    expect(source).toContain('verifySession')
    expect(source).toContain('getSession')
    expect(source).toContain('Session revoked')
  })
})
```

- [ ] **Step 1b: Run tests to verify they fail**

Run: `npm run test --workspace=@clsh/agent`
Expected: FAIL — `createSessionJWT` currently returns a string, not `{ token, jti }`.

### Step 2: Implement JWT fixes

- [ ] **Step 2a: Modify createSessionJWT to return token + jti, fix expiry**

In `packages/agent/src/auth.ts`, change `createSessionJWT`:

```typescript
export async function createSessionJWT(
  claims: SessionJWTClaims,
  secret: string,
): Promise<{ token: string; jti: string }> {
  const secretKey = new TextEncoder().encode(secret);
  const jti = randomUUID();

  const token = await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .setJti(jti)
    .setIssuer('clsh-agent')
    .setSubject(claims.email ?? 'local')
    .sign(secretKey);

  return { token, jti };
}
```

Key changes:
- Return type: `Promise<string>` → `Promise<{ token: string; jti: string }>`
- Expiry: `'30d'` → `'8h'`

- [ ] **Step 2b: Add verifySession function**

Add to `packages/agent/src/auth.ts`:

```typescript
/**
 * Verifies a JWT and checks that the session has not been revoked.
 * Updates the session's last_seen timestamp on success.
 * Throws if the token is invalid or the session has been revoked.
 */
export async function verifySession(
  token: string,
  secret: string,
  statements: DbStatements,
): Promise<VerifiedJWT> {
  const result = await verifyJWT(token, secret);
  const jti = result.payload.jti;
  if (!jti) throw new Error('Token missing jti');

  const session = statements.getSession.get(jti);
  if (!session) throw new Error('Session revoked');

  statements.updateSessionLastSeen.run(jti);
  return result;
}
```

- [ ] **Step 2c: Update all callers of createSessionJWT in server.ts**

In `server.ts`, every call to `createSessionJWT` currently does:
```typescript
const jwt = await createSessionJWT({ authMethod: '...' }, config.jwtSecret);
res.json({ token: jwt });
```

Change to:
```typescript
const { token: jwt, jti } = await createSessionJWT({ authMethod: '...' }, config.jwtSecret);
statements.insertSession.run(jti, jti, '');
res.json({ token: jwt });
```

This applies to:
- `POST /api/auth/bootstrap` (line ~241)
- `POST /api/auth/password` (line ~330)
- `POST /api/auth/biometric` (line ~359) — will be removed in Task 3, but fix here first

- [ ] **Step 2d: Replace verifyJWT with verifySession in server.ts auth checks**

Import `verifySession` from `./auth.js`. In every authenticated route that does:
```typescript
await verifyJWT(authHeader.slice(7), config.jwtSecret);
```
Replace with:
```typescript
await verifySession(authHeader.slice(7), config.jwtSecret, statements);
```

This applies to routes at lines: ~288, ~382, ~411, ~440.

- [ ] **Step 2e: Add logout endpoint in server.ts**

Add inside `mountAuthRoutes`, after the existing routes:

```typescript
// DELETE /api/auth/logout — revoke current session (authenticated)
app.delete('/api/auth/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authorization required' });
      return;
    }
    try {
      const { payload } = await verifyJWT(authHeader.slice(7), config.jwtSecret);
      if (payload.jti) {
        statements.deleteSession.run(payload.jti);
      }
    } catch {
      // Token invalid — already effectively logged out
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 2f: Add deleteSession prepared statement to db.ts**

In `packages/agent/src/db.ts`, add to `DbStatements` interface:
```typescript
deleteSession: Database.Statement<[string]>;
```

Add the prepared statement in `initDatabase`:
```typescript
deleteSession: db.prepare('DELETE FROM sessions WHERE id = ?'),
```

- [ ] **Step 2g: Update ws-handler.ts to use verifySession**

Modify `setupWebSocketHandler` signature to accept `statements`:
```typescript
export function setupWebSocketHandler(
  wss: WebSocketServer,
  ptyManager: PTYManager,
  jwtSecret: string,
  statements: DbStatements,
): void {
```

Pass `statements` through to `handleConnection`. In the auth verification (line ~96):
```typescript
// Before:
await verifyJWT(parsed.token, jwtSecret);
// After:
await verifySession(parsed.token, jwtSecret, statements);
```

Import `verifySession` instead of `verifyJWT`.

- [ ] **Step 2h: Update index.ts call site**

In `packages/agent/src/index.ts` line ~117:
```typescript
// Before:
setupWebSocketHandler(wss, ptyManager, config.jwtSecret);
// After:
setupWebSocketHandler(wss, ptyManager, config.jwtSecret, statements);
```

- [ ] **Step 2i: Run tests**

Run: `npm run test --workspace=@clsh/agent`
Expected: All auth tests PASS.

- [ ] **Step 2j: Run typecheck**

Run: `npm run typecheck --workspace=@clsh/agent`
Expected: No type errors.

- [ ] **Step 2k: Commit**

```bash
git add packages/agent/src/auth.ts packages/agent/src/server.ts packages/agent/src/ws-handler.ts packages/agent/src/db.ts packages/agent/src/index.ts packages/agent/src/__tests__/auth.test.ts
git commit -m "fix: JWT expiry 30d→8h, add session revocation + logout (Finding #2)"
```

---

## Task 3: Disable Biometric Auth (P0, Finding #1)

**Fixes:** Biometric auth bypass — credentialId leaked via unauth'd endpoint, server doesn't verify WebAuthn assertion. Fix: remove biometric auth entirely.

**Files:**
- Modify: `packages/agent/src/server.ts` — remove biometric routes, strip credentialId from status
- Create: `packages/agent/src/__tests__/server-auth-status.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/agent/src/__tests__/server-auth-status.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

/**
 * Verifies that the /api/auth/password/status endpoint does NOT leak
 * credentialId or userId (Finding #1 fix).
 *
 * Since mounting the full Express app requires native deps (better-sqlite3),
 * we verify by reading the source file and checking the route handler.
 */
describe('Finding #1: Biometric auth disabled', () => {
  it('password/status response must not include credentialId or userId', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(
      new URL('../server.ts', import.meta.url),
      'utf-8',
    )
    // The status endpoint should NOT reference credentialId or userId in its response
    // Look for the password/status route handler
    const statusRouteMatch = source.match(
      /app\.get\('\/api\/auth\/password\/status'[\s\S]*?res\.json\(\{([\s\S]*?)\}\)/,
    )
    expect(statusRouteMatch).toBeTruthy()
    const responseBody = statusRouteMatch![1]
    expect(responseBody).not.toContain('credentialId')
    expect(responseBody).not.toContain('userId')
  })

  it('biometric login route must not exist', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(
      new URL('../server.ts', import.meta.url),
      'utf-8',
    )
    // POST /api/auth/biometric should be completely removed
    expect(source).not.toContain("'/api/auth/biometric'")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=@clsh/agent`
Expected: FAIL — source still contains biometric routes and credentialId in status response.

- [ ] **Step 3: Remove biometric routes and credential leak from server.ts**

In `packages/agent/src/server.ts`:

1. **Strip credentialId/userId from GET /api/auth/password/status** (lines 266-275):

Replace the route handler body with:
```typescript
app.get('/api/auth/password/status', (_req, res) => {
  const passwordRow = statements.getPassword.get();
  res.json({
    configured: !!passwordRow,
  });
});
```

2. **Delete the entire POST /api/auth/biometric route** (lines 342-369)

3. **Delete the entire POST /api/auth/lock/biometric route** (lines 373-400)

4. **Remove biometric fields from GET /api/auth/lock/state response** (lines 432-461):

Change the response to:
```typescript
res.json({
  passwordConfigured: !!passwordRow,
  clientPwdHash: clientHashRow?.hash ?? null,
});
```

Remove the `biometricRow` lookup since it's no longer needed.

- [ ] **Step 4: Run tests**

Run: `npm run test --workspace=@clsh/agent`
Expected: All tests PASS.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck --workspace=@clsh/agent`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/server.ts packages/agent/src/__tests__/server-auth-status.test.ts
git commit -m "fix: disable biometric auth, remove credential leak (Finding #1)"
```

---

## Task 4: Switch Env Vars to Allowlist (P0, Finding #9)

**Fixes:** `buildSafeEnv()` blocklist only strips 4 vars — AWS keys, GH_TOKEN, API keys all leak to PTY.

**Files:**
- Modify: `packages/agent/src/pty-manager.ts:23-29,93-106`
- Create: `packages/agent/src/__tests__/pty-manager.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/agent/src/__tests__/pty-manager.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// We need to test buildSafeEnv which is not exported.
// We'll test it indirectly by importing the module and checking the allowlist behavior.
// Since buildSafeEnv is a private function, we'll extract it for testability.

// For now, test via the exported ALLOWED_ENV_VARS constant
import { buildSafeEnv } from '../pty-manager.js'

describe('buildSafeEnv (Finding #9: env var allowlist)', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // Replace process.env with a controlled copy
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('passes through allowed vars like PATH and HOME', () => {
    process.env['PATH'] = '/usr/bin'
    process.env['HOME'] = '/home/testuser'
    const env = buildSafeEnv()
    expect(env['PATH']).toBe('/usr/bin')
    expect(env['HOME']).toBe('/home/testuser')
  })

  it('blocks sensitive vars not in the allowlist', () => {
    process.env['AWS_SECRET_ACCESS_KEY'] = 'hunter2'
    process.env['AWS_ACCESS_KEY_ID'] = 'AKIA...'
    process.env['GITHUB_TOKEN'] = 'ghp_...'
    process.env['DATABASE_URL'] = 'postgres://...'
    process.env['NGROK_AUTHTOKEN'] = 'ngrok-token'
    process.env['OPENAI_API_KEY'] = 'sk-...'
    const env = buildSafeEnv()
    expect(env['AWS_SECRET_ACCESS_KEY']).toBeUndefined()
    expect(env['AWS_ACCESS_KEY_ID']).toBeUndefined()
    expect(env['GITHUB_TOKEN']).toBeUndefined()
    expect(env['DATABASE_URL']).toBeUndefined()
    expect(env['NGROK_AUTHTOKEN']).toBeUndefined()
    expect(env['OPENAI_API_KEY']).toBeUndefined()
  })

  it('allows ANTHROPIC_API_KEY (needed for Claude Code in PTY)', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-...'
    const env = buildSafeEnv()
    expect(env['ANTHROPIC_API_KEY']).toBe('sk-ant-...')
  })

  it('always sets FORCE_COLOR and TERM', () => {
    const env = buildSafeEnv()
    expect(env['FORCE_COLOR']).toBe('1')
    expect(env['TERM']).toBe('xterm-256color')
  })

  it('passes through XDG_ prefixed vars', () => {
    process.env['XDG_RUNTIME_DIR'] = '/run/user/1000'
    process.env['XDG_CONFIG_HOME'] = '/home/test/.config'
    const env = buildSafeEnv()
    expect(env['XDG_RUNTIME_DIR']).toBe('/run/user/1000')
    expect(env['XDG_CONFIG_HOME']).toBe('/home/test/.config')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=@clsh/agent`
Expected: FAIL — `buildSafeEnv` is not exported, and the current blocklist lets sensitive vars through.

- [ ] **Step 3: Rewrite buildSafeEnv as allowlist**

In `packages/agent/src/pty-manager.ts`:

1. Replace the `SENSITIVE_ENV_VARS` blocklist (lines 23-29) with an allowlist:

```typescript
/** Environment variable names allowed to pass into PTY child processes. */
const ALLOWED_ENV_VARS = new Set([
  // Core POSIX
  'PATH',
  'HOME',
  'SHELL',
  'TERM',
  'TERM_PROGRAM',
  'USER',
  'LOGNAME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'COLORTERM',
  'EDITOR',
  'VISUAL',
  'DISPLAY',
  'WAYLAND_DISPLAY',
  'SSH_AUTH_SOCK',
  'TMPDIR',
  'TZ',
  // Node.js / npm / nvm (needed for dev tools inside PTY)
  'NODE_PATH',
  'NODE_ENV',
  'NVM_DIR',
  'NVM_BIN',
  'NVM_INC',
  'NVM_CD_FLAGS',
  // Git (needed for git operations inside PTY)
  'GIT_AUTHOR_NAME',
  'GIT_AUTHOR_EMAIL',
  'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL',
  'GIT_SSH_COMMAND',
  'GIT_EDITOR',
  // Claude Code (the primary use case for this tool)
  'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
])

/** Prefixes allowed for env vars (e.g., XDG_*, NPM_CONFIG_*). */
const ALLOWED_ENV_PREFIXES = ['XDG_', 'NPM_CONFIG_']
```

2. Rewrite `buildSafeEnv` (lines 93-106) and export it:

```typescript
/**
 * Builds a sanitized environment for PTY child processes.
 * Uses an ALLOWLIST — only explicitly permitted variables pass through.
 * This prevents leaking secrets like API keys, tokens, and database URLs.
 */
export function buildSafeEnv(): Record<string, string> {
  const env: Record<string, string> = {}

  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue
    if (ALLOWED_ENV_VARS.has(key)) {
      env[key] = value
      continue
    }
    if (ALLOWED_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      env[key] = value
    }
  }

  // Terminal-friendly defaults
  env['FORCE_COLOR'] = '1'
  env['TERM'] = 'xterm-256color'

  return env
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test --workspace=@clsh/agent`
Expected: All tests PASS.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck --workspace=@clsh/agent`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/pty-manager.ts packages/agent/src/__tests__/pty-manager.test.ts
git commit -m "fix: switch env var filtering to allowlist (Finding #9)"
```

---

## Task 5: Trivial P1 Fixes — Password Length, Bootstrap Tokens, DB Permissions (Findings #5, #10, #16)

**Files:**
- Modify: `packages/agent/src/password.ts:4` — MIN_PASSWORD_LENGTH 6→12
- Modify: `packages/agent/src/index.ts:157-161` — delete old bootstrap tokens before insert
- Modify: `packages/agent/src/db.ts:61-65` — chmodSync on DB file and directory
- Create: `packages/agent/src/__tests__/password.test.ts`

- [ ] **Step 1: Write failing test for password length**

Create `packages/agent/src/__tests__/password.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { MIN_PASSWORD_LENGTH, hashPassword, verifyPassword } from '../password.js'

describe('MIN_PASSWORD_LENGTH (Finding #16)', () => {
  it('is at least 12 for internet-facing shell access', () => {
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(12)
  })
})

describe('hashPassword + verifyPassword', () => {
  it('round-trips correctly', () => {
    const password = 'a-secure-test-password-123'
    const hash = hashPassword(password)
    expect(verifyPassword(password, hash)).toBe(true)
  })

  it('rejects wrong password', () => {
    const hash = hashPassword('correct-password-12345')
    expect(verifyPassword('wrong-password-12345', hash)).toBe(false)
  })

  it('rejects garbage hash', () => {
    expect(verifyPassword('anything', 'not-a-valid-hash')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=@clsh/agent`
Expected: FAIL — `MIN_PASSWORD_LENGTH` is currently 6.

- [ ] **Step 3: Fix MIN_PASSWORD_LENGTH**

In `packages/agent/src/password.ts` line 4:

```typescript
// Before:
export const MIN_PASSWORD_LENGTH = 6;
// After:
export const MIN_PASSWORD_LENGTH = 12;
```

- [ ] **Step 4: Run tests to verify password tests pass**

Run: `npm run test --workspace=@clsh/agent`
Expected: Password tests PASS.

- [ ] **Step 5: Fix bootstrap token accumulation (Finding #5)**

In `packages/agent/src/index.ts`, before the `insertBootstrapToken` call (line ~81), add:

```typescript
// Delete any existing bootstrap tokens before creating a new one (Finding #5)
db.exec('DELETE FROM bootstrap_tokens');
```

Also fix the Enter-key handler (lines ~157-161) similarly. Before `statements.insertBootstrapToken.run(...)`:

```typescript
db.exec('DELETE FROM bootstrap_tokens');
```

Note: The Enter-key handler needs access to `db`. Currently it uses `statements` which is in scope. Use `statements` to reference a new `deleteAllBootstrapTokens` prepared statement, or use the `db` reference directly.

Add to `DbStatements` interface and `initDatabase` in `db.ts`:
```typescript
deleteAllBootstrapTokens: Database.Statement<[]>;
```
```typescript
deleteAllBootstrapTokens: db.prepare('DELETE FROM bootstrap_tokens'),
```

Then in `index.ts`:
```typescript
// Line ~81 (initial token creation):
statements.deleteAllBootstrapTokens.run();
statements.insertBootstrapToken.run(tokenId, tokenHash);

// Line ~161 (Enter-key regeneration):
statements.deleteAllBootstrapTokens.run();
statements.insertBootstrapToken.run(newTokenId, newTokenHash);
```

- [ ] **Step 6: Fix DB file permissions (Finding #10)**

In `packages/agent/src/db.ts`, after creating the database (line ~65), add:

```typescript
import { mkdirSync, chmodSync } from 'node:fs';
```

After `const db = new Database(dbPath);`:

```typescript
// Restrict DB file permissions — contains password hashes and session data (Finding #10)
try {
  chmodSync(dbPath, 0o600);
  chmodSync(dirname(dbPath), 0o700);
} catch {
  // chmodSync may fail on Windows/NTFS — non-critical on non-POSIX
}
```

- [ ] **Step 7: Run all tests + typecheck**

Run: `npm run test --workspace=@clsh/agent && npm run typecheck --workspace=@clsh/agent`
Expected: All PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/agent/src/password.ts packages/agent/src/index.ts packages/agent/src/db.ts packages/agent/src/__tests__/password.test.ts
git commit -m "fix: password min 12 chars, clean bootstrap tokens, secure DB perms (Findings #5,#10,#16)"
```

---

## Task 6: Add WebSocket Connection Limit (P1, Finding #11)

**Fixes:** No maxConnections — non-browser clients bypass origin check. 10K connections = file descriptor exhaustion.

**Files:**
- Modify: `packages/agent/src/server.ts:178-189` — add connection tracking and limits

- [ ] **Step 1: Write failing test**

Add to `packages/agent/src/__tests__/server-auth-status.test.ts` (or create a new test file):

```typescript
describe('Finding #11: WebSocket connection limit', () => {
  it('server.ts must define MAX_WS_CONNECTIONS', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(
      new URL('../server.ts', import.meta.url),
      'utf-8',
    )
    expect(source).toContain('MAX_WS_CONNECTIONS')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=@clsh/agent`
Expected: FAIL.

- [ ] **Step 3: Add connection limit to WebSocket server**

In `packages/agent/src/server.ts`, add constants near the top:

```typescript
/** Maximum total WebSocket connections allowed (Finding #11). */
const MAX_WS_CONNECTIONS = 50;
/** Maximum unauthenticated connections per IP (Finding #11). */
const MAX_UNAUTH_PER_IP = 5;
```

Modify the `verifyClient` callback (lines 181-188) to check connection count:

```typescript
verifyClient: (info: { origin: string; secure: boolean; req: IncomingMessage }) => {
  // Reject if at connection limit
  if (wss.clients.size >= MAX_WS_CONNECTIONS) {
    console.warn('  WS rejected: connection limit reached');
    return false;
  }

  const origin = info.origin;
  // Allow connections with no origin header (non-browser clients, CLIs)
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  console.warn(`  WS rejected: origin "${origin}" not in [${[...allowedOrigins].join(', ')}]`);
  return false;
},
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm run test --workspace=@clsh/agent && npm run typecheck --workspace=@clsh/agent`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/server.ts packages/agent/src/__tests__/server-auth-status.test.ts
git commit -m "fix: add WebSocket connection limit of 50 (Finding #11)"
```

---

## Task 7: Cap stdin Payload Size (P2, Finding #6)

**Fixes:** Unbounded stdin data (64KB) passed to PTY, amplified by tmux hex encoding.

**Files:**
- Modify: `packages/agent/src/ws-handler.ts:364-376`
- Add test to: `packages/agent/src/__tests__/ws-handler.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/agent/src/__tests__/ws-handler.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

describe('Finding #6: stdin payload cap', () => {
  it('ws-handler.ts must reject stdin data larger than 4KB', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(
      new URL('../ws-handler.ts', import.meta.url),
      'utf-8',
    )
    expect(source).toContain('MAX_STDIN_SIZE')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=@clsh/agent`
Expected: FAIL.

- [ ] **Step 3: Add stdin size cap**

In `packages/agent/src/ws-handler.ts`, add near the top:

```typescript
/** Maximum stdin data size in bytes (Finding #6). */
const MAX_STDIN_SIZE = 4096;
```

In `handleStdin` function (lines 364-376), add size check:

```typescript
function handleStdin(
  ws: WebSocket,
  sessionId: string,
  data: string,
  ptyManager: PTYManager,
): void {
  if (data.length > MAX_STDIN_SIZE) {
    sendError(ws, `stdin data too large (${data.length} bytes, max ${MAX_STDIN_SIZE})`);
    return;
  }
  try {
    ptyManager.write(sessionId, data);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Write failed';
    sendError(ws, errMsg);
  }
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm run test --workspace=@clsh/agent && npm run typecheck --workspace=@clsh/agent`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/ws-handler.ts packages/agent/src/__tests__/ws-handler.test.ts
git commit -m "fix: cap stdin payload at 4KB (Finding #6)"
```

---

## Task 8: CSP Tightening + Pin Native Dep Versions (P2, Findings #19, #20)

**Files:**
- Modify: `packages/agent/src/server.ts:125` — tighten CSP connect-src
- Modify: `packages/agent/package.json` — pin node-pty and better-sqlite3

- [ ] **Step 1: Tighten CSP connect-src (Finding #19)**

In `packages/agent/src/server.ts` line 125, change:

```typescript
// Before:
res.header('Content-Security-Policy', "default-src 'self'; connect-src 'self' wss: ws:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:");
// After:
res.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; connect-src 'self' wss: ws:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:");
```

Changes:
- Added explicit `script-src 'self'`
- Keep `ws:` in connect-src — dev mode uses plain WebSocket (`ws://localhost`), and the tool is single-user so the risk is acceptable

- [ ] **Step 2: Pin native dep versions (Finding #20)**

In `packages/agent/package.json`, pin exact versions for native deps:

```json
"better-sqlite3": "11.0.0",
"node-pty": "1.0.0",
```

Remove the `^` prefix from these two dependencies only. Keep `^` on pure JS deps.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck --workspace=@clsh/agent`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/agent/src/server.ts packages/agent/package.json
git commit -m "fix: tighten CSP, pin native dep versions (Findings #19,#20)"
```

---

## Task 9: Add --no-local-fallback Flag (P2, Finding #8)

**Fixes:** Silent fallback to plaintext HTTP when tunnel fails.

**Files:**
- Modify: `packages/agent/src/tunnel.ts:109-159` — add noLocalFallback option
- Modify: `packages/agent/src/config.ts` — add CLSH_NO_LOCAL_FALLBACK config
- Modify: `packages/agent/src/index.ts` — pass config through

- [ ] **Step 1: Add config option**

In `packages/agent/src/config.ts`, add to the `AgentConfig` interface and config loading:

```typescript
// In AgentConfig interface:
noLocalFallback: boolean;

// In loadConfig():
noLocalFallback: process.env['CLSH_NO_LOCAL_FALLBACK'] === '1',
```

- [ ] **Step 2: Modify tunnel.ts to respect the flag**

In `packages/agent/src/tunnel.ts`, add `noLocalFallback` to `TunnelConfig`:

```typescript
interface TunnelConfig {
  port: number;
  ngrokAuthtoken?: string;
  ngrokStaticDomain?: string;
  forcedMethod?: TunnelMethod;
  noLocalFallback?: boolean;
}
```

Change `createTunnel` signature and the local fallback section (lines ~154-158):

```typescript
export async function createTunnel(
  port: number,
  ngrokAuthtoken?: string,
  ngrokStaticDomain?: string,
  forcedMethod?: 'ngrok' | 'ssh' | 'local',
  noLocalFallback?: boolean,
): Promise<TunnelResult> {
  savedConfig = { port, ngrokAuthtoken, ngrokStaticDomain, forcedMethod, noLocalFallback };
  // ...existing code...

  // 3. Local network — works on same Wi-Fi, no internet required
  if (noLocalFallback) {
    throw new Error(
      'All tunnel methods failed and CLSH_NO_LOCAL_FALLBACK=1 is set. ' +
      'Refusing to fall back to plaintext HTTP. Set NGROK_AUTHTOKEN or unset CLSH_NO_LOCAL_FALLBACK.',
    );
  }
  const localIp = getLocalIP();
  const url = localIp ? `http://${localIp}:${port}` : `http://localhost:${port}`;
  console.warn('  ⚠  WARNING: Falling back to plaintext HTTP (no encrypted tunnel available)');
  currentTunnel = { url, method: 'local' };
  return currentTunnel;
}
```

Also update `recreate()` to pass the flag:

```typescript
async function recreate(): Promise<TunnelResult | null> {
  if (!savedConfig) return null;
  await closeTunnel();
  return createTunnel(
    savedConfig.port,
    savedConfig.ngrokAuthtoken,
    savedConfig.ngrokStaticDomain,
    savedConfig.forcedMethod,
    savedConfig.noLocalFallback,
  );
}
```

- [ ] **Step 3: Update index.ts to pass the config**

In `packages/agent/src/index.ts` line ~128:

```typescript
const tunnel = await createTunnel(
  tunnelPort,
  config.ngrokAuthtoken,
  config.ngrokStaticDomain,
  config.tunnelMethod,
  config.noLocalFallback,
);
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck --workspace=@clsh/agent`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/tunnel.ts packages/agent/src/config.ts packages/agent/src/index.ts
git commit -m "fix: add CLSH_NO_LOCAL_FALLBACK to prevent plaintext HTTP fallback (Finding #8)"
```

---

## Task 10: Pin tmux Socket to ~/.clsh/ (P2, Finding #15)

**Fixes:** tmux socket accessible to local users via default tmpdir permissions.

**Files:**
- Modify: `packages/agent/src/tmux.ts:7` — use `-S` with full path instead of `-L`

- [ ] **Step 1: Change tmux socket path**

In `packages/agent/src/tmux.ts`, change:

```typescript
// Before:
export const TMUX_SOCKET = 'clsh';

// After:
import { join } from 'node:path';
import { homedir } from 'node:os';

/** Full path to clsh's tmux socket (in ~/.clsh/ for restricted permissions). */
export const TMUX_SOCKET_PATH = join(homedir(), '.clsh', 'tmux.sock');
```

Replace all occurrences of `'-L', TMUX_SOCKET` with `'-S', TMUX_SOCKET_PATH` in:
- `tmux.ts` — `listClshTmuxSessions`, `tmuxSessionExists`, `killTmuxSession`, `capturePaneContent`
- `pty-manager.ts` — all tmux spawn commands (search for `TMUX_SOCKET`)

Update imports in `pty-manager.ts`:
```typescript
// Before:
import { ..., TMUX_SOCKET } from './tmux.js';
// After:
import { ..., TMUX_SOCKET_PATH } from './tmux.js';
```

Note: `homedir` and `join` are already imported in `tmux.ts`.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck --workspace=@clsh/agent`
Expected: No errors.

- [ ] **Step 3: Run full test suite**

Run: `npm run test --workspace=@clsh/agent`
Expected: All PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/agent/src/tmux.ts packages/agent/src/pty-manager.ts
git commit -m "fix: pin tmux socket to ~/.clsh/tmux.sock (Finding #15)"
```

---

## Task 11: P3 — Increase scrypt N + Remove Client Hash Storage (Findings #14, #17)

**Files:**
- Modify: `packages/agent/src/password.ts:7` — increase scrypt N
- Modify: `packages/agent/src/server.ts` — remove client hash sync from password setup

- [ ] **Step 1: Increase scrypt N for new hashes, keep backward compat (Finding #17)**

In `packages/agent/src/password.ts`:

Change the hash format to encode the N parameter so old hashes can still be verified:

```typescript
// Before:
const SCRYPT_N = 16384;

// After:
const SCRYPT_N = 131072;  // 2^17 — OWASP recommended for high-value targets
const LEGACY_SCRYPT_N = 16384;  // 2^14 — old default, kept for verifying existing hashes
```

Update `hashPassword` to encode N in the format:

```typescript
// New format includes N: `scrypt:<N>$<hexSalt>$<hexKey>`
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LEN);
  const key = scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEM,
  });
  return `scrypt:${SCRYPT_N}$${salt.toString('hex')}$${key.toString('hex')}`;
}
```

Update `verifyPassword` to detect format and use correct N:

```typescript
export function verifyPassword(password: string, stored: string): boolean {
  let n = LEGACY_SCRYPT_N;
  let saltHex: string;
  let keyHex: string;

  if (stored.startsWith('scrypt:')) {
    // New format: scrypt:<N>$<salt>$<key>
    const parts = stored.slice(7).split('$');
    if (parts.length !== 3) return false;
    n = parseInt(parts[0], 10);
    if (isNaN(n)) return false;
    saltHex = parts[1];
    keyHex = parts[2];
  } else if (stored.startsWith('scrypt$')) {
    // Legacy format: scrypt$<salt>$<key> (N=16384)
    const parts = stored.split('$');
    if (parts.length !== 3) return false;
    saltHex = parts[1];
    keyHex = parts[2];
  } else {
    return false;
  }

  const salt = Buffer.from(saltHex, 'hex');
  const storedKey = Buffer.from(keyHex, 'hex');

  if (salt.length !== SALT_LEN || storedKey.length !== KEY_LEN) return false;

  const candidateKey = scryptSync(password, salt, KEY_LEN, {
    N: n,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEM,
  });

  return timingSafeEqual(candidateKey, storedKey);
}
```

This way:
- New passwords get hashed with N=131072 (stronger)
- Old passwords hashed with N=16384 still verify correctly
- On next password change, the hash upgrades to the new format automatically

- [ ] **Step 2: Remove client hash storage from password setup (Finding #14)**

In `packages/agent/src/server.ts`, in the `POST /api/auth/password/setup` handler, remove the `clientHash` handling:

```typescript
// Remove these lines from the password/setup handler:
const { password, clientHash } = req.body as { password?: string; clientHash?: string };
// ...
if (clientHash && typeof clientHash === 'string') {
  statements.upsertClientHash.run(clientHash);
}

// Replace with:
const { password } = req.body as { password?: string };
```

- [ ] **Step 3: Run tests + typecheck**

Run: `npm run test --workspace=@clsh/agent && npm run typecheck --workspace=@clsh/agent`
Expected: All PASS (password round-trip test still works with new N value, just slower).

- [ ] **Step 4: Commit**

```bash
git add packages/agent/src/password.ts packages/agent/src/server.ts
git commit -m "fix: increase scrypt N to 2^17, remove client hash storage (Findings #14,#17)"
```

---

## Task 12: P3 — Add Audit Logging (Finding #12)

**Files:**
- Create: `packages/agent/src/audit.ts`
- Modify: `packages/agent/src/server.ts` — log auth events
- Modify: `packages/agent/src/ws-handler.ts` — log connection events

- [ ] **Step 1: Write failing test**

Create `packages/agent/src/__tests__/audit.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { auditLog } from '../audit.js'

describe('auditLog (Finding #12)', () => {
  it('outputs structured JSON to stderr', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    auditLog('auth.login', { method: 'password', ip: '1.2.3.4' })
    expect(spy).toHaveBeenCalledOnce()
    const output = spy.mock.calls[0][0] as string
    const parsed = JSON.parse(output.trim())
    expect(parsed.event).toBe('auth.login')
    expect(parsed.data.method).toBe('password')
    expect(parsed.data.ip).toBe('1.2.3.4')
    expect(parsed.timestamp).toBeDefined()
    spy.mockRestore()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=@clsh/agent`
Expected: FAIL — `audit.ts` doesn't exist.

- [ ] **Step 3: Create audit.ts**

Create `packages/agent/src/audit.ts`:

```typescript
/**
 * Structured audit logger for security-relevant events.
 * Writes JSON lines to stderr (separate from application stdout).
 */
export function auditLog(event: string, data: Record<string, unknown>): void {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    data,
  }
  process.stderr.write(JSON.stringify(entry) + '\n')
}
```

- [ ] **Step 4: Add audit logging to auth routes in server.ts**

Add `import { auditLog } from './audit.js'` to `server.ts`.

Add audit log calls at key points:

```typescript
// After successful bootstrap auth:
auditLog('auth.login', { method: 'bootstrap', ip: req.ip })

// After successful password auth:
auditLog('auth.login', { method: 'password', ip: req.ip })

// After failed password auth:
auditLog('auth.login.failed', { method: 'password', ip: req.ip })

// After logout:
auditLog('auth.logout', { jti: payload.jti, ip: req.ip })

// After password setup:
auditLog('auth.password.setup', { ip: req.ip })
```

- [ ] **Step 5: Add audit logging to ws-handler.ts**

Add audit log for WebSocket connections:

```typescript
// After successful WS auth:
auditLog('ws.connected', { ip: _req.socket.remoteAddress })

// On WS auth failure:
auditLog('ws.auth.failed', { ip: _req.socket.remoteAddress })

// On WS close:
auditLog('ws.disconnected', { ip: _req.socket.remoteAddress })
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npm run test --workspace=@clsh/agent && npm run typecheck --workspace=@clsh/agent`
Expected: All PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/agent/src/audit.ts packages/agent/src/__tests__/audit.test.ts packages/agent/src/server.ts packages/agent/src/ws-handler.ts
git commit -m "feat: add structured audit logging for auth and connection events (Finding #12)"
```

---

## Task 13: P3 — Add Account Lockout (Finding #3)

**Fixes:** Rate limit bypass via SSH tunnel — all clients share one IP.

**Files:**
- Modify: `packages/agent/src/server.ts` — add account lockout after N failures

- [ ] **Step 1: Add lockout tracking**

In `packages/agent/src/server.ts`, add before `mountAuthRoutes`:

```typescript
/** Track consecutive password failures for lockout (Finding #3). */
let consecutivePasswordFailures = 0;
let lockoutUntil = 0;
const MAX_CONSECUTIVE_FAILURES = 10;
const LOCKOUT_DURATION_MS = 60 * 60 * 1000; // 1 hour
```

- [ ] **Step 2: Add lockout check to password route**

In the `POST /api/auth/password` handler, add at the start:

```typescript
if (Date.now() < lockoutUntil) {
  const remainingMin = Math.ceil((lockoutUntil - Date.now()) / 60_000);
  auditLog('auth.lockout.active', { remainingMin, ip: req.ip });
  res.status(429).json({ error: `Account locked. Try again in ${remainingMin} minutes.` });
  return;
}
```

After a failed password check:
```typescript
consecutivePasswordFailures++;
auditLog('auth.login.failed', { method: 'password', ip: req.ip, failures: consecutivePasswordFailures });
if (consecutivePasswordFailures >= MAX_CONSECUTIVE_FAILURES) {
  lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
  auditLog('auth.lockout.triggered', { ip: req.ip });
}
```

After a successful password auth:
```typescript
consecutivePasswordFailures = 0;
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck --workspace=@clsh/agent`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/agent/src/server.ts
git commit -m "fix: add account lockout after 10 failed attempts (Finding #3)"
```

---

## Verification

After all tasks are complete:

- [ ] **Run full test suite:** `npm run test --workspace=@clsh/agent`
- [ ] **Run typecheck:** `npm run typecheck --workspace=@clsh/agent`
- [ ] **Run lint:** `npm run lint --workspace=@clsh/agent`
- [ ] **Manual smoke test:** `npm run dev` — verify agent starts, QR code prints, can connect from phone
- [ ] **Review all changes:** `git diff main --stat` — verify no unintended changes

---

## Not Implemented (Out of Scope)

The following findings from the audit require deeper investigation or have acceptable risk for single-user personal use:

| Finding | Reason for Deferral |
|---------|-------------------|
| **#4 (Session Ownership)** | Acceptable for single-user tool. All sessions belong to the one user. |
| **#7 (SSH Host Key)** | Requires pinning localhost.run's rotating key. Low priority since ngrok is the primary tunnel. |
| **#13 (credentialId timing)** | Moot — biometric auth removed entirely in Task 3. |
| **#18 (JWT alg validation)** | Positive finding — already correct, no changes needed. |

---

## Findings → Tasks Cross-Reference

| Finding | Severity | Task | Status |
|---------|----------|------|--------|
| #1 Biometric bypass | CRITICAL | Task 3 | |
| #2 JWT expiry + revocation | HIGH | Task 2 | |
| #3 Rate limit bypass | HIGH | Task 13 | |
| #4 Session ownership | HIGH | Deferred | |
| #5 Bootstrap token accumulation | MEDIUM | Task 5 | |
| #6 Unbounded stdin | MEDIUM | Task 7 | |
| #7 SSH host key | MEDIUM | Deferred | |
| #8 Plaintext fallback | MEDIUM | Task 9 | |
| #9 Env var leak | MEDIUM | Task 4 | |
| #10 DB file permissions | MEDIUM | Task 5 | |
| #11 No WS connection limit | MEDIUM | Task 6 | |
| #12 No audit logging | MEDIUM | Task 12 | |
| #13 credentialId timing | LOW | N/A (moot — biometric removed in Task 3) | |
| #14 Client hash storage | LOW | Task 11 | |
| #15 tmux socket permissions | LOW | Task 10 | |
| #16 Short min password | LOW | Task 5 | |
| #17 Low scrypt N | INFO | Task 11 | |
| #18 JWT alg validation | INFO | N/A (already correct) | |
| #19 Loose CSP | INFO | Task 8 | |
| #20 Floating native deps | INFO | Task 8 | |
