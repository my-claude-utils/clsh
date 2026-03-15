import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

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

export function loadConfig(): AgentConfig {
  // Priority: env vars > .env > ~/.clsh/config.json > defaults
  loadDotEnv();
  const fileConfig = loadConfigFile();

  const clshDir = join(homedir(), '.clsh');
  const defaultDbPath = join(clshDir, 'clsh.db');
  const port = parseInt(getEnv('PORT') ?? (fileConfig.port != null ? String(fileConfig.port) : '4030'), 10);

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
  };
}
