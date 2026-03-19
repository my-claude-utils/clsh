import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import type { DefaultableShell } from './types.js';

export interface AgentConfig {
  port: number;
  /** Port that the ngrok tunnel should forward to.
   *  In dev, set WEB_PORT=4031 so the tunnel hits the Vite dev server
   *  (which proxies /api and /ws to the agent). In production this
   *  defaults to `port` because the agent serves the built web UI. */
  webPort: number;
  jwtSecret: string;
  ngrokAuthtoken: string | undefined;
  /** Optional static ngrok domain (e.g. "my-name.ngrok-free.app").
   *  Free ngrok accounts get one static domain — set NGROK_STATIC_DOMAIN
   *  in .env to keep the same URL across restarts. */
  ngrokStaticDomain: string | undefined;
  /** Force a specific tunnel method: 'ngrok', 'ssh', or 'local'.
   *  If unset, auto-detects (ngrok → ssh → local). Set TUNNEL=ssh to skip ngrok. */
  tunnelMethod: 'ngrok' | 'ssh' | 'local' | undefined;
  resendApiKey: string | undefined;
  dbPath: string;
  /** Set CLSH_NO_TMUX=1 to disable tmux session persistence even when tmux is available. */
  tmuxDisabled: boolean;
  /** Resolved default shell for new terminal sessions.
   *  Set CLSH_SHELL=bash|zsh to override; otherwise auto-detected at startup. */
  defaultShell: DefaultableShell;
}

interface ClshConfigFile {
  ngrokAuthtoken?: string;
  ngrokStaticDomain?: string;
  port?: number;
}

/**
 * Loads variables from a .env file into process.env.
 * Only sets variables that are not already set (process env takes precedence).
 * Silently no-ops if the file doesn't exist.
 *
 * Handles:
 *   KEY=value
 *   KEY="quoted value"
 *   # comments
 *   blank lines
 */
/**
 * Parses .env content and sets unset env vars.
 */
function parseDotEnvContent(content: string): void {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    if (!key) continue;

    // Strip optional surrounding quotes from the value
    const raw = trimmed.slice(eqIdx + 1).trim();
    const value = raw.replace(/^(['"])(.*)\1$/, '$2');

    // Don't override values that are already set in the environment
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function loadDotEnv(): void {
  // Try multiple candidate paths for .env:
  // 1. Monorepo root (packages/agent/src/ -> repo root)
  // 2. Current working directory
  const candidates = [
    resolve(import.meta.dirname, '..', '..', '..', '.env'),
    resolve(process.cwd(), '.env'),
  ];

  for (const envPath of candidates) {
    try {
      const content = readFileSync(envPath, 'utf-8');
      parseDotEnvContent(content);
      return; // Use the first .env we find
    } catch {
      // Not found at this path, try next
    }
  }
  // No .env found — that's fine, env vars may be set externally or via config.json
}

/**
 * Reads ~/.clsh/config.json if it exists.
 * Returns parsed config or empty object.
 */
function loadConfigFile(): ClshConfigFile {
  try {
    const configPath = join(homedir(), '.clsh', 'config.json');
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as ClshConfigFile;
  } catch {
    return {};
  }
}

function getEnv(key: string): string | undefined {
  return process.env[key];
}

/**
 * Returns a persistent JWT secret stored at ~/.clsh/jwt_secret.
 * Generated once on first run; reused on every subsequent restart so
 * the phone's stored JWT stays valid across `npm run dev` restarts.
 * Override with JWT_SECRET env var if needed.
 */
function getOrCreateJwtSecret(clshDir: string): string {
  const secretPath = join(clshDir, 'jwt_secret');
  if (existsSync(secretPath)) {
    try {
      const stored = readFileSync(secretPath, 'utf-8').trim();
      if (stored.length > 10) return stored;
    } catch { /* fall through */ }
  }
  const secret = randomBytes(32).toString('base64url');
  try {
    mkdirSync(clshDir, { recursive: true });
    writeFileSync(secretPath, secret, { mode: 0o600 }); // owner-readable only
  } catch { /* ignore write errors */ }
  return secret;
}

const DEFAULTABLE_SHELLS: ReadonlyArray<DefaultableShell> = ['zsh', 'bash'];

function isDefaultableShell(value: string): value is DefaultableShell {
  return DEFAULTABLE_SHELLS.includes(value as DefaultableShell);
}

function shellExists(shell: string): boolean {
  try {
    execFileSync('sh', ['-c', 'command -v -- "$1"', '--', shell], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves the default shell for new terminal sessions.
 * Priority: CLSH_SHELL env var > auto-detect (zsh > bash).
 * Returns the shell and the source for startup logging.
 */
function detectDefaultShell(): { shell: DefaultableShell; source: string } {
  const override = getEnv('CLSH_SHELL');
  if (override) {
    if (!isDefaultableShell(override)) {
      throw new Error(
        `Invalid CLSH_SHELL value: "${override}". Valid options: ${DEFAULTABLE_SHELLS.join(', ')}`,
      );
    }
    if (!shellExists(override)) {
      throw new Error(
        `CLSH_SHELL is set to "${override}" but it is not installed. Install it or choose another shell.`,
      );
    }
    return { shell: override, source: 'CLSH_SHELL' };
  }

  for (const candidate of DEFAULTABLE_SHELLS) {
    if (shellExists(candidate)) {
      return { shell: candidate, source: 'auto-detected' };
    }
  }

  throw new Error(
    `No supported shell found. Install one of: ${DEFAULTABLE_SHELLS.join(', ')}`,
  );
}

export function loadConfig(): AgentConfig {
  // Priority: env vars > .env > ~/.clsh/config.json > defaults
  loadDotEnv();
  const fileConfig = loadConfigFile();

  const clshDir = join(homedir(), '.clsh');
  const defaultDbPath = join(clshDir, 'clsh.db');
  const port = parseInt(getEnv('PORT') ?? (fileConfig.port != null ? String(fileConfig.port) : '4030'), 10);
  const { shell: defaultShell, source: shellSource } = detectDefaultShell();
  console.log(`  Default shell: ${defaultShell} (${shellSource})`);

  return {
    port,
    webPort: parseInt(getEnv('WEB_PORT') ?? String(port), 10),
    jwtSecret: getEnv('JWT_SECRET') ?? getOrCreateJwtSecret(clshDir),
    tunnelMethod: getEnv('TUNNEL') as AgentConfig['tunnelMethod'],
    ngrokAuthtoken: getEnv('NGROK_AUTHTOKEN') ?? fileConfig.ngrokAuthtoken,
    ngrokStaticDomain: getEnv('NGROK_STATIC_DOMAIN') ?? fileConfig.ngrokStaticDomain,
    resendApiKey: getEnv('RESEND_API_KEY'),
    dbPath: getEnv('DB_PATH') ?? defaultDbPath,
    tmuxDisabled: getEnv('CLSH_NO_TMUX') === '1',
    defaultShell,
  };
}
